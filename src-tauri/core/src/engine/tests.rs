//! Integration tests of the engine adapter against the real PhotoCraft crates.

use std::collections::HashMap;

use photocraft_codecs::{ChannelLayout, EncodeOptions, Format, Image};

use super::composition::{self, Sources};
use super::*;

/// In-memory files keyed by path.
#[derive(Default)]
struct Files(HashMap<String, Vec<u8>>);

impl Files {
    fn with(mut self, path: &str, bytes: Vec<u8>) -> Self {
        self.0.insert(path.into(), bytes);
        self
    }
}

impl Sources for Files {
    fn read(&self, path: &str) -> Result<Vec<u8>, String> {
        self.0
            .get(path)
            .cloned()
            .ok_or_else(|| format!("“{path}” was not found."))
    }
}

fn solid_png(width: u32, height: u32, rgba: [u8; 4]) -> Vec<u8> {
    let data = rgba.repeat((width * height) as usize);
    let img = Image::from_u8(width, height, ChannelLayout::Rgba, data).unwrap();
    photocraft_codecs::encode(&img, Format::Png, &EncodeOptions::default()).unwrap()
}

fn layer(path: &str, x: f64, y: f64, scale: f64, opacity: f32) -> LayerSpec {
    LayerSpec {
        name: path.into(),
        path: path.into(),
        x,
        y,
        scale,
        opacity,
        visible: true,
        adjust: None,
    }
}

fn spec(width: u32, height: u32, layers: Vec<LayerSpec>) -> CompositionSpec {
    CompositionSpec {
        name: "Test".into(),
        width,
        height,
        layers,
    }
}

/// Renders through PNG encode and decode, as an exported file would be read back.
fn render(spec: &CompositionSpec, files: &Files) -> (u32, u32, Vec<u8>) {
    let (png, report) = composition::png(spec, files).unwrap();
    let img = photocraft_codecs::decode(&png).unwrap();
    assert_eq!(img.dimensions(), (report.width, report.height));
    (
        img.width(),
        img.height(),
        img.convert(ChannelLayout::Rgba, photocraft_codecs::SampleType::U8)
            .into_data(),
    )
}

fn px(data: &[u8], width: u32, x: u32, y: u32) -> [u8; 4] {
    let i = ((y * width + x) * 4) as usize;
    [data[i], data[i + 1], data[i + 2], data[i + 3]]
}

fn near(a: [u8; 4], b: [u8; 4], tolerance: u8) -> bool {
    a.iter().zip(b).all(|(x, y)| x.abs_diff(y) <= tolerance)
}

#[test]
fn renders_at_the_canvas_size() {
    let files = Files::default().with("base.png", solid_png(64, 48, [10, 20, 30, 255]));
    let (w, h, data) = render(
        &spec(64, 48, vec![layer("base.png", 0.0, 0.0, 1.0, 1.0)]),
        &files,
    );
    assert_eq!((w, h), (64, 48));
    assert_eq!(px(&data, w, 63, 47), [10, 20, 30, 255]);
}

#[test]
fn blends_opacity_over_the_layer_below() {
    let files = Files::default()
        .with("red.png", solid_png(4, 4, [255, 0, 0, 255]))
        .with("green.png", solid_png(4, 4, [0, 255, 0, 255]));
    let s = spec(
        4,
        4,
        vec![
            layer("red.png", 0.0, 0.0, 1.0, 1.0),
            layer("green.png", 0.0, 0.0, 1.0, 0.5),
        ],
    );
    let (w, _, data) = render(&s, &files);
    assert!(
        near(px(&data, w, 1, 1), [128, 128, 0, 255], 1),
        "{:?}",
        px(&data, w, 1, 1)
    );
}

#[test]
fn keeps_transparency_and_partial_alpha() {
    let files = Files::default().with("glass.png", solid_png(2, 2, [0, 0, 255, 128]));
    let (w, _, data) = render(
        &spec(4, 4, vec![layer("glass.png", 0.0, 0.0, 1.0, 1.0)]),
        &files,
    );
    assert_eq!(px(&data, w, 0, 0), [0, 0, 255, 128]);
    assert_eq!(
        px(&data, w, 3, 3)[3],
        0,
        "uncovered canvas stays transparent"
    );
    // Two half-transparent layers: alpha = 1 - (1 - 0.5)²
    let s = spec(
        2,
        2,
        vec![
            layer("glass.png", 0.0, 0.0, 1.0, 1.0),
            layer("glass.png", 0.0, 0.0, 1.0, 1.0),
        ],
    );
    let (w, _, data) = render(&s, &files);
    assert!(
        near(px(&data, w, 0, 0), [0, 0, 255, 192], 1),
        "{:?}",
        px(&data, w, 0, 0)
    );
}

#[test]
fn respects_layer_order_and_visibility() {
    let files = Files::default()
        .with("red.png", solid_png(2, 2, [255, 0, 0, 255]))
        .with("blue.png", solid_png(2, 2, [0, 0, 255, 255]));
    let red_top = spec(
        2,
        2,
        vec![
            layer("blue.png", 0.0, 0.0, 1.0, 1.0),
            layer("red.png", 0.0, 0.0, 1.0, 1.0),
        ],
    );
    assert_eq!(px(&render(&red_top, &files).2, 2, 0, 0), [255, 0, 0, 255]);
    let blue_top = spec(
        2,
        2,
        vec![
            layer("red.png", 0.0, 0.0, 1.0, 1.0),
            layer("blue.png", 0.0, 0.0, 1.0, 1.0),
        ],
    );
    assert_eq!(px(&render(&blue_top, &files).2, 2, 0, 0), [0, 0, 255, 255]);
    let mut hidden = blue_top.clone();
    hidden.layers[1].visible = false;
    assert_eq!(px(&render(&hidden, &files).2, 2, 0, 0), [255, 0, 0, 255]);
}

#[test]
fn hidden_layers_are_not_read_for_a_flat_export() {
    let files = Files::default().with("red.png", solid_png(2, 2, [255, 0, 0, 255]));
    let mut s = spec(
        2,
        2,
        vec![
            layer("red.png", 0.0, 0.0, 1.0, 1.0),
            layer("gone.png", 0.0, 0.0, 1.0, 1.0),
        ],
    );
    s.layers[1].visible = false;
    assert_eq!(px(&render(&s, &files).2, 2, 1, 1), [255, 0, 0, 255]);
}

#[test]
fn places_layers_at_whole_pixel_positions_exactly() {
    let files = Files::default().with("dot.png", solid_png(1, 1, [255, 255, 255, 255]));
    let (w, _, data) = render(
        &spec(5, 5, vec![layer("dot.png", 3.0, 2.0, 1.0, 1.0)]),
        &files,
    );
    for y in 0..5 {
        for x in 0..5 {
            let expected = if (x, y) == (3, 2) { 255 } else { 0 };
            assert_eq!(px(&data, w, x, y)[3], expected, "alpha at {x},{y}");
        }
    }
}

#[test]
fn scales_layers_about_their_top_left_corner() {
    let files = Files::default().with("tile.png", solid_png(10, 10, [200, 100, 50, 255]));
    let (w, _, data) = render(
        &spec(40, 40, vec![layer("tile.png", 5.0, 8.0, 2.0, 1.0)]),
        &files,
    );
    // Covers x 5..25, y 8..28; the outermost pixel row is antialiased by the resampler.
    let row: Vec<[u8; 4]> = (3..16).map(|x| px(&data, w, x, 18)).collect();
    assert!(
        near(px(&data, w, 15, 18), [200, 100, 50, 255], 1),
        "{row:?}"
    );
    assert!(
        near(px(&data, w, 12, 15), [200, 100, 50, 255], 1),
        "{row:?}"
    );
    assert_eq!(px(&data, w, 3, 9)[3], 0);
    assert_eq!(px(&data, w, 27, 9)[3], 0);
    assert_eq!(px(&data, w, 6, 30)[3], 0);
    // Downscaling: a 100 px tile at 30 % covers 30 px. Bicubic resampling may ring at the
    // edges (as in Photoshop), so colour is checked inside.
    let files = Files::default().with("large.png", solid_png(100, 100, [200, 100, 50, 255]));
    let (w, _, data) = render(
        &spec(40, 40, vec![layer("large.png", 0.0, 0.0, 0.3, 1.0)]),
        &files,
    );
    assert!(
        near(px(&data, w, 15, 15), [200, 100, 50, 255], 1),
        "{:?}",
        px(&data, w, 15, 15)
    );
    assert_eq!(px(&data, w, 32, 15)[3], 0);
}

#[test]
fn clips_layers_that_extend_past_the_canvas() {
    let files = Files::default().with("big.png", solid_png(100, 100, [9, 9, 9, 255]));
    let (w, h, data) = render(
        &spec(20, 10, vec![layer("big.png", -40.0, -30.5, 1.0, 1.0)]),
        &files,
    );
    assert_eq!((w, h), (20, 10));
    assert!(near(px(&data, w, 19, 9), [9, 9, 9, 255], 1));
}

#[test]
fn exports_full_resolution() {
    let files = Files::default()
        .with("base.png", solid_png(3000, 2000, [80, 90, 100, 255]))
        .with("person.png", solid_png(100, 300, [1, 2, 3, 255]));
    let s = spec(
        3000,
        2000,
        vec![
            layer("base.png", 0.0, 0.0, 1.0, 1.0),
            layer("person.png", 1400.0, 1200.0, 1.5, 1.0),
        ],
    );
    let (w, h, data) = render(&s, &files);
    assert_eq!((w, h), (3000, 2000));
    assert_eq!(px(&data, w, 2999, 1999), [80, 90, 100, 255]);
    assert!(near(px(&data, w, 1500, 1500), [1, 2, 3, 255], 1));
}

#[test]
fn sixteen_bit_sources_export_sixteen_bit_png() {
    let samples: Vec<u16> = [1000u16, 2000, 3000, 65535].repeat(4);
    let img = Image::from_u16(2, 2, ChannelLayout::Rgba, &samples).unwrap();
    let png16 = photocraft_codecs::encode(&img, Format::Png, &EncodeOptions::default()).unwrap();
    let files = Files::default().with("deep.png", png16);
    let (png, report) = composition::png(
        &spec(2, 2, vec![layer("deep.png", 0.0, 0.0, 1.0, 1.0)]),
        &files,
    )
    .unwrap();
    assert_eq!(report.bit_depth, 16);
    let back = photocraft_codecs::decode(&png).unwrap();
    assert_eq!(back.sample_type(), photocraft_codecs::SampleType::U16);
    assert_eq!(
        &back.to_u16_samples().unwrap()[..4],
        &[1000, 2000, 3000, 65535]
    );
}

#[test]
fn reports_missing_and_corrupt_sources_by_name() {
    let files = Files::default().with("broken.png", b"\x89PNG\r\n\x1a\nnot really".to_vec());
    let err = composition::png(
        &spec(4, 4, vec![layer("missing.png", 0.0, 0.0, 1.0, 1.0)]),
        &files,
    )
    .unwrap_err();
    assert!(err.contains("missing.png"), "{err}");
    let err = composition::png(
        &spec(4, 4, vec![layer("broken.png", 0.0, 0.0, 1.0, 1.0)]),
        &files,
    )
    .unwrap_err();
    assert!(err.contains("broken.png"), "{err}");
}

#[test]
fn validates_the_spec() {
    let files = Files::default();
    assert!(composition::png(&spec(0, 10, vec![]), &files).is_err());
    assert!(composition::png(&spec(40_000, 10, vec![]), &files)
        .unwrap_err()
        .contains("megapixels"));
    assert!(composition::png(&spec(20_000, 20_000, vec![]), &files).is_err());
    let mut bad = spec(4, 4, vec![layer("a.png", 0.0, 0.0, 1.0, 1.0)]);
    bad.layers[0].scale = f64::NAN;
    assert!(composition::png(&bad, &files)
        .unwrap_err()
        .contains("scale"));
    bad.layers[0].scale = 1.0;
    bad.layers[0].opacity = 2.0;
    assert!(composition::png(&bad, &files)
        .unwrap_err()
        .contains("opacity"));
}

#[test]
fn writes_a_layered_psd_with_names_opacity_visibility_and_composite() {
    let files = Files::default()
        .with("base.png", solid_png(8, 6, [255, 255, 255, 255]))
        .with("tree.png", solid_png(2, 2, [0, 128, 0, 255]));
    let mut s = spec(
        8,
        6,
        vec![
            layer("base.png", 0.0, 0.0, 1.0, 1.0),
            layer("tree.png", 3.0, 2.0, 1.0, 0.5),
        ],
    );
    s.layers[0].name = "Base render".into();
    s.layers[1].name = "Tree".into();
    let mut with_hidden = s.clone();
    with_hidden.layers.push(LayerSpec {
        visible: false,
        name: "Hidden".into(),
        ..layer("tree.png", 0.0, 0.0, 1.0, 1.0)
    });
    let (bytes, report) = composition::psd(&with_hidden, &files).unwrap();
    assert_eq!(report.layers, 3);

    let file = photocraft_psd::PsdFile::from_bytes(&bytes).unwrap();
    assert_eq!((file.header.width, file.header.height), (8, 6));
    let layers = file.layers();
    assert_eq!(layers.len(), 3);
    assert_eq!(layers[0].name(), "Base render");
    assert_eq!(layers[1].name(), "Tree");
    assert_eq!(layers[1].opacity, 128);
    assert!(layers[1].is_visible());
    assert!(!layers[2].is_visible());
    assert_eq!((layers[1].rect.left, layers[1].rect.top), (3, 2));

    // The merged image matches the flat export, read back through the PSD import path.
    let merged = source::normalize(
        psd_file::merged_image(&bytes, "out.psd").unwrap(),
        "out.psd",
    )
    .unwrap();
    let (w, _, flat) = render(&s, &files);
    assert!(near(px(&merged.data, w, 4, 3), px(&flat, w, 4, 3), 1));
    assert!(
        near(px(&flat, w, 4, 3), [128, 192, 128, 255], 1),
        "{:?}",
        px(&flat, w, 4, 3)
    );
}

#[test]
fn export_writes_files_and_never_replaces_a_source() {
    let dir = tempfile::tempdir().unwrap();
    let base = dir.path().join("base.png");
    std::fs::write(&base, solid_png(16, 9, [1, 2, 3, 255])).unwrap();
    let base = base.to_str().unwrap().to_string();
    let s = spec(16, 9, vec![layer(&base, 0.0, 0.0, 1.0, 1.0)]);

    let out = dir.path().join("out.png");
    let report = export_png(&s, out.to_str().unwrap()).unwrap();
    assert_eq!((report.width, report.height, report.bit_depth), (16, 9, 8));
    let back = photocraft_codecs::decode(&std::fs::read(&out).unwrap()).unwrap();
    assert_eq!(back.dimensions(), (16, 9));

    let psd_out = dir.path().join("out.psd");
    export_psd(&s, psd_out.to_str().unwrap()).unwrap();
    assert!(photocraft_psd::PsdFile::from_bytes(&std::fs::read(&psd_out).unwrap()).is_ok());

    let original = std::fs::read(&base).unwrap();
    assert!(export_png(&s, &base).unwrap_err().contains("replace"));
    assert_eq!(
        std::fs::read(&base).unwrap(),
        original,
        "the source image is untouched"
    );

    let missing = spec(
        16,
        9,
        vec![layer(
            dir.path().join("nope.png").to_str().unwrap(),
            0.0,
            0.0,
            1.0,
            1.0,
        )],
    );
    assert!(export_png(&missing, out.to_str().unwrap())
        .unwrap_err()
        .contains("not found"));
}

#[test]
fn previews_engine_only_formats_as_png() {
    let samples: Vec<u16> = [65535u16, 0, 0, 65535].repeat(6);
    let img = Image::from_u16(3, 2, ChannelLayout::Rgba, &samples).unwrap();
    let tiff = photocraft_codecs::encode(&img, Format::Tiff, &EncodeOptions::default()).unwrap();
    let png = preview_png(&tiff, "render.tif").unwrap();
    let back = photocraft_codecs::decode(&png).unwrap();
    assert_eq!(back.dimensions(), (3, 2));
    assert_eq!(&back.to_rgba8()[..4], &[255, 0, 0, 255]);
}

#[test]
fn status_reports_the_linked_engine() {
    let status = status();
    assert!(status.engine_linked);
    let json = serde_json::to_string(&status).unwrap();
    assert!(json.contains("\"engineLinked\":true"), "{json}");
    assert!(json.contains(UPSTREAM_REVISION), "{json}");
}

#[test]
fn every_photocraft_dependency_is_pinned_to_the_documented_revision() {
    let manifest = include_str!("../../Cargo.toml");
    let deps: Vec<&str> = manifest
        .lines()
        .filter(|l| l.starts_with("photocraft-"))
        .collect();
    assert!(!deps.is_empty());
    for line in deps {
        assert!(
            line.contains(&format!("rev = \"{UPSTREAM_REVISION}\"")),
            "{line}"
        );
    }
}

#[test]
fn adjustments_change_only_their_own_layer() {
    let files = Files::default()
        .with("base.png", solid_png(4, 4, [100, 100, 100, 255]))
        .with("glass.png", solid_png(2, 4, [100, 100, 100, 128]));
    let mut s = spec(
        4,
        4,
        vec![
            layer("base.png", 0.0, 0.0, 1.0, 1.0),
            layer("glass.png", 0.0, 0.0, 1.0, 1.0),
        ],
    );
    s.layers[1].adjust = Some(Adjust {
        exposure: 1.0,
        ..Adjust::default()
    });
    let (w, _, data) = render(&s, &files);
    // Right half: only the unadjusted base.
    assert_eq!(px(&data, w, 3, 1), [100, 100, 100, 255]);
    // Left half: the brightened glass (~137) at 50 % over the base.
    let left = px(&data, w, 0, 1);
    assert!((116..=121).contains(&left[0]), "{left:?}");

    // A PSD bakes the adjustment into the layer's pixels and keeps its transparency.
    let (bytes, _) = composition::psd(&s, &files).unwrap();
    let file = photocraft_psd::PsdFile::from_bytes(&bytes).unwrap();
    let glass = file.layer(1).unwrap().rgba8().unwrap();
    assert!(
        (135..=139).contains(&glass.data[0]),
        "{:?}",
        &glass.data[..4]
    );
    assert_eq!(glass.data[3], 128);
}

#[test]
fn rejects_adjustments_out_of_range() {
    let files = Files::default().with("a.png", solid_png(2, 2, [1, 1, 1, 255]));
    let mut s = spec(2, 2, vec![layer("a.png", 0.0, 0.0, 1.0, 1.0)]);
    s.layers[0].adjust = Some(Adjust {
        contrast: 500.0,
        ..Adjust::default()
    });
    assert!(composition::png(&s, &files)
        .unwrap_err()
        .contains("adjustments"));
}

#[test]
fn blur_spreads_a_layer_in_the_export() {
    let files = Files::default()
        .with("base.png", solid_png(8, 4, [0, 0, 0, 255]))
        .with("panel.png", solid_png(4, 4, [255, 255, 255, 255]));
    let mut s = spec(
        8,
        4,
        vec![
            layer("base.png", 0.0, 0.0, 1.0, 1.0),
            layer("panel.png", 0.0, 0.0, 1.0, 1.0),
        ],
    );
    let (w, _, sharp) = render(&s, &files);
    assert_eq!(px(&sharp, w, 4, 1), [0, 0, 0, 255]);
    s.layers[1].adjust = Some(Adjust {
        blur: 1.5,
        ..Adjust::default()
    });
    let (w, _, blurred) = render(&s, &files);
    // The white panel now bleeds past its edge and is softer inside it.
    assert!(px(&blurred, w, 4, 1)[0] > 20, "{:?}", px(&blurred, w, 4, 1));
    assert!(px(&blurred, w, 3, 1)[0] < 255, "{:?}", px(&blurred, w, 3, 1));
}
