//! ArchCompose desktop backend: window setup and the commands the frontend calls.
//! The document model lives in the frontend; the backend owns file access and,
//! later, the image engine (see `archcompose_core::engine`).

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_file,
            read_project_file,
            write_project_file,
            engine_status
        ])
        .run(tauri::generate_context!())
        .expect("ArchCompose failed to start the window");
}
