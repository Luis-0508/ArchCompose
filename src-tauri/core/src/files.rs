//! File access for the frontend.
//!
//! Paths arrive from the system file dialogs or from a saved project, so every
//! command validates what it is given and returns a sentence the UI can show.
//! Project files are written atomically: a crash or full disk never leaves a
//! half-written project in place of the previous one.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

/// Largest image the preview renderer is asked to load.
pub const MAX_IMAGE_BYTES: u64 = 512 * 1024 * 1024;
/// Projects only hold references, so anything bigger is not a project file.
pub const MAX_PROJECT_BYTES: u64 = 64 * 1024 * 1024;

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.display().to_string())
}

fn checked_file(path: &str, limit: u64) -> Result<PathBuf, String> {
    if path.trim().is_empty() {
        return Err("No file path was given.".into());
    }
    let path = PathBuf::from(path);
    let name = file_name(&path);
    let meta = fs::metadata(&path).map_err(|e| match e.kind() {
        std::io::ErrorKind::NotFound => {
            format!("“{name}” was not found. It may have been moved or renamed.")
        }
        std::io::ErrorKind::PermissionDenied => format!("Access to “{name}” was denied."),
        _ => format!("“{name}” could not be read: {e}."),
    })?;
    if !meta.is_file() {
        return Err(format!("“{name}” is not a file."));
    }
    if meta.len() > limit {
        return Err(format!(
            "“{name}” is {} MB, more than the {} MB limit.",
            meta.len() / (1024 * 1024),
            limit / (1024 * 1024)
        ));
    }
    Ok(path)
}

/// Whether two paths name the same file. Used to refuse exports that would overwrite a
/// source image. Paths that cannot be resolved are compared as written, ignoring case on
/// Windows.
pub fn same_file(a: &str, b: &str) -> bool {
    let resolve = |p: &str| fs::canonicalize(p).unwrap_or_else(|_| PathBuf::from(p));
    let (a, b) = (resolve(a), resolve(b));
    if cfg!(windows) {
        a.to_string_lossy().to_lowercase() == b.to_string_lossy().to_lowercase()
    } else {
        a == b
    }
}

/// Size of an image file in bytes, with the same checks as [`read_bytes`].
pub fn image_size(path: &str) -> Result<u64, String> {
    let path = checked_file(path, MAX_IMAGE_BYTES)?;
    fs::metadata(&path)
        .map(|m| m.len())
        .map_err(|e| format!("“{}” could not be read: {e}.", file_name(&path)))
}

pub fn read_bytes(path: &str) -> Result<Vec<u8>, String> {
    let path = checked_file(path, MAX_IMAGE_BYTES)?;
    fs::read(&path).map_err(|e| format!("“{}” could not be read: {e}.", file_name(&path)))
}

pub fn read_project(path: &str) -> Result<String, String> {
    let path = checked_file(path, MAX_PROJECT_BYTES)?;
    let bytes =
        fs::read(&path).map_err(|e| format!("“{}” could not be read: {e}.", file_name(&path)))?;
    String::from_utf8(bytes)
        .map_err(|_| format!("“{}” is not a text project file.", file_name(&path)))
}

/// Writes `contents` next to `path` under a temporary name, flushes it to disk and
/// then renames it over the target, which is atomic on the same volume.
pub fn write_atomic(path: &str, contents: &str) -> Result<(), String> {
    write_atomic_bytes(path, contents.as_bytes())
}

/// [`write_atomic`] for binary data such as exported images.
pub fn write_atomic_bytes(path: &str, contents: &[u8]) -> Result<(), String> {
    if path.trim().is_empty() {
        return Err("No file path was given.".into());
    }
    let target = PathBuf::from(path);
    let name = file_name(&target);
    let dir = target
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .ok_or_else(|| format!("“{name}” has no parent folder."))?;
    if !dir.is_dir() {
        return Err(format!("The folder for “{name}” does not exist."));
    }
    if target.is_dir() {
        return Err(format!("“{name}” is a folder."));
    }

    let temp = dir.join(format!(".{name}.{}.tmp", std::process::id()));
    let result = (|| -> std::io::Result<()> {
        let mut file = fs::File::create(&temp)?;
        file.write_all(contents)?;
        file.sync_all()?;
        drop(file);
        fs::rename(&temp, &target)
    })();
    if let Err(e) = result {
        // Best effort: the temporary file is ours and safe to remove; report the original error.
        let _ = fs::remove_file(&temp);
        return Err(format!("“{name}” could not be saved: {e}."));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_and_replaces_atomically() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("Courtyard.archcompose");
        let p = path.to_str().unwrap();
        write_atomic(p, "{\"v\":1}").unwrap();
        write_atomic(p, "{\"v\":2}").unwrap();
        assert_eq!(read_project(p).unwrap(), "{\"v\":2}");
        let leftovers: Vec<_> = fs::read_dir(dir.path()).unwrap().collect();
        assert_eq!(leftovers.len(), 1, "temporary files must not remain");
    }

    #[test]
    fn writes_binary_data_and_detects_the_same_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("export.png");
        let p = path.to_str().unwrap();
        write_atomic_bytes(p, &[0, 159, 146, 150]).unwrap();
        assert_eq!(read_bytes(p).unwrap(), vec![0, 159, 146, 150]);
        assert_eq!(image_size(p).unwrap(), 4);
        assert!(same_file(p, p));
        let other = dir.path().join("other.png");
        assert!(!same_file(p, other.to_str().unwrap()));
    }

    #[test]
    fn reports_missing_files_by_name() {
        let dir = tempfile::tempdir().unwrap();
        let missing = dir.path().join("render.png");
        let err = read_bytes(missing.to_str().unwrap()).unwrap_err();
        assert!(err.contains("render.png"), "{err}");
        assert!(err.contains("not found"), "{err}");
    }

    #[test]
    fn rejects_folders_and_empty_paths() {
        let dir = tempfile::tempdir().unwrap();
        assert!(read_bytes(dir.path().to_str().unwrap())
            .unwrap_err()
            .contains("not a file"));
        assert!(read_bytes("").is_err());
        assert!(write_atomic("", "x").is_err());
        assert!(write_atomic(dir.path().to_str().unwrap(), "x").is_err());
    }

    #[test]
    fn refuses_to_write_into_missing_folder() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nope").join("a.archcompose");
        assert!(write_atomic(path.to_str().unwrap(), "x")
            .unwrap_err()
            .contains("does not exist"));
    }

    #[test]
    fn rejects_non_utf8_projects() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("broken.archcompose");
        fs::write(&path, [0xff, 0xfe, 0x00]).unwrap();
        assert!(read_project(path.to_str().unwrap())
            .unwrap_err()
            .contains("not a text"));
    }
}
