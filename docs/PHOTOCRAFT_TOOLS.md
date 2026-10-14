# PhotoCraft tools for ArchCompose

An inventory of PhotoCraft features that ArchCompose can reuse for drawing sheets and image
editing. It records what the source says at the pinned revision and how each feature fits
ArchCompose's architecture. For the integration decisions already made, see
[UPSTREAM.md](UPSTREAM.md) and [ARCHITECTURE.md](ARCHITECTURE.md).

Source audit of commit `c699e3cda69f4852b43c0b191ab0091aaeff9d6a` (the pinned revision).
Paths starting with `crates/` refer to PhotoCraft. The findings come from reading Rust source
and Cargo manifests, not READMEs. Complexity ratings are architectural judgements. APIs listed
here are not used by ArchCompose until they compile in `src-tauri/core/src/engine/` and are
covered by tests there.

## Summary

| Question                                                                     | Answer                                                                                                                                                  |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Can a vector shape list with stroke width, colour and opacity become pixels? | **Yes**, through `photocraft-vector`: render shapes individually and composite them.                                                                    |
| At a given DPI?                                                              | **Yes, with host conversion.** The vector APIs work in pixels; the host scales geometry and stroke widths (`px = mm × dpi / 25.4`).                     |
| Can brush point lists with pressure be replayed deterministically?           | **Yes**, given the same settings, seed, samples, timestamps, smoothing zoom, initial pixels and selection. Bit identity across platforms is unverified. |
| Blur, sharpen and unsharp mask without a `Session`?                          | **Yes**, through `photocraft_algo::FilterParams` and the surface functions.                                                                             |
| Rectangle, ellipse and lasso selections as masks?                            | **Yes.** Rectangle and ellipse via vector coverage, lasso via `algo::selection::polygon`; both convert to grayscale surfaces.                           |
| Can registry commands run on a document without a `Session` or history?      | **No.** The command callback takes `&mut Session`.                                                                                                      |
| Is a generic "command id + params, return pixels" adapter feasible?          | **Partial at best.** A disposable `Session` runs a subset, but creates a temporary history and needs reconstructed tool state.                          |

ArchCompose keeps its authoritative document model and its single undo history. The fitting
pattern is the one already used for adjustments: call the lower crates directly inside the
backend engine boundary and build disposable surfaces and documents per render.

## Dependencies and complexity

Direct production dependencies from each crate's `Cargo.toml` (names without the
`photocraft-` prefix).

| Crate   | Workspace crates                                 | Other dependencies, bundled data                                                            | Complexity and fit                                                           |
| ------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| geom    | none                                             | serde                                                                                       | Low. Points, bounds, affine transforms.                                      |
| raster  | geom, color                                      | serde                                                                                       | Low. Tiled surfaces for pixels and grayscale masks. Already linked.          |
| doc     | geom, color, raster                              | serde, serde_json                                                                           | Low for transient layers and masks. Already linked.                          |
| algo    | geom, color, raster                              | serde, rustfft, rayon                                                                       | Low for filters, medium for interactive selections. Already linked.          |
| vector  | geom, color, raster, doc                         | rayon                                                                                       | Low to medium. Already a transitive dependency of compose.                   |
| compose | geom, color, raster, doc, vector                 | rayon                                                                                       | Low. Already linked.                                                         |
| paint   | geom, color, raster                              | serde                                                                                       | Medium: capture samples, persist strokes, replay, preview caches.            |
| text    | geom, color, raster, doc, psd                    | parley, skrifa, flate2; **bundled Inter and JetBrains Mono fonts and an English word list** | Medium to high: font policy, layout, packaging, preview/export parity.       |
| ops     | doc                                              | none                                                                                        | Poor fit: it is PhotoCraft's history, not a set of stateless operations.     |
| engine  | nearly all crates, plus io, plugins, craft-print | thiserror, blake3, roxmltree, resvg (via io), wasmi (via plugins) and more                  | High: `Session` coupling, tool state, history, import/export, text, plugins. |
| tablet  | none                                             | macOS AppKit or Linux X11 only                                                              | Not usable on Windows (no backend).                                          |

None of these manifests depends directly on egui or wgpu. The full transitive closure of
`engine` was not audited. `photocraft-text` has no Cargo feature to drop its bundled fonts or
word list.

## Vector drawing

Sources: `crates/doc/src/vector.rs`, `crates/vector/src/{lib,shapes,edit,map,stroke}.rs`.
No `Session` needed.

```rust
// photocraft_doc::vector (re-exported at the photocraft_doc root)
Knot::corner(x: f64, y: f64) -> Self
Subpath::polyline(pts: &[(f64, f64)]) -> Self
Subpath::polygon(pts: &[(f64, f64)]) -> Self
Path::new(subpaths: Vec<Subpath>) -> Self
Path::transform(&self, a: &Affine) -> Path

// photocraft_vector::shapes
rect(x: f64, y: f64, w: f64, h: f64) -> Path
ellipse(x: f64, y: f64, w: f64, h: f64) -> Path
line(a: (f64, f64), b: (f64, f64), weight: f64) -> Path   // a filled bar, not a stroke

// photocraft_vector
render_shape(shape: &ShapeLayer, format: PixelFormat, clip: Rect) -> Surface
path_coverage(path: &Path, rect: Rect) -> Vec<f32>
stroke_rasterizer(path: &Path, style: &StrokeStyle, tol: f64) -> Rasterizer
coverage_surface(r: &Rasterizer, format: PixelFormat, clip: Rect) -> Surface
```

- A `ShapeLayer` holds a `path`, an optional fill, an optional `ShapeStroke` (width, paint,
  opacity, alignment, caps, joins, miter limit, dashes) and a raster cache.
- ArchCompose's sheet elements map directly: pen paths and polylines to open subpaths of
  corner knots, rectangles and circles to `shapes::rect` and `shapes::ellipse`, stroke width,
  colour and opacity to `ShapeStroke`. Use a stroked two-point subpath for lines, not
  `shapes::line`.
- `Path::transform` does not scale `ShapeStroke` widths; scale them separately when
  rendering at a DPI.
- Selection, hit testing and transforms stay in ArchCompose's model; `vector::edit` offers
  hit and anchor-editing helpers if Bézier editing is added later.

## Brush and eraser painting

Sources: `crates/paint/src/{lib,brush,render,dynamics,rng}.rs`.

```rust
StrokePoint::new(x: f64, y: f64, pressure: f32) -> Self
render_stroke(target: &mut Surface, brush: &BrushSettings, points: &[StrokePoint],
              selection: Option<&Surface>, lock_transparency: bool, zoom: f32) -> Rect
StrokeRenderer::{new, push, finish, composite}
```

- `Stroke { brush, points }` is serde-serializable. Samples carry position, pressure, tilt,
  rotation, wheel and a timestamp. Brush settings include size in pixels, hardness, spacing,
  opacity, flow, colour, pressure dynamics, `erase`, blend mode, tip, smoothing and a `seed`.
- Randomness is derived from seed, index and stream, so replay is deterministic for equal
  inputs. Zoom affects smoothing when `adjust_for_zoom` is set; store it or replay at a fixed
  value.
- Raster erasing is `BrushSettings.erase = true`. For masks, paint grayscale values.
- This is a dab engine for raster layers; it is not the renderer for vector sheet elements.

## Masks and selections

Sources: `crates/doc/src/lib.rs`, `crates/vector/src/lib.rs`, `crates/algo/src/selection.rs`.

```rust
LayerMask::reveal_all() / hide_all() / value(x, y)
vector_mask_values(m: &VectorMask, rect: Rect) -> Vec<f32>
selection::polygon(points: &[(f32, f32)], area: Rect, anti_alias: bool) -> Vec<f32>
selection::mask_to_surface(m: &[f32], area: Rect) -> Surface
selection::combine(old: Option<&Surface>, new: &[f32], area: Rect, mode: SelectionMode) -> Option<Surface>
selection::{feather, expand, contract, border, smooth}(m, w, h, r) -> Vec<f32>
selection::magic_wand(...) / color_range(...)
```

- Selection modes: replace, add, subtract, intersect. Masks are quantized to 8-bit gray.
- A `None` selection in brush and filter calls means "unrestricted", not "empty".
- `VectorMask.feather` is stored but rendered unfeathered (per a source comment); do not
  offer vector mask feathering.

## Filters

Sources: `crates/algo/src/{lib,blur,sharpen}.rs`, `crates/engine/src/filters.rs`.

```rust
photocraft_algo::apply_in_with(surface, params: &FilterParams, area, bounds, selection,
                               extent, ctl: &Interrupt) -> Option<Surface>
```

| `FilterParams` variant                                                                    | Behaviour                                                       |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `GaussianBlur { radius }`                                                                 | Sigma in pixels; three box passes above 4 px.                   |
| `BoxBlur { radius }`                                                                      | Box width `2r + 1`.                                             |
| `UnsharpMask { amount, radius, threshold }`                                               | Amount in percent, radius in pixels, threshold in 0–255 levels. |
| `SmartSharpen`, `HighPass`, `MotionBlur`, `SurfaceBlur`, median, noise, emboss and others | Available; validate parameters at the host boundary.            |

Photoshop's plain "Blur" and "Sharpen" are presets in the engine registry (Gaussian 0.6 px;
unsharp 60 %, 0.5 px, 0), not separate variants. Use the checked `apply_in_with`, which
returns `None` on failure, so errors can be reported.

## Adjustments

`photocraft_compose::adjust::apply(adj: &Adjustment, buf: &mut Buffer)` with
`photocraft_doc::Adjustment` variants: Exposure, BrightnessContrast, Vibrance, Levels, Curves,
HueSaturation, BlackWhite, ColorBalance, ChannelMixer, SelectiveColor, GradientMap, PhotoFilter,
Invert, Threshold, Posterize. ColorLookup needs a valid LUT; unsupported variants are treated
as identity and must not be offered. ArchCompose already uses this path in `engine/adjust.rs`.

## Text

`photocraft_text::TextEngine::{new, layout, render, render_layer}` lays out and rasterizes a
`TextLayer` at an explicit DPI, using bundled fonts (Inter, JetBrains Mono). Using it means
shipping those fonts and the word list, and matching the web view's text preview to the engine's
layout. Decide font packaging and licensing first.

## Engine command registry

Sources: `crates/engine/src/{commands,lib}.rs`.

```rust
photocraft_engine::commands::command_specs() -> &'static [CommandSpec]
CommandSpec { id, params /* human-readable text, not a schema */,
              run: fn(&mut Session, &Value) -> Result<Value>, enabled: fn(&Session) -> ..., .. }
Session::{new, add_document, execute, edit}
```

`DocState::new` creates a `History`, and `Session::edit` records undo states.

| Adapter                                                  | Verdict                                                                                                             |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Run a registry command on a `Document` without `Session` | **No.** Callbacks and editing APIs require a `Session`.                                                             |
| Disposable `Session` per request                         | **Partial.** No persistent second authority, but a temporary history, and selection and tool state must be rebuilt. |
| Arbitrary id + params returning pixels                   | **No** as an editing contract: commands can change structure, read the clipboard or preferences, or do I/O.         |
| Typed allowlist in ArchCompose calling the lower crates  | **Yes.** Explicit inputs, host validation, no second history.                                                       |

ArchCompose therefore does not expose the command registry. Each reused tool is a typed
operation whose parameters live in the ArchCompose document.

## Not reusable or not worth it

- **`ops`**: PhotoCraft's history; it would duplicate the store's undo.
- **`engine` for basic tools**: the `Session` coupling and the font, import and plugin
  dependencies cost far more than the lower crates.
- **`tablet`**: no Windows backend. Pointer events in the web view provide pressure instead.
- **`text` for geometry only**: unnecessary for vector primitives.
- **PhotoCraft documents as the project format**: engine documents and caches are transient.
- **Unsupported semantics**: vector-mask feather, unsupported adjustments, missing-LUT colour
  lookup, and cross-platform brush bit identity must not be advertised.

## Integration order

1. **Vector sheet primitives.** Sheet elements in the ArchCompose model, rendered as SVG in the
   web view and rasterized by `photocraft-vector` for export at an explicit DPI.
2. **Filters and adjustments.** Gaussian blur and unsharp mask per layer, following the
   adjustment pattern; further tone adjustments.
3. **Selections and raster masks.** Rectangle, ellipse and lasso coverage, combine modes,
   feather, grayscale layer masks.
4. **Brush and eraser on raster layers.** Persist settings, samples and seed; replay for
   preview and export; one undo step per stroke.
5. **Text in the engine.** After deciding font packaging.
6. **Specialised retouch tools.** One at a time, through the lower crates.
