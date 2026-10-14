//! Engine integration boundary.
//!
//! ArchCompose renders and exports images with crates of the PhotoCraft engine
//! (<https://github.com/storytold/photocraft>, MIT OR Apache-2.0), pinned to
//! [`UPSTREAM_REVISION`]. This module is the only place in ArchCompose that uses them;
//! everything outside sees the plain types and functions below. See docs/UPSTREAM.md.
//!
//! - [`decode_preview`] turns files the web view cannot display (TIFF, PSD, OpenEXR, …)
//!   into an 8-bit PNG preview.
//! - [`export_png`] and [`export_psd`] render a compose document at full resolution.

mod adjust;
mod composition;
mod preview;
mod psd_file;
mod source;

use serde::Serialize;

pub use adjust::Adjust;
pub use composition::{CompositionSpec, ExportReport, LayerSpec, MAX_CANVAS_PIXELS};
pub use source::MAX_SOURCE_PIXELS;

use composition::DiskSources;

/// The PhotoCraft commit every `photocraft-*` dependency in `Cargo.toml` is pinned to.
pub const UPSTREAM_REVISION: &str = "c699e3cda69f4852b43c0b191ab0091aaeff9d6a";
/// The PhotoCraft release at that commit.
pub const UPSTREAM_VERSION: &str = "0.9.0";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EngineStatus {
    /// Name of the renderer that produces what the user sees.
    pub renderer: String,
    /// Whether an image engine is linked into this build.
    pub engine_linked: bool,
    pub app_version: String,
    /// Upstream engine version and commit, for the third-party notices.
    pub engine_version: String,
    pub engine_revision: String,
}

pub fn status() -> EngineStatus {
    EngineStatus {
        renderer: "Web view preview, engine export".into(),
        engine_linked: true,
        app_version: env!("CARGO_PKG_VERSION").into(),
        engine_version: UPSTREAM_VERSION.into(),
        engine_revision: UPSTREAM_REVISION.into(),
    }
}

/// File extensions the engine reads in addition to what the web view displays.
pub const ENGINE_EXTENSIONS: &[&str] = &["tif", "tiff", "psd", "psb", "exr", "hdr", "tga", "qoi"];

/// Decodes an image file and returns an 8-bit sRGB PNG of it at full size, for display.
pub fn decode_preview(path: &str) -> Result<Vec<u8>, String> {
    let bytes = crate::files::read_bytes(path)?;
    let name = path.rsplit(['/', '\\']).next().unwrap_or(path);
    preview_png(&bytes, name)
}

fn preview_png(bytes: &[u8], name: &str) -> Result<Vec<u8>, String> {
    use photocraft_codecs::{
        ChannelLayout, EncodeOptions, Format, Image, PngCompression, SampleType,
    };
    let pixels = source::decode(bytes, name)?;
    let image = Image::from_raw(
        pixels.width,
        pixels.height,
        ChannelLayout::Rgba,
        pixels.depth.sample_type(),
        pixels.data,
    )
    .map_err(|e| format!("“{name}” could not be prepared for display ({e})."))?
    .convert(ChannelLayout::Rgba, SampleType::U8);
    let options = EncodeOptions {
        png_compression: PngCompression::Fast,
        ..EncodeOptions::default()
    };
    photocraft_codecs::encode(&image, Format::Png, &options)
        .map_err(|e| format!("“{name}” could not be prepared for display ({e})."))
}

/// Longest side of a layer preview. The canvas shows previews scaled to the layer's size.
pub const PREVIEW_SIDE: u32 = 2048;

/// A layer's image with its adjustments applied by the engine, reduced to at most
/// [`PREVIEW_SIDE`] pixels on its longest side, as an 8-bit PNG for the canvas.
pub fn layer_preview(path: &str, adjust: &Adjust) -> Result<Vec<u8>, String> {
    use photocraft_codecs::{
        ChannelLayout, EncodeOptions, Format, Image, PngCompression, SampleType,
    };
    let name = path.rsplit(['/', '\\']).next().unwrap_or(path);
    adjust.validate(name)?;
    let reduced = preview::reduced_source(path, name)?;
    let rect = photocraft_doc::Rect::from_xywh(0, 0, reduced.width, reduced.height);
    let size = photocraft_doc::Size::new(reduced.width, reduced.height);
    let adjusted = adjust::apply(reduced.surface.clone(), adjust, size, reduced.depth);
    let image = Image::from_raw(
        reduced.width,
        reduced.height,
        ChannelLayout::Rgba,
        reduced.depth.sample_type(),
        adjusted.to_interleaved(rect),
    )
    .map_err(|e| format!("The preview of “{name}” could not be prepared ({e})."))?
    .convert(ChannelLayout::Rgba, SampleType::U8);
    let options = EncodeOptions {
        png_compression: PngCompression::Fast,
        ..EncodeOptions::default()
    };
    photocraft_codecs::encode(&image, Format::Png, &options)
        .map_err(|e| format!("The preview of “{name}” could not be prepared ({e})."))
}

/// Renders `spec` and writes a PNG to `target`.
pub fn export_png(spec: &CompositionSpec, target: &str) -> Result<ExportReport, String> {
    check_target(spec, target)?;
    let (bytes, report) = composition::png(spec, &DiskSources)?;
    crate::files::write_atomic_bytes(target, &bytes)?;
    Ok(report)
}

/// Writes `spec` as a layered PSD to `target`.
pub fn export_psd(spec: &CompositionSpec, target: &str) -> Result<ExportReport, String> {
    check_target(spec, target)?;
    let (bytes, report) = composition::psd(spec, &DiskSources)?;
    crate::files::write_atomic_bytes(target, &bytes)?;
    Ok(report)
}

/// Exports never replace one of the images they are made from.
fn check_target(spec: &CompositionSpec, target: &str) -> Result<(), String> {
    if spec
        .layers
        .iter()
        .any(|l| crate::files::same_file(&l.path, target))
    {
        return Err(
            "The export would replace one of the images it uses. Choose another file name.".into(),
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests;
