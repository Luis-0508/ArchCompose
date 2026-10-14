//! ArchCompose desktop backend: window setup and the commands the frontend calls.
//! The document model lives in the frontend; the backend owns file access and the
//! image engine (see `archcompose_core::engine`). Image work runs on blocking worker
//! threads so the window stays responsive.

use archcompose_core::{engine, files};
use tauri::ipc::Response;

/// Returns a file's bytes as a binary IPC response (no JSON encoding of pixels).
#[tauri::command]
async fn read_file(path: String) -> Result<Response, String> {
    tauri::async_runtime::spawn_blocking(move || files::read_bytes(&path))
        .await
        .map_err(|e| format!("Reading the file was interrupted: {e}."))?
        .map(Response::new)
}

#[tauri::command]
async fn read_project_file(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || files::read_project(&path))
        .await
        .map_err(|e| format!("Reading the project was interrupted: {e}."))?
}

#[tauri::command]
async fn write_project_file(path: String, contents: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || files::write_atomic(&path, &contents))
        .await
        .map_err(|e| format!("Saving was interrupted: {e}."))?
}

#[tauri::command]
fn engine_status() -> engine::EngineStatus {
    engine::status()
}

/// Decodes a file the web view cannot display and returns an 8-bit PNG of it.
#[tauri::command]
async fn engine_decode_preview(path: String) -> Result<Response, String> {
    tauri::async_runtime::spawn_blocking(move || engine::decode_preview(&path))
        .await
        .map_err(|e| format!("Reading the image was interrupted: {e}."))?
        .map(Response::new)
}

#[tauri::command]
async fn engine_export_png(
    spec: engine::CompositionSpec,
    path: String,
) -> Result<engine::ExportReport, String> {
    tauri::async_runtime::spawn_blocking(move || engine::export_png(&spec, &path))
        .await
        .map_err(|e| format!("The export was interrupted: {e}."))?
}

#[tauri::command]
async fn engine_export_psd(
    spec: engine::CompositionSpec,
    path: String,
) -> Result<engine::ExportReport, String> {
    tauri::async_runtime::spawn_blocking(move || engine::export_psd(&spec, &path))
        .await
        .map_err(|e| format!("The export was interrupted: {e}."))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_file,
            read_project_file,
            write_project_file,
            engine_status,
            engine_decode_preview,
            engine_export_png,
            engine_export_psd
        ])
        .run(tauri::generate_context!())
        .expect("ArchCompose failed to start the window");
}
