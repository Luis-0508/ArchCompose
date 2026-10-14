//! PSD and PSB files through PhotoCraft's PSD reader and writer.
//!
//! Import reads the merged composite that Photoshop stores in every file saved with
//! "Maximize compatibility"; the layers inside the file are not imported individually.
//! Export writes one raster layer per compose layer plus the merged composite.

use photocraft_codecs::{ChannelLayout, Image, SampleType};
use photocraft_doc::{Document, LayerContent, Rect};
use photocraft_psd::{ColorMode, LayerSpec, PixelData, PsdBuilder, PsdFile};

use super::source::{self, Depth};

/// The merged composite of a PSD or PSB as an image in its own colour model, un-matted from
/// white when it has transparency.
pub fn merged_image(bytes: &[u8], name: &str) -> Result<Image, String> {
    let file = PsdFile::from_bytes(bytes).map_err(|e| {
        format!("“{name}” could not be read as a Photoshop file. It may be damaged ({e}).")
    })?;
    let h = file.header.clone();
    let limits = source::limits();
    if h.width == 0
        || h.height == 0
        || h.width > limits.max_width
        || h.height > limits.max_height
        || u64::from(h.width) * u64::from(h.height) > limits.max_pixels
    {
        return Err(source::too_large(name));
    }
    let (colors, layout_opaque, layout_alpha) = match h.color_mode {
        ColorMode::Rgb => (3, ChannelLayout::Rgb, ChannelLayout::Rgba),
        ColorMode::Grayscale => (1, ChannelLayout::Gray, ChannelLayout::GrayA),
        ColorMode::Cmyk => (4, ChannelLayout::Cmyk, ChannelLayout::CmykA),
        other => {
            return Err(format!(
                "“{name}” uses the {other:?} colour mode. Convert it to RGB in your image editor first."
            ))
        }
    };
    let sample = match h.depth {
        8 => SampleType::U8,
        16 => SampleType::U16,
        32 => SampleType::F32,
        d => {
            return Err(format!(
                "“{name}” uses {d}-bit channels, which are not supported."
            ))
        }
    };
    if file.has_real_merged_data() == Some(false) {
        return Err(format!(
            "“{name}” was saved without a composite image. Save it again in Photoshop with \
             “Maximize PSD and PSB file compatibility” turned on."
        ));
    }
    let alpha = file.merged_has_alpha();
    let planes_used = colors + usize::from(alpha);
    if usize::from(h.channels) < planes_used {
        return Err(format!(
            "“{name}” is missing colour channels in its composite image."
        ));
    }
    let raw = file
        .decode_merged()
        .map_err(|e| format!("The composite image of “{name}” could not be decoded ({e})."))?;
    let icc = file.icc_profile().map(<[u8]>::to_vec);
    drop(file);

    let n = h.width as usize * h.height as usize;
    let bytes_per = usize::from(h.depth / 8);
    let plane_len = n * bytes_per;
    if raw.len() < plane_len * planes_used {
        return Err(format!("The composite image of “{name}” is incomplete."));
    }
    // Planar big-endian samples, normalised to 0..1; PSD stores CMYK inverted (0 = full ink).
    let read = |plane: usize, i: usize| -> f32 {
        let at = plane * plane_len + i * bytes_per;
        let v = match h.depth {
            8 => f32::from(raw[at]) / 255.0,
            16 => f32::from(u16::from_be_bytes([raw[at], raw[at + 1]])) / 65535.0,
            _ => f32::from_be_bytes([raw[at], raw[at + 1], raw[at + 2], raw[at + 3]]),
        };
        if h.color_mode == ColorMode::Cmyk && plane < colors {
            1.0 - v
        } else {
            v
        }
    };
    // Transparent composites are matted against white; white is zero ink in CMYK.
    let white = if h.color_mode == ColorMode::Cmyk {
        0.0
    } else {
        1.0
    };
    let stride = planes_used;
    let mut values =
        source::try_zeroed::<f32>(n * stride).ok_or_else(|| source::too_large(name))?;
    for (i, px) in values.chunks_exact_mut(stride).enumerate() {
        let a = if alpha { read(colors, i) } else { 1.0 };
        for (c, out) in px.iter_mut().take(colors).enumerate() {
            let m = read(c, i);
            *out = if !alpha {
                m
            } else if a <= 0.0 {
                0.0
            } else {
                (m - white * (1.0 - a)) / a
            };
            if sample != SampleType::F32 {
                *out = out.clamp(0.0, 1.0);
            }
        }
        if alpha {
            px[colors] = a;
        }
    }
    drop(raw);
    let layout = if alpha { layout_alpha } else { layout_opaque };
    Image::from_normalized(h.width, h.height, layout, sample, &values)
        .map(|img| img.with_icc(icc))
        .map_err(|e| format!("The composite image of “{name}” could not be converted ({e})."))
}

/// A layered PSD (PSB above 30000 pixels) of an engine document whose layers are all
/// raster layers, with `composite` as the merged image.
pub fn layered(doc: &Document, depth: Depth, composite: &[u8]) -> Result<Vec<u8>, String> {
    let (w, h) = (doc.size.width, doc.size.height);
    let mut builder = PsdBuilder::new(w, h)
        .depth(u16::from(depth.bits()))
        .resolution(f64::from(doc.resolution_dpi));
    if w > 30_000 || h > 30_000 {
        builder = builder.version(photocraft_psd::header::Version::Psb);
    }
    let canvas = doc.bounds();
    for layer in &doc.layers {
        let LayerContent::Raster(surface) = &layer.content else {
            return Err("Only image layers can be written to PSD.".into());
        };
        let bounds = surface.content_bounds().intersect(&canvas);
        // An empty layer (entirely outside the canvas) is kept as a 0 × 0 layer.
        let r = if bounds.is_empty() {
            Rect::new(0, 0, 0, 0)
        } else {
            bounds
        };
        let bytes = if r.is_empty() {
            Vec::new()
        } else {
            surface.to_interleaved(r)
        };
        let pixels = match depth {
            Depth::Eight => PixelData::Rgba8(bytes),
            Depth::Sixteen => PixelData::Rgba16(source::u16_samples(&bytes)),
        };
        let mut spec = LayerSpec::new(
            layer.name.clone(),
            r.x0,
            r.y0,
            r.width(),
            r.height(),
            pixels,
        );
        spec.opacity = (layer.opacity.clamp(0.0, 1.0) * 255.0).round() as u8;
        spec.visible = layer.visible;
        builder.push_layer(spec);
    }
    builder.composite(match depth {
        Depth::Eight => PixelData::Rgba8(composite.to_vec()),
        Depth::Sixteen => PixelData::Rgba16(source::u16_samples(composite)),
    });
    builder
        .to_bytes()
        .map_err(|e| format!("The PSD file could not be written ({e})."))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_merged_image_and_removes_the_white_matte() {
        let mut b = PsdBuilder::new(2, 1);
        b.push_layer(LayerSpec::new(
            "Red",
            0,
            0,
            2,
            1,
            PixelData::Rgba8(vec![255, 0, 0, 255, 255, 0, 0, 128]),
        ));
        b.composite(PixelData::Rgba8(vec![255, 0, 0, 255, 255, 0, 0, 128]));
        let bytes = b.to_bytes().unwrap();
        let img = merged_image(&bytes, "a.psd").unwrap();
        assert_eq!(img.dimensions(), (2, 1));
        let px = source::normalize(img, "a.psd").unwrap();
        assert_eq!(&px.data[0..4], &[255, 0, 0, 255]);
        assert_eq!(px.data[7], 128);
        assert!(
            px.data[4] >= 254 && px.data[5] <= 1 && px.data[6] <= 1,
            "{:?}",
            &px.data[4..8]
        );
    }

    #[test]
    fn rejects_damaged_files() {
        assert!(merged_image(b"8BPS\x00\x01garbage", "bad.psd")
            .unwrap_err()
            .contains("bad.psd"));
    }
}
