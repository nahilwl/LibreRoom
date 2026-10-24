mod inference;

use tauri::Manager;

/// Debug builds only: timestamped phase markers for scripts/measure.py.
#[cfg(debug_assertions)]
#[tauri::command]
fn selftest_mark(label: String) {
    println!("LIBREROOM_MARK {label}");
}

/// Debug builds only: lets the in-app self-test (selftest.html) print its result and exit.
#[cfg(debug_assertions)]
#[tauri::command]
fn selftest_report(app: tauri::AppHandle, report: String) {
    println!("LIBREROOM_SELFTEST {report}");
    let ok = report.contains("\"ok\":true");
    app.exit(if ok { 0 } else { 1 });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let started = std::time::Instant::now();
    let mut builder = tauri::Builder::default();

    // LIBREROOM_STARTUP_REPORT=1 prints the time until the UI has loaded (stdout only, for
    // scripts/measure.py). Nothing is ever sent anywhere.
    if std::env::var_os("LIBREROOM_STARTUP_REPORT").is_some() {
        builder = builder.on_page_load(move |_, payload| {
            if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
                println!("LIBREROOM_STARTUP_MS {}", started.elapsed().as_millis());
            }
        });
    }

    #[cfg(debug_assertions)]
    {
        builder = builder.invoke_handler(tauri::generate_handler![
            inference::model_installed,
            inference::install_model,
            inference::remove_model,
            inference::run_model,
            selftest_report,
            selftest_mark
        ]);
    }
    #[cfg(not(debug_assertions))]
    {
        builder = builder.invoke_handler(tauri::generate_handler![
            inference::model_installed,
            inference::install_model,
            inference::remove_model,
            inference::run_model
        ]);
    }

    builder
        .setup(|app| {
            app.manage(inference::Engine::new()?);
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                loop {
                    std::thread::sleep(std::time::Duration::from_secs(5));
                    handle.state::<inference::Engine>().release_if_idle();
                }
            });

            // Debug builds: LIBREROOM_SELFTEST=online|offline|compare|stress opens the self-test page.
            #[cfg(debug_assertions)]
            if let Ok(mode) = std::env::var("LIBREROOM_SELFTEST") {
                let window = app.get_webview_window("main").expect("main window");
                let mut url = window.url()?;
                url.set_path("/selftest.html");
                let engine = std::env::var("LIBREROOM_ENGINE").unwrap_or_default();
                url.set_query(Some(&format!("mode={mode}&engine={engine}")));
                window.navigate(url)?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running LibreRoom");
}
