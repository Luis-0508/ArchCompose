//! Engine integration boundary.
//!
//! ArchCompose does not ship an image engine yet. What the user sees is drawn by
//! the system web view from the document model. Selected PhotoCraft crates are the
//! intended engine (see docs/UPSTREAM.md); when one is linked, it is wired in here
//! and reported through [`EngineStatus`], and nowhere else in the backend.

use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EngineStatus {
    /// Name of the renderer that produces what the user sees.
    pub renderer: String,
    /// Whether an image engine is linked into this build.
    pub engine_linked: bool,
    pub app_version: String,
}

pub fn status() -> EngineStatus {
    EngineStatus {
        renderer: "Web view preview".into(),
        engine_linked: false,
        app_version: env!("CARGO_PKG_VERSION").into(),
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn reports_no_engine_and_serializes_camel_case() {
        let status = super::status();
        assert!(!status.engine_linked);
        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains("\"engineLinked\":false"), "{json}");
        assert!(json.contains("\"appVersion\""), "{json}");
    }
}
