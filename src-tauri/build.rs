fn main() {
    // App commands must be declared to be grantable to the http://127.0.0.1 origin (see capabilities/).
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "model_installed",
            "install_model",
            "remove_model",
            "run_model",
            "selftest_report",
            "selftest_mark",
        ]),
    ))
    .expect("failed to run tauri-build");
}
