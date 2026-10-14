//! Reduced copies of source images for interactive previews.
//!
//! Dragging an adjustment slider asks for a new preview many times; decoding a large
//! render each time would take too long. The last few reduced sources are kept in memory,
//! keyed by path, file size and modification time so an edited file is read again.

use std::sync::{Arc, Mutex};
use std::time::SystemTime;

use photocraft_algo::resample::{resize_surface_in_canvas, Resample};
use photocraft_doc::{Rect, Surface};

use super::source::{self, Depth};
use super::PREVIEW_SIDE;

const CACHED_SOURCES: usize = 6;

pub struct Reduced {
    pub surface: Surface,
    pub width: u32,
    pub height: u32,
    pub depth: Depth,
}

type Key = (String, u64, Option<SystemTime>);

static CACHE: Mutex<Vec<(Key, Arc<Reduced>)>> = Mutex::new(Vec::new());

pub fn reduced_source(path: &str, name: &str) -> Result<Arc<Reduced>, String> {
    let meta = std::fs::metadata(path).ok();
    let key: Key = (
        path.to_string(),
        meta.as_ref().map_or(0, |m| m.len()),
        meta.and_then(|m| m.modified().ok()),
    );
    if let Ok(mut cache) = CACHE.lock() {
        if let Some(i) = cache.iter().position(|(k, _)| *k == key) {
            let entry = cache.remove(i);
            let reduced = entry.1.clone();
            cache.push(entry);
            return Ok(reduced);
        }
    }
    let pixels = source::decode(&crate::files::read_bytes(path)?, name)?;
    let reduced = Arc::new(reduce(
        pixels.surface(),
        pixels.width,
        pixels.height,
        pixels.depth,
    ));
    if let Ok(mut cache) = CACHE.lock() {
        if cache.len() >= CACHED_SOURCES {
            cache.remove(0);
        }
        cache.push((key, reduced.clone()));
    }
    Ok(reduced)
}

fn reduce(surface: Surface, width: u32, height: u32, depth: Depth) -> Reduced {
    let longest = width.max(height);
    if longest <= PREVIEW_SIDE {
        return Reduced {
            surface,
            width,
            height,
            depth,
        };
    }
    let f = f64::from(PREVIEW_SIDE) / f64::from(longest);
    let w = ((f64::from(width) * f).round() as u32).max(1);
    let h = ((f64::from(height) * f).round() as u32).max(1);
    // Edge pixels repeat outwards, so an opaque image stays opaque to its border.
    let surface = resize_surface_in_canvas(
        &surface,
        f64::from(w) / f64::from(width),
        f64::from(h) / f64::from(height),
        Resample::Bicubic,
        Rect::from_xywh(0, 0, width, height),
    );
    Reduced {
        surface,
        width: w,
        height: h,
        depth,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reduces_large_sources_to_the_preview_size() {
        let s = Surface::from_interleaved(
            Depth::Eight.pixel_format(),
            Rect::from_xywh(0, 0, 4096, 2),
            &[90u8, 80, 70, 255].repeat(4096 * 2),
        );
        let r = reduce(s, 4096, 2, Depth::Eight);
        assert_eq!((r.width, r.height), (PREVIEW_SIDE, 1));
        let px = r.surface.to_interleaved(Rect::from_xywh(1000, 0, 1, 1));
        assert_eq!(px, vec![90, 80, 70, 255]);
    }
}
