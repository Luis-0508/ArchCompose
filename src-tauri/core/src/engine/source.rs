//! Reading source images into engine pixels.
//!
//! Every source ends up as straight-alpha sRGB RGBA, 8 or 16 bits per sample, which is
//! what the compositor and the exporters work with. Files are decoded by PhotoCraft's
//! codecs (flat formats) or its PSD reader (the merged composite of a PSD or PSB), with
//! ArchCompose's own limits so a crafted file cannot exhaust memory.

use photocraft_cms::{builtin, ColorSpace, Intent, Profile, Transform};
use photocraft_codecs::{ChannelLayout, DecodeOptions, Image, Limits, SampleType};
use photocraft_doc::{PixelFormat, Rect, Surface};

/// Largest source image, in pixels (16384 × 16384). Larger files are refused before
/// their pixels are allocated.
pub const MAX_SOURCE_PIXELS: u64 = 1 << 28;
/// Largest source image side.
pub const MAX_SOURCE_SIDE: u32 = 65_536;

/// Decoded pixels: interleaved RGBA, native-endian samples, sRGB, straight alpha.
#[derive(Debug, Clone, PartialEq)]
pub struct RgbaPixels {
    pub width: u32,
    pub height: u32,
    pub depth: Depth,
    pub data: Vec<u8>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Depth {
    Eight,
    Sixteen,
}

impl Depth {
    pub fn bits(self) -> u8 {
        match self {
            Depth::Eight => 8,
            Depth::Sixteen => 16,
        }
    }
    pub fn pixel_format(self) -> PixelFormat {
        match self {
            Depth::Eight => PixelFormat::RGBA8,
            Depth::Sixteen => PixelFormat::RGBA16,
        }
    }
    /// The sample type of an engine document at this depth.
    pub fn doc_sample_type(self) -> photocraft_doc::SampleType {
        match self {
            Depth::Eight => photocraft_doc::SampleType::U8,
            Depth::Sixteen => photocraft_doc::SampleType::U16,
        }
    }
    pub fn sample_type(self) -> SampleType {
        match self {
            Depth::Eight => SampleType::U8,
            Depth::Sixteen => SampleType::U16,
        }
    }
}

impl RgbaPixels {
    pub fn surface(&self) -> Surface {
        let rect = Rect::from_xywh(0, 0, self.width, self.height);
        Surface::from_interleaved(self.depth.pixel_format(), rect, &self.data)
    }
}

pub fn limits() -> Limits {
    Limits {
        max_width: MAX_SOURCE_SIDE,
        max_height: MAX_SOURCE_SIDE,
        max_pixels: MAX_SOURCE_PIXELS,
        // RGBA at 32-bit float is 16 bytes per pixel.
        max_alloc: MAX_SOURCE_PIXELS * 16,
    }
}

fn is_psd(bytes: &[u8]) -> bool {
    bytes.starts_with(b"8BPS")
}

/// Decodes a file's bytes. `name` is only used in messages.
pub fn decode(bytes: &[u8], name: &str) -> Result<RgbaPixels, String> {
    let image = if is_psd(bytes) {
        super::psd_file::merged_image(bytes, name)?
    } else {
        decode_flat(bytes, name)?
    };
    normalize(image, name)
}

fn decode_flat(bytes: &[u8], name: &str) -> Result<Image, String> {
    let Some(format) = photocraft_codecs::detect(bytes) else {
        return Err(format!(
            "“{name}” is not an image format ArchCompose can read."
        ));
    };
    let options = DecodeOptions {
        limits: limits(),
        ..DecodeOptions::default()
    };
    photocraft_codecs::decode_as_with(format, bytes, &options).map_err(|e| match e {
        photocraft_codecs::CodecError::LimitExceeded(_) => too_large(name),
        photocraft_codecs::CodecError::Unsupported { reason, .. } => {
            format!("“{name}” uses a variant of its format that is not supported: {reason}.")
        }
        other => format!("“{name}” could not be decoded. The file may be damaged ({other})."),
    })
}

pub fn too_large(name: &str) -> String {
    format!(
        "“{name}” is larger than {} megapixels, the most ArchCompose can process.",
        MAX_SOURCE_PIXELS / 1_000_000
    )
}

/// Converts any decoded image to sRGB RGBA at 8 or 16 bits.
///
/// - 8-bit sources stay 8-bit; 16-bit and float sources become 16-bit.
/// - Float sources (OpenEXR, Radiance HDR) are scene-linear: they are encoded to sRGB and
///   values above 1.0 are clipped. There is no tone mapping.
/// - An embedded RGB or CMYK ICC profile is converted to sRGB; CMYK without a profile uses
///   PhotoCraft's built-in coated CMYK profile. Gray profiles are not applied.
pub fn normalize(image: Image, name: &str) -> Result<RgbaPixels, String> {
    let (width, height) = image.dimensions();
    let profile = image
        .icc
        .as_deref()
        .and_then(|icc| Profile::parse(icc).ok());
    let float = matches!(image.sample_type(), SampleType::F16 | SampleType::F32);
    let cmyk = matches!(image.layout(), ChannelLayout::Cmyk | ChannelLayout::CmykA);
    let depth = if image.sample_type() == SampleType::U8 {
        Depth::Eight
    } else {
        Depth::Sixteen
    };

    if float || cmyk {
        let source = match &profile {
            Some(p) if cmyk && p.color_space == ColorSpace::Cmyk => p,
            Some(p) if !cmyk && p.color_space == ColorSpace::Rgb => p,
            _ if cmyk => {
                builtin::default_for(ColorSpace::Cmyk).ok_or_else(|| conversion_failed(name))?
            }
            _ => builtin::Builtin::LinearSrgb.profile(),
        };
        let transform = Transform::new(source, builtin::srgb(), Intent::RelativeColorimetric, cmyk)
            .map_err(|_| conversion_failed(name))?;
        let (layout, stride) = if cmyk {
            (ChannelLayout::CmykA, 5)
        } else {
            (ChannelLayout::Rgba, 4)
        };
        let samples = image
            .convert(layout, SampleType::F32)
            .to_f32_samples()
            .ok_or_else(|| conversion_failed(name))?;
        drop(image);
        let mut rgba = try_zeroed::<f32>(width as usize * height as usize * 4)
            .ok_or_else(|| too_large(name))?;
        transform.convert_f32(&samples, stride, &mut rgba, 4, true);
        drop(samples);
        return Ok(RgbaPixels {
            width,
            height,
            depth,
            data: quantize(&rgba, depth),
        });
    }

    let mut data = image
        .convert(ChannelLayout::Rgba, depth.sample_type())
        .into_data();
    if let Some(p) = profile.filter(|p| p.color_space == ColorSpace::Rgb && !is_srgb(p)) {
        let transform = Transform::new(&p, builtin::srgb(), Intent::RelativeColorimetric, false)
            .map_err(|_| conversion_failed(name))?;
        convert_in_place(&transform, &mut data, depth);
    }
    Ok(RgbaPixels {
        width,
        height,
        depth,
        data,
    })
}

fn conversion_failed(name: &str) -> String {
    format!("The colours of “{name}” could not be converted to sRGB. Its colour profile may be damaged.")
}

/// sRGB-tagged files are already in the working space; converting them would only add
/// rounding.
fn is_srgb(p: &Profile) -> bool {
    p.same_colors(builtin::srgb())
}

fn convert_in_place(t: &Transform, data: &mut [u8], depth: Depth) {
    const CHUNK_PIXELS: usize = 64 * 1024;
    match depth {
        Depth::Eight => {
            for chunk in data.chunks_mut(CHUNK_PIXELS * 4) {
                let src = chunk.to_vec();
                t.convert_u8(&src, 4, chunk, 4, true);
            }
        }
        Depth::Sixteen => {
            for chunk in data.chunks_mut(CHUNK_PIXELS * 8) {
                let src: Vec<u16> = u16_samples(chunk);
                let mut dst = vec![0u16; src.len()];
                t.convert_u16(&src, 4, &mut dst, 4, true);
                for (b, v) in chunk.as_chunks_mut::<2>().0.iter_mut().zip(dst) {
                    *b = v.to_ne_bytes();
                }
            }
        }
    }
}

fn quantize(values: &[f32], depth: Depth) -> Vec<u8> {
    let clamp = |v: f32| if v.is_nan() { 0.0 } else { v.clamp(0.0, 1.0) };
    match depth {
        Depth::Eight => values
            .iter()
            .map(|&v| (clamp(v) * 255.0 + 0.5) as u8)
            .collect(),
        Depth::Sixteen => values
            .iter()
            .flat_map(|&v| ((clamp(v) * 65535.0 + 0.5) as u16).to_ne_bytes())
            .collect(),
    }
}

/// Native-endian 16-bit samples from bytes.
pub fn u16_samples(bytes: &[u8]) -> Vec<u16> {
    bytes
        .as_chunks::<2>()
        .0
        .iter()
        .map(|b| u16::from_ne_bytes(*b))
        .collect()
}

/// A zeroed buffer, or `None` when it cannot be allocated (instead of aborting).
pub fn try_zeroed<T: Clone + Default>(len: usize) -> Option<Vec<T>> {
    let mut v = Vec::new();
    v.try_reserve_exact(len).ok()?;
    v.resize(len, T::default());
    Some(v)
}

#[cfg(test)]
mod tests {
    use super::*;
    use photocraft_codecs::{EncodeOptions, Format};

    fn png(width: u32, height: u32, rgba: &[u8]) -> Vec<u8> {
        let img = Image::from_u8(width, height, ChannelLayout::Rgba, rgba.to_vec()).unwrap();
        photocraft_codecs::encode(&img, Format::Png, &EncodeOptions::default()).unwrap()
    }

    #[test]
    fn decodes_png_with_alpha_unchanged() {
        let px = [255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 10, 20, 30, 40];
        let decoded = decode(&png(2, 2, &px), "a.png").unwrap();
        assert_eq!(
            (decoded.width, decoded.height, decoded.depth),
            (2, 2, Depth::Eight)
        );
        assert_eq!(decoded.data, px);
    }

    #[test]
    fn sixteen_bit_sources_stay_sixteen_bit() {
        let samples: Vec<u16> = vec![65535, 32768, 0, 65535];
        let img = Image::from_u16(1, 1, ChannelLayout::Rgba, &samples).unwrap();
        let tiff =
            photocraft_codecs::encode(&img, Format::Tiff, &EncodeOptions::default()).unwrap();
        let decoded = decode(&tiff, "a.tif").unwrap();
        assert_eq!(decoded.depth, Depth::Sixteen);
        let back: Vec<u16> = u16_samples(&decoded.data);
        assert_eq!(back, samples);
    }

    #[test]
    fn linear_float_sources_are_encoded_to_srgb() {
        // Linear 0.214 is sRGB ~0.5.
        let img = Image::from_f32(1, 1, ChannelLayout::Rgba, &[0.214, 0.0, 1.0, 1.0]).unwrap();
        let decoded = normalize(img, "a.exr").unwrap();
        let v: Vec<u16> = u16_samples(&decoded.data);
        assert!((v[0] as i32 - 32768).abs() < 400, "{v:?}");
        assert_eq!(v[1], 0);
        assert_eq!(v[2], 65535);
        assert_eq!(v[3], 65535);
    }

    #[test]
    fn rejects_unknown_corrupt_and_truncated_files() {
        assert!(decode(b"definitely not an image", "notes.png")
            .unwrap_err()
            .contains("not an image format"));
        let mut file = png(64, 64, &[200; 64 * 64 * 4]);
        file.truncate(file.len() / 2);
        let err = decode(&file, "cut.png").unwrap_err();
        assert!(err.contains("cut.png"), "{err}");
        // A PNG header that declares an absurd size is refused before allocating.
        let mut bomb = png(1, 1, &[0, 0, 0, 0]);
        bomb[16..20].copy_from_slice(&100_000u32.to_be_bytes());
        bomb[20..24].copy_from_slice(&100_000u32.to_be_bytes());
        assert!(decode(&bomb, "bomb.png").is_err());
    }
}
