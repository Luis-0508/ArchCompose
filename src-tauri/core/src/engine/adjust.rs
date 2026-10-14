//! Per-layer tone and colour adjustments.
//!
//! An ArchCompose layer's adjustments become PhotoCraft adjustment layers clipped to that
//! layer and composited in isolation, so they change only that layer and never its source
//! file. The values use Photoshop's units, which is what PhotoCraft's compositor implements.

use photocraft_doc::{
    adjust::HueRange, Adjustment, ColorMode, Document, Layer, LayerContent, Size, Surface,
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
}

impl Adjust {
    pub fn validate(&self, layer: &str) -> Result<(), String> {
        let ok = |v: f32, lo: f32, hi: f32| v.is_finite() && (lo..=hi).contains(&v);
        if ok(self.exposure, -5.0, 5.0)
            && ok(self.brightness, -150.0, 150.0)
            && ok(self.contrast, -50.0, 100.0)
            && ok(self.saturation, -100.0, 100.0)
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
/// adjusted pixels, with the same transparency.
pub fn apply(surface: Surface, adjust: &Adjust, size: Size, depth: Depth) -> Surface {
    if adjust.is_neutral() {
        return surface;
    }
    let mut doc = Document::new("Adjust", size, ColorMode::Rgb, depth.doc_sample_type());
    doc.layers
        .push(Layer::new("Pixels", LayerContent::Raster(surface)));
    for a in adjust.layers() {
        let mut layer = Layer::new("Adjustment", LayerContent::Adjustment(a));
        layer.clipped = true;
        doc.layers.push(layer);
    }
    photocraft_compose::flatten_to_surface(&doc, depth.pixel_format(), None)
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
        );
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
        ));
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
        ));
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
        ));
        assert!(dark[0] < 64, "{dark:?}");
        let lifted = first(&apply(
            pixel([64, 64, 64, 255]),
            &Adjust {
                brightness: 50.0,
                ..Adjust::default()
            },
            Size::new(2, 1),
            Depth::Eight,
        ));
        assert!(lifted[0] > 64, "{lifted:?}");
    }

    #[test]
    fn rejects_out_of_range_values() {
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
