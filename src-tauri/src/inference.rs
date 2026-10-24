//! Native AI inference for the desktop app (ONNX Runtime, CPU).
//!
//! The WebView prepares the input tensor and post-processes the output with the same code as
//! the web version (src/lib/tensor.ts), so both engines produce the same masks; only the
//! `session.run` step moves here. Measured on the reference machine: ~1.1 s instead of ~4.7 s
//! in WebKitGTK's WASM, with a lower memory peak (docs/performance.md).

use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Write,
    path::PathBuf,
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::{
    AppHandle, Manager, State,
    ipc::{InvokeBody, Request, Response},
};

/// Models the desktop app accepts. Must match src/lib/models.ts (checked by a unit test).
/// BiRefNet-lite is deliberately absent: on CPU it needs ~7.7 GB of RAM (measured).
pub struct ModelSpec {
    pub id: &'static str,
    pub sha256: &'static str,
    pub bytes: usize,
    pub input_size: usize,
}

pub const MODELS: &[ModelSpec] = &[ModelSpec {
    id: "isnet-int8",
    sha256: "9f5c5fa3ccc771612d5290a648f055f94a4fa4ce289c6b3df7258e7e10e87a42",
    bytes: 44_348_381,
    input_size: 1024,
}];

/// After this much inactivity the session (and its ~1 GB of buffers) is dropped. Re-loading
/// costs ~0.5 s (measured: first run 1.8 s vs 1.3 s), so memory is given back quickly.
const IDLE: Duration = Duration::from_secs(15);
const MAX_THREADS: usize = 4;

fn spec(id: &str) -> Result<&'static ModelSpec, String> {
    MODELS
        .iter()
        .find(|m| m.id == id)
        .ok_or_else(|| format!("unknown model: {id}"))
}

fn model_path(app: &AppHandle, m: &ModelSpec) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("models");
    Ok(dir.join(format!("{}.onnx", m.id)))
}

fn header<'a>(request: &'a Request<'_>, name: &str) -> Result<&'a str, String> {
    request
        .headers()
        .get(name)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| format!("missing header {name}"))
}

fn raw_body(request: &Request<'_>) -> Result<Vec<u8>, String> {
    match request.body() {
        InvokeBody::Raw(bytes) => Ok(bytes.clone()),
        _ => Err("expected a binary body".into()),
    }
}

struct Loaded {
    id: &'static str,
    session: ort::session::Session,
    last_used: Instant,
}

pub struct Engine {
    env: ort::environment::Environment,
    loaded: Mutex<Option<Loaded>>,
}

impl Engine {
    pub fn new() -> Result<Self, String> {
        let env = ort::init()
            .with_name("libreroom")
            .build()
            .map_err(|e| e.to_string())?;
        Ok(Self {
            env,
            loaded: Mutex::new(None),
        })
    }

    /// Drops the session when idle. Called periodically from a background thread.
    pub fn release_if_idle(&self) {
        if let Ok(mut guard) = self.loaded.try_lock()
            && guard.as_ref().is_some_and(|l| l.last_used.elapsed() > IDLE)
        {
            *guard = None;
            trim_heap();
        }
    }

    fn run(
        &self,
        path: PathBuf,
        m: &'static ModelSpec,
        input: Vec<f32>,
    ) -> Result<Vec<f32>, String> {
        let mut guard = self.loaded.lock().map_err(|e| e.to_string())?;
        if guard.as_ref().is_none_or(|l| l.id != m.id) {
            *guard = None; // free the previous model first
            let threads =
                std::thread::available_parallelism().map_or(1, |n| n.get().min(MAX_THREADS));
            let err = |e: ort::Error<_>| e.to_string();
            let session = ort::session::Session::builder(&self.env)
                .map_err(|e| e.to_string())?
                .with_intra_threads(threads)
                .map_err(err)?
                // Measured: disabling memory patterns lowers the peak from 1.47 to 0.94 GB at equal speed.
                .with_memory_pattern(false)
                .map_err(err)?
                .commit_from_file(&path)
                .map_err(|e| e.to_string())?;
            *guard = Some(Loaded {
                id: m.id,
                session,
                last_used: Instant::now(),
            });
        }
        let loaded = guard.as_mut().expect("session loaded above");
        let s = m.input_size;
        let tensor = ort::value::Tensor::from_array(([1usize, 3, s, s], input))
            .map_err(|e| e.to_string())?;
        let outputs = loaded
            .session
            .run(ort::inputs![tensor])
            .map_err(|e| e.to_string())?;
        let (_, data) = outputs[0]
            .try_extract_tensor::<f32>()
            .map_err(|e| e.to_string())?;
        let result = data.to_vec();
        drop(outputs);
        loaded.last_used = Instant::now();
        Ok(result)
    }
}

/// glibc keeps freed memory in its arenas; hand it back to the system after dropping a session
/// (measured: without this the process stays ~150 MB above its idle level).
fn trim_heap() {
    #[cfg(target_os = "linux")]
    // SAFETY: malloc_trim only releases free heap pages; it has no preconditions.
    unsafe {
        libc::malloc_trim(0);
    }
}

#[tauri::command]
pub fn model_installed(app: AppHandle, id: String) -> Result<bool, String> {
    Ok(model_path(&app, spec(&id)?)?.is_file())
}

/// Stores a model downloaded by the UI after checking its size and SHA-256 against the allow-list.
#[tauri::command]
pub fn install_model(app: AppHandle, request: Request<'_>) -> Result<(), String> {
    let m = spec(header(&request, "model-id")?)?;
    let bytes = raw_body(&request)?;
    if bytes.len() != m.bytes {
        return Err(format!("unexpected model size: {}", bytes.len()));
    }
    let hash: String = Sha256::digest(&bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    if hash != m.sha256 {
        return Err(format!("SHA-256 mismatch: {}…", &hash[..12]));
    }
    let path = model_path(&app, m)?;
    fs::create_dir_all(path.parent().expect("models dir")).map_err(|e| e.to_string())?;
    // Write then rename, so a crash never leaves a truncated model behind.
    let tmp = path.with_extension("onnx.part");
    let mut file = fs::File::create(&tmp).map_err(|e| e.to_string())?;
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_model(app: AppHandle, engine: State<'_, Engine>, id: String) -> Result<(), String> {
    let m = spec(&id)?;
    if let Ok(mut guard) = engine.loaded.lock()
        && guard.as_ref().is_some_and(|l| l.id == m.id)
    {
        *guard = None;
        trim_heap();
    }
    match fs::remove_file(model_path(&app, m)?) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
        _ => Ok(()),
    }
}

/// Body: NCHW float32 tensor (little-endian), header `model-id`. Returns the raw float32 output.
#[tauri::command]
pub async fn run_model(app: AppHandle, request: Request<'_>) -> Result<Response, String> {
    let m = spec(header(&request, "model-id")?)?;
    let body = raw_body(&request)?;
    let expected = 3 * m.input_size * m.input_size * 4;
    if body.len() != expected {
        return Err(format!(
            "unexpected tensor size: {} (expected {expected})",
            body.len()
        ));
    }
    let path = model_path(&app, m)?;
    if !path.is_file() {
        return Err(format!("model not installed: {}", m.id));
    }
    let input: Vec<f32> = body
        .as_chunks::<4>()
        .0
        .iter()
        .map(|c| f32::from_le_bytes(*c))
        .collect();
    drop(body);
    let handle = app.clone();
    // Inference blocks for ~1 s: keep it off the async runtime threads.
    let output =
        tauri::async_runtime::spawn_blocking(move || handle.state::<Engine>().run(path, m, input))
            .await
            .map_err(|e| e.to_string())??;
    Ok(Response::new(
        output
            .iter()
            .flat_map(|v| v.to_le_bytes())
            .collect::<Vec<u8>>(),
    ))
}

#[cfg(test)]
mod tests {
    use super::MODELS;

    /// The UI and the native engine must agree on every model's identity and fingerprint.
    #[test]
    fn allow_list_matches_frontend_registry() {
        let ts =
            std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/../src/lib/models.ts"))
                .unwrap();
        for m in MODELS {
            assert!(
                ts.contains(&format!("id: \"{}\"", m.id)),
                "{} missing in models.ts",
                m.id
            );
            assert!(
                ts.contains(m.sha256),
                "{} hash differs from models.ts",
                m.id
            );
            let bytes = format!("{}", m.bytes);
            let grouped: String = bytes
                .chars()
                .rev()
                .collect::<Vec<_>>()
                .chunks(3)
                .map(|c| c.iter().collect::<String>())
                .collect::<Vec<_>>()
                .join("_")
                .chars()
                .rev()
                .collect();
            assert!(
                ts.contains(&format!("bytes: {grouped}")),
                "{} size differs from models.ts",
                m.id
            );
        }
    }
}
