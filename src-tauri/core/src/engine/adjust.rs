//! Per-layer tone and colour adjustments and filters.
//!
//! An ArchCompose layer's adjustments become PhotoCraft adjustment layers clipped to that
//! layer and composited in isolation, so they change only that layer and never its source
//! file. Blur and sharpening then run PhotoCraft's Gaussian blur and unsharp mask on the
//! result. The values use Photoshop's units, which is what PhotoCraft implements.

use photocraft_algo::FilterParams;
use photocraft_doc::{
    adjust::HueRange, Adjustment, ColorMode, Document, Layer, LayerContent, Rect, Size, Surface,
};
use serde::Deserialize;

use super::source::Depth;

/// Mirrors `LayerAdjustments` in `src/model/types.ts`.
#[derive(Debug, Clone, Copy, Default, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Adjust {
    /// Stops, -5..=5.
    pub exposure: f32,
    /// -150..=150.
    pub brightness: f32,
    /// -50..=100.
    pub contrast: f32,
    /// -100..=100.
    pub saturation: f32,
    /// Gaussian blur radius (standard deviation) in canvas pixels, 0..=100.
    #[serde(default)]
    pub blur: f32,
    /// Unsharp mask amount in percent, 0..=500, at [`SHARPEN_RADIUS`].
    #[serde(default)]
    pub sharpen: f32,
}

/// Radius of the unsharp mask in canvas pixels, as Photoshop's "Sharpen" filters use.
pub const SHARPEN_RADIUS: f32 = 1.0;

impl Adjust {
    pub fn validate(&self, layer: &str) -> Result<(), String> {
        let ok = |v: f32, lo: f32, hi: f32| v.is_finite() && (lo..=hi).contains(&v);
        if ok(self.exposure, -5.0, 5.0)
            && ok(self.brightness, -150.0, 150.0)
            && ok(self.contrast, -50.0, 100.0)
            && ok(self.saturation, -100.0, 100.0)
            && ok(self.blur, 0.0, 100.0)
            && ok(self.sharpen, 0.0, 500.0)
        {
            Ok(())
        } else {
            Err(format!("The layer “{layer}” has adjustments out of range."))
        }
    }

    pub fn is_neutral(&self) -> bool {
        *self == Adjust::default()
    }

    /// The PhotoCraft adjustments, applied bottom to top.
    fn layers(&self) -> Vec<Adjustment> {
        let mut out = Vec::new();
        if self.exposure != 0.0 {
            out.push(Adjustment::Exposure {
                exposure: self.exposure,
                offset: 0.0,
                gamma: 1.0,
            });
        }
        if self.brightness != 0.0 || self.contrast != 0.0 {
            out.push(Adjustment::BrightnessContrast {
                brightness: self.brightness,
                contrast: self.contrast,
                legacy: false,
            });
        }
        if self.saturation != 0.0 {
            out.push(Adjustment::HueSaturation {
                hue: 0.0,
                saturation: self.saturation,
                lightness: 0.0,
                colorize: false,
                ranges: HueRange::defaults(),
            });
        }
        out
    }
}

/// Applies `adjust` to the pixels of `surface` (in a canvas of `size`) and returns the
/// adjusted pixels, with the same transparency. `pixel_scale` converts the blur and sharpen
/// radii from canvas pixels to pixels of `surface`; it is 1 for exports and the reduction
/// factor for previews.
pub fn apply(
    surface: Surface,
    adjust: &Adjust,
    size: Size,
    depth: Depth,
    pixel_scale: f32,
) -> Result<Surface, String> {
    if adjust.is_neutral() {
        return Ok(surface);
    }
    let tones = adjust.layers();
    let mut surface = if tones.is_empty() {
        surface
    } else {
        let mut doc = Document::new("Adjust", size, ColorMode::Rgb, depth.doc_sample_type());
        doc.layers
            .push(Layer::new("Pixels", LayerContent::Raster(surface)));
        for a in tones {
            let mut layer = Layer::new("Adjustment", LayerContent::Adjustment(a));
            layer.clipped = true;
            doc.layers.push(layer);
        }
        photocraft_compose::flatten_to_surface(&doc, depth.pixel_format(), None)
    };
    let canvas = Rect::from_xywh(0, 0, size.width, size.height);
    // PhotoCraft accepts blur radii from 0.1 px; smaller ones have no visible effect.
    let blur = adjust.blur * pixel_scale;
    if blur >= 0.1 {
        surface = filter(&surface, &FilterParams::GaussianBlur { radius: blur }, canvas)?;
    }
    if adjust.sharpen > 0.0 {
        let params = FilterParams::UnsharpMask {
            amount: adjust.sharpen,
            radius: (SHARPEN_RADIUS * pixel_scale).max(0.1),
            threshold: 0.0,
        };
        surface = filter(&surface, &params, canvas)?;
    }
    Ok(surface)
}

fn filter(surface: &Surface, params: &FilterParams, canvas: Rect) -> Result<Surface, String> {
    photocraft_algo::apply_in_with(
        surface,
        params,
        canvas,
        canvas,
        None,
        canvas,
        &photocraft_raster::Interrupt::NONE,
    )
    .ok_or_else(|| {
        "The image engine could not apply the filter. The layer may be too large.".to_string()
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use photocraft_doc::Rect;

    fn pixel(rgba: [u8; 4]) -> Surface {
        Surface::from_interleaved(
            Depth::Eight.pixel_format(),
            Rect::from_xywh(0, 0, 2, 1),
            &[rgba, rgba].concat(),
        )
    }

    fn first(s: &Surface) -> Vec<u8> {
        s.to_interleaved(Rect::from_xywh(0, 0, 1, 1))
    }

    #[test]
    fn neutral_adjustments_leave_pixels_unchanged() {
        let s = apply(
            pixel([10, 20, 30, 200]),
            &Adjust::default(),
            Size::new(2, 1),
            Depth::Eight,
            1.0,
        )
        .unwrap();
        assert_eq!(first(&s), vec![10, 20, 30, 200]);
    }

    #[test]
    fn exposure_brightens_and_keeps_alpha() {
        let adjust = Adjust {
            exposure: 1.0,
            ..Adjust::default()
        };
        let out = first(&apply(
            pixel([100, 100, 100, 128]),
            &adjust,
            Size::new(2, 1),
            Depth::Eight,
            1.0,
        )
        .unwrap());
        // +1 stop doubles linear light: sRGB 100 (linear 0.127) becomes about 0.254, sRGB ~137.
        assert!((135..=139).contains(&out[0]), "{out:?}");
        assert_eq!(out[0], out[1]);
        assert_eq!(out[3], 128, "{out:?}");
    }

    #[test]
    fn saturation_minus_100_makes_grey() {
        let adjust = Adjust {
            saturation: -100.0,
            ..Adjust::default()
        };
        let out = first(&apply(
            pixel([200, 50, 50, 255]),
            &adjust,
            Size::new(2, 1),
            Depth::Eight,
            1.0,
        )
        .unwrap());
        assert!(
            out[0].abs_diff(out[1]) <= 1 && out[1].abs_diff(out[2]) <= 1,
            "{out:?}"
        );
    }

    #[test]
    fn contrast_spreads_tones_and_brightness_lifts_them() {
        let dark = first(&apply(
            pixel([64, 64, 64, 255]),
            &Adjust {
                contrast: 60.0,
                ..Adjust::default()
            },
            Size::new(2, 1),
            Depth::Eight,
            1.0,
        )
        .unwrap());
        assert!(dark[0] < 64, "{dark:?}");
        let lifted = first(&apply(
            pixel([64, 64, 64, 255]),
            &Adjust {
                brightness: 50.0,
                ..Adjust::default()
            },
            Size::new(2, 1),
            Depth::Eight,
            1.0,
        )
        .unwrap());
        assert!(lifted[0] > 64, "{lifted:?}");
    }

    /// A 16 × 1 strip, black on the left half and white on the right.
    fn edge() -> Surface {
        let mut bytes = Vec::new();
        for x in 0..16 {
            let v = if x < 8 { 0 } else { 255 };
            bytes.extend_from_slice(&[v, v, v, 255]);
        }
        Surface::from_interleaved(
            Depth::Eight.pixel_format(),
            Rect::from_xywh(0, 0, 16, 1),
            &bytes,
        )
    }

    fn row(s: &Surface) -> Vec<u8> {
        s.to_interleaved(Rect::from_xywh(0, 0, 16, 1))
            .chunks(4)
            .map(|p| p[0])
            .collect()
    }

    #[test]
    fn blur_softens_an_edge_and_scales_with_the_preview() {
        let adjust = Adjust {
            blur: 2.0,
            ..Adjust::default()
        };
        let out = row(&apply(edge(), &adjust, Size::new(16, 1), Depth::Eight, 1.0).unwrap());
        assert!(out[6] > 0 && out[6] < 128, "{out:?}");
        assert!(out[9] > 128 && out[9] < 255, "{out:?}");
        assert_eq!(out[0], 0);
        // At a quarter of the size, the same canvas radius is half a pixel: a smaller spread.
        let small = row(&apply(edge(), &adjust, Size::new(16, 1), Depth::Eight, 0.25).unwrap());
        assert!(small[6] < out[6], "{small:?} vs {out:?}");
    }

    #[test]
    fn sharpen_increases_contrast_at_an_edge() {
        let grey = |v: u8| -> Surface {
            let mut bytes = Vec::new();
            for x in 0..16 {
                let g = if x < 8 { v } else { 255 - v };
                bytes.extend_from_slice(&[g, g, g, 255]);
            }
            Surface::from_interleaved(
                Depth::Eight.pixel_format(),
                Rect::from_xywh(0, 0, 16, 1),
                &bytes,
            )
        };
        let adjust = Adjust {
            sharpen: 200.0,
            ..Adjust::default()
        };
        let out = row(&apply(grey(80), &adjust, Size::new(16, 1), Depth::Eight, 1.0).unwrap());
        // Dark side darker, light side lighter next to the edge; far pixels unchanged.
        assert!(out[7] < 80, "{out:?}");
        assert!(out[8] > 175, "{out:?}");
        assert!(out[0].abs_diff(80) <= 1, "{out:?}");
    }

    #[test]
    fn rejects_out_of_range_values() {
        assert!(Adjust {
            blur: 101.0,
            ..Adjust::default()
        }
        .validate("x")
        .is_err());
        assert!(Adjust {
            sharpen: -1.0,
            ..Adjust::default()
        }
        .validate("x")
        .is_err());
        assert!(Adjust {
            exposure: 9.0,
            ..Adjust::default()
        }
        .validate("x")
        .is_err());
        assert!(Adjust {
            saturation: f32::NAN,
            ..Adjust::default()
        }
        .validate("x")
        .is_err());
        assert!(Adjust {
            contrast: 100.0,
            ..Adjust::default()
        }
        .validate("x")
        .is_ok());
    }
}
