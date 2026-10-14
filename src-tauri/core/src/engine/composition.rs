//! Compose documents rendered by PhotoCraft's compositor.
//!
//! The frontend sends a [`CompositionSpec`]: the canvas size and the layers of an
//! ArchCompose compose document, bottom to top, with the file each layer shows. Here it is
//! translated into a transient PhotoCraft document (one raster layer per compose layer,
//! placed and scaled with PhotoCraft's resampler) and composited. The engine document is
//! never kept: ArchCompose's project stays the only source of truth, and undo stays in the
//! frontend.

use photocraft_algo::transform::{warp_surface_clipped, Homography, Interp};
use photocraft_codecs::{ChannelLayout, EncodeOptions, Format, Image, PngCompression};
use photocraft_doc::{ColorMode, Document, Layer, LayerContent, Rect, SampleType, Size, Surface};
use serde::{Deserialize, Serialize};

use super::source::{self, Depth, RgbaPixels};

/// Largest canvas side the engine renders.
pub const MAX_CANVAS_SIDE: u32 = 32_768;
/// Largest canvas, in pixels (16384 × 16384 or equivalent).
pub const MAX_CANVAS_PIXELS: u64 = 1 << 28;
/// Mirrors `MIN_LAYER_SCALE` / `MAX_LAYER_SCALE` in `src/model/compose.ts`.
const MIN_SCALE: f64 = 0.01;
const MAX_SCALE: f64 = 20.0;
const MAX_LAYERS: usize = 512;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CompositionSpec {
    pub name: String,
    pub width: u32,
    pub height: u32,
    /// Bottom to top, as in the ArchCompose model.
    pub layers: Vec<LayerSpec>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LayerSpec {
    pub name: String,
    /// The asset's file on disk.
    pub path: String,
    /// Top-left corner in canvas pixels.
    pub x: f64,
    pub y: f64,
    /// Uniform scale relative to the asset's pixel size.
    pub scale: f64,
    pub opacity: f32,
    pub visible: bool,
}

/// What an export produced, for the confirmation message.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExportReport {
    pub width: u32,
    pub height: u32,
    pub bit_depth: u8,
    pub layers: usize,
    pub bytes: u64,
}

impl CompositionSpec {
    pub fn validate(&self) -> Result<(), String> {
        if self.width == 0 || self.height == 0 {
            return Err("The composition has no size.".into());
        }
        if self.width > MAX_CANVAS_SIDE
            || self.height > MAX_CANVAS_SIDE
            || u64::from(self.width) * u64::from(self.height) > MAX_CANVAS_PIXELS
        {
            return Err(format!(
                "The composition is {} × {} pixels. ArchCompose can render up to {} megapixels.",
                self.width,
                self.height,
                MAX_CANVAS_PIXELS / 1_000_000
            ));
        }
        if self.layers.len() > MAX_LAYERS {
            return Err(format!(
                "The composition has more than {MAX_LAYERS} layers."
            ));
        }
        for l in &self.layers {
            if !l.x.is_finite() || !l.y.is_finite() || l.x.abs() > 1e7 || l.y.abs() > 1e7 {
                return Err(format!("The layer “{}” has an invalid position.", l.name));
            }
            if !(MIN_SCALE..=MAX_SCALE).contains(&l.scale) {
                return Err(format!("The layer “{}” has an invalid scale.", l.name));
            }
            if !(0.0..=1.0).contains(&l.opacity) {
                return Err(format!("The layer “{}” has an invalid opacity.", l.name));
            }
        }
        Ok(())
    }
}

/// Reads a layer's file. Injected so tests can supply bytes without files.
pub trait Sources {
    fn read(&self, path: &str) -> Result<Vec<u8>, String>;
}

/// Reads sources from disk with the backend's file checks.
pub struct DiskSources;

impl Sources for DiskSources {
    fn read(&self, path: &str) -> Result<Vec<u8>, String> {
        crate::files::read_bytes(path)
    }
}

/// An engine document built from a spec, ready to render or write.
pub struct Built {
    pub doc: Document,
    pub depth: Depth,
}

/// Builds the PhotoCraft document. Hidden layers are included only when
/// `include_hidden` (PSD keeps them; a flat render skips decoding them).
pub fn build(
    spec: &CompositionSpec,
    sources: &impl Sources,
    include_hidden: bool,
) -> Result<Built, String> {
    spec.validate()?;
    let canvas = Rect::from_xywh(0, 0, spec.width, spec.height);
    let mut placed = Vec::with_capacity(spec.layers.len());
    let mut depth = Depth::Eight;
    for l in spec.layers.iter().filter(|l| l.visible || include_hidden) {
        let name = display_name(&l.path);
        let pixels = source::decode(&sources.read(&l.path)?, &name)?;
        if pixels.depth == Depth::Sixteen {
            depth = Depth::Sixteen;
        }
        let surface = place(&pixels, l, canvas)
            .map_err(|_| format!("“{name}” is too large to place at this scale."))?;
        placed.push((l, surface));
    }

    let mut doc = Document::new(
        spec.name.clone(),
        Size::new(spec.width, spec.height),
        ColorMode::Rgb,
        depth.sample_type_doc(),
    );
    for (l, surface) in placed {
        // Mixed 8- and 16-bit sources share the document's depth.
        let surface = if surface.format() == depth.pixel_format() {
            surface
        } else {
            surface.convert(depth.pixel_format())
        };
        let mut layer = Layer::new(l.name.clone(), LayerContent::Raster(surface));
        layer.opacity = l.opacity;
        layer.visible = l.visible;
        doc.layers.push(layer);
    }
    Ok(Built { doc, depth })
}

impl Depth {
    fn sample_type_doc(self) -> SampleType {
        match self {
            Depth::Eight => SampleType::U8,
            Depth::Sixteen => SampleType::U16,
        }
    }
}

fn display_name(path: &str) -> String {
    path.rsplit(['/', '\\']).next().unwrap_or(path).to_string()
}

/// Places a source at the layer's position and scale, clipped to the canvas. Whole-pixel
/// moves at 100 % copy pixels exactly; anything else is resampled (bicubic, premultiplied).
fn place(
    pixels: &RgbaPixels,
    l: &LayerSpec,
    canvas: Rect,
) -> Result<Surface, photocraft_raster::AllocationError> {
    let src = pixels.surface();
    let src_rect = Rect::from_xywh(0, 0, pixels.width, pixels.height);
    let whole = l.x.fract() == 0.0 && l.y.fract() == 0.0;
    if l.scale == 1.0 && whole {
        return Ok(src.translated(l.x as i32, l.y as i32, src_rect));
    }
    let h = Homography([l.scale, 0.0, l.x, 0.0, l.scale, l.y, 0.0, 0.0, 1.0]);
    warp_surface_clipped(&src, src_rect, &h, Interp::Bicubic, canvas)
}

/// Composites the document into interleaved straight-alpha RGBA at its depth, band by band.
pub fn render(built: &Built) -> Result<Vec<u8>, String> {
    let doc = &built.doc;
    let (w, h) = (doc.size.width as usize, doc.size.height as usize);
    let bytes_per_sample = usize::from(built.depth.bits() / 8);
    let row_bytes = w * 4 * bytes_per_sample;
    let mut out = source::try_zeroed::<u8>(row_bytes * h)
        .ok_or_else(|| "There is not enough memory to render the composition.".to_string())?;
    photocraft_compose::render_bands(doc, doc.bounds(), 0, |band| -> Result<(), ()> {
        let r = band.rect;
        for (i, px) in band.px.iter().enumerate() {
            let x = r.x0 as usize + i % r.width() as usize;
            let y = r.y0 as usize + i / r.width() as usize;
            let at = y * row_bytes + x * 4 * bytes_per_sample;
            for (c, v) in px.iter().enumerate() {
                let v = if v.is_nan() { 0.0 } else { v.clamp(0.0, 1.0) };
                match built.depth {
                    Depth::Eight => out[at + c] = (v * 255.0 + 0.5) as u8,
                    Depth::Sixteen => {
                        let s = ((v * 65535.0 + 0.5) as u16).to_ne_bytes();
                        out[at + c * 2..at + c * 2 + 2].copy_from_slice(&s);
                    }
                }
            }
        }
        Ok(())
    })
    .map_err(|()| "Rendering the composition failed.".to_string())?;
    Ok(out)
}

/// Renders the composition and encodes it as PNG (8 or 16 bits, with alpha).
pub fn png(
    spec: &CompositionSpec,
    sources: &impl Sources,
) -> Result<(Vec<u8>, ExportReport), String> {
    let built = build(spec, sources, false)?;
    let rgba = render(&built)?;
    let image = Image::from_raw(
        spec.width,
        spec.height,
        ChannelLayout::Rgba,
        built.depth.sample_type(),
        rgba,
    )
    .map_err(|e| format!("The rendered image could not be prepared ({e})."))?;
    let options = EncodeOptions {
        png_compression: PngCompression::Fast,
        ..EncodeOptions::default()
    };
    let bytes = photocraft_codecs::encode(&image, Format::Png, &options)
        .map_err(|e| format!("The PNG file could not be encoded ({e})."))?;
    let report = report(spec, &built, bytes.len());
    Ok((bytes, report))
}

/// Writes the composition as a layered PSD: one layer per compose layer, hidden ones
/// included, plus the merged composite.
pub fn psd(
    spec: &CompositionSpec,
    sources: &impl Sources,
) -> Result<(Vec<u8>, ExportReport), String> {
    let built = build(spec, sources, true)?;
    let composite = render(&built)?;
    let bytes = super::psd_file::layered(&built.doc, built.depth, &composite)?;
    let report = report(spec, &built, bytes.len());
    Ok((bytes, report))
}

fn report(spec: &CompositionSpec, built: &Built, bytes: usize) -> ExportReport {
    ExportReport {
        width: spec.width,
        height: spec.height,
        bit_depth: built.depth.bits(),
        layers: built.doc.layers.len(),
        bytes: bytes as u64,
    }
}
