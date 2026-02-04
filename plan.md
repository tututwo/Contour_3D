# 3D Ridgeline Plan (R → Three.js)

**Goal:** Build a 3D ridgeline map (one polyline per DEM row) for:
- West: 9.0723° E
- East: 9.9565° E
- South: 51.1340° N
- North: 51.4261° N

This plan keeps the pipeline deterministic, documents orientation explicitly, and makes the Three.js geometry placement unambiguous.

---

# Part A — R pipeline (online DEM → fixed grid → export)

## A0) Packages & setup (do this once)

Required:
- `terra`, `sf` for raster + vector workflows
- `elevatr` (primary online source)
- `geodata` (fallback, very reliable)
- `jsonlite` for `meta.json`

Recommended install snippet:

```r
install.packages(c("terra", "sf", "elevatr", "geodata", "jsonlite"))
```

---

## A1) Define inputs and resolution

Inputs:
- `bbox_ll` (lon/lat, EPSG:4326)
- `rows` (number of ridgeline slices, e.g. 120)
- `cols` (points per slice, e.g. 600)

Logic:
- `rows` controls the number of layers (depth)
- `cols` controls smoothness of each layer

---

## A2) Build the AOI polygon in EPSG:4326

```r
bbox_ll <- st_bbox(c(
  xmin = 9.0723,
  ymin = 51.1340,
  xmax = 9.9565,
  ymax = 51.4261
), crs = 4326)

bbox_poly <- st_as_sfc(bbox_ll)
```

---

## A3) Download DEM (online)

### Primary: `elevatr`
```r
dem_ll <- elevatr::get_elev_raster(
  locations = bbox_poly,
  z = 9,  # start moderate; adjust if needed
  clip = "bbox"
)
```

### Fallback: `geodata`
```r
# Example: SRTM 30m; geodata auto-downloads tiles
full <- geodata::elevation_30s(country = "DEU", path = tempdir())
dem_ll <- terra::crop(full, terra::ext(bbox_ll))
```

**Keep only one:** whichever succeeded.

---

## A4) Project to meters (critical for 3D scale)

For Germany, prefer **ETRS89 / UTM zone 32N**:
- Recommended: `EPSG:25832`
- Acceptable: `EPSG:32632` (WGS84 UTM 32N)

```r
target_crs <- "EPSG:25832"

dem_m <- terra::project(dem_ll, target_crs, method = "bilinear")
```

---

## A5) Crop/mask again in projected space

```r
bbox_m <- st_transform(bbox_poly, target_crs)

dem_m <- terra::crop(dem_m, terra::vect(bbox_m))
dem_m <- terra::mask(dem_m, terra::vect(bbox_m))
```

---

## A6) Resample to exact `rows × cols`

```r
ext_m <- terra::ext(dem_m)

template <- terra::rast(
  ext = ext_m,
  ncol = cols,
  nrow = rows,
  crs = target_crs
)

grid <- terra::resample(dem_m, template, method = "bilinear")
```

Compute cell sizes to export:

```r
cell_dx <- (ext_m[2] - ext_m[1]) / cols
cell_dy <- (ext_m[4] - ext_m[3]) / rows
```

---

## A7) Optional smoothing (visual quality)

Use gentle smoothing to remove pixel noise:

```r
kernel <- matrix(1, 3, 3) / 9
grid_smooth <- terra::focal(grid, w = kernel, fun = "mean", na.policy = "omit")
```

---

## A8) Matrix orientation and row order (make it explicit)

```r
mat <- terra::as.matrix(grid_smooth, wide = TRUE)
```

**Important:** `terra::as.matrix()` returns rows from **north → south**. We will:
- Keep this orientation
- Record `rowOrder = "north_to_south"` in `meta.json`

If you want south-to-north order instead, flip:

```r
mat <- mat[nrow(mat):1, ]
```

---

## A9) Handle NAs (fill for clean ridgelines)

Fill NAs to avoid line breaks:

```r
if (anyNA(mat)) {
  # Simple replacement with local mean
  mat[is.na(mat)] <- mean(mat, na.rm = TRUE)
}
```

---

## A10) Robust elevation normalization stats (configurable via meta.json)

We do **not** clamp the exported grid. We export raw values and store
percentile settings in `meta.json` so you can edit clamp percentiles later.

```r
clamp_percentiles <- list(low = 0.02, high = 1.0)
p_low <- as.numeric(quantile(mat, clamp_percentiles$low, na.rm = TRUE))
p_high <- as.numeric(quantile(mat, clamp_percentiles$high, na.rm = TRUE))
```

---

## A11) Export files

### 1) `meta.json`
Include:
- `rows`, `cols`
- `bbox_lonlat`
- `crs`
- `extent_meters`
- `dx`, `dy`
- `rowOrder` (e.g., `north_to_south`)
- `rowMajor` = true
- `clampPercentiles` (editable later, e.g., `{low: 0.01, high: 0.98}`)
- `clampValues` (the default computed `p_low/p_high` for reference)
- `min`, `max` (raw data range)

### 2) `values.bin`
**Row-major order is required.**
Export **raw** values so you can adjust clamping later:

```r
flat <- as.vector(t(mat))
writeBin(as.single(flat), "values.bin", size = 4, endian = "little")
```

### 3) Optional `places.json`
Store `lon`, `lat`, and **projected** `x_m`, `y_m` for labels:

```r
coords_m <- sf::st_transform(sf::st_sfc(sf::st_point(c(lon, lat)), crs=4326), target_crs)
```

---

# Part B — Three.js pipeline (ridgelines + depth)

## B0) Scene setup (Three.js fundamentals)

- `Scene`, `PerspectiveCamera`, `WebGLRenderer`
- `OrbitControls` with damping
- Add `Fog` or `FogExp2` for atmospheric depth

---

## B1) Load `meta.json` and `values.bin`

- Fetch `meta.json`
- Fetch `values.bin` as `ArrayBuffer`
- Create `Float32Array`
- Validate `values.length === rows * cols`

---

## B2) Decide scene scale

Use projected meters for physical correctness, then scale down:

```js
const scale = 1 / 1000; // meters → scene units
const width = (extent.xmax - extent.xmin) * scale;
const depth = (extent.ymax - extent.ymin) * scale;
```

---

## B3) Height normalization (driven by meta.json)

```js
// clampLow/clampHigh computed from values + meta.clampPercentiles
const zNorm = (clampedElev - clampLow) / (clampHigh - clampLow);
const z = zNorm * zScale;
```

Recommended starting point:
- `zScale ≈ 0.15 * width`

---

## B4) Build ribbon geometry (filled area per row)

Goal: each row is a **filled strip** between the elevation line and a baseline.

For each row `i`:
- `idx = i * cols + j`
- Use `dx`, `dy` and `rowOrder` from `meta.json`

Algorithm:
1. **Positions**: for each `j`, create two vertices
   - top: `(x, y, z)`
   - base: `(x, y, zBase)` where `zBase = 0` (or a small negative offset)
2. **Indices**: connect adjacent column pairs into triangles
   - For each column segment `j → j+1`, create two triangles:
     - `(top_j, base_j, top_{j+1})`
     - `(base_j, base_{j+1}, top_{j+1})`
3. Create an indexed `BufferGeometry` and render as `THREE.Mesh`.

Example mapping:

```js
const yIndex = rowOrder === "north_to_south" ? i : (rows - 1 - i);
const x = (j * dx) * scale + xOffset;
const y = (yIndex * dy) * scale + yOffset;
```

Material:
- `MeshBasicMaterial` (unlit) with `transparent: true`
- `opacity: 0.2–0.5`
- `side: THREE.DoubleSide`
- `depthWrite: false`

---

## B5) Color strategies (ribbons)

### Simple (good first pass)
- Color by row index using a gradient palette.

### Height-based (uses shaders)
Use `ShaderMaterial` or `onBeforeCompile` to color by `position.z`:
- Add `zMin/zMax` uniforms
- Compute `t = clamp((position.z - zMin)/(zMax - zMin), 0.0, 1.0)`
- Mix between two or three colors

---

## B6) Transparency + fog for depth layering

- `transparent: true`
- `opacity: 0.25–0.6`
- `depthWrite: false` (reduces sorting artifacts)
- `scene.fog = new THREE.Fog(...)`

Optional: fade far lines by row index.

---

## B7) Line thickness (no longer an issue)

Ribbons are meshes, so line width limits do not apply.

---

# Ribbon Implementation Plan (Actionable Steps)

1. **Add ribbon settings**
   - `rowStep` (skip rows, e.g., 2 or 3)
   - `zBase` (baseline height; usually `0`)
   - `ribbonOpacity` (e.g., `0.25`)

2. **Replace `THREE.Line` with `THREE.Mesh`**
   - For each row:
     - Build `positions` with `2 * usedCols` vertices
     - Build `indices` with `(usedCols - 1) * 6` entries
     - Create `BufferGeometry` and set `position` + `index`
     - `geometry.computeVertexNormals()` (optional, even if unlit)

3. **Color per-row**
   - Use a single color per mesh (row gradient)
   - Use `MeshBasicMaterial` with transparency

4. **Tune sparsity**
   - Lower `rows` in R **or** render every `rowStep` row in JS
   - Increase `depthScale` for clearer separation

5. **Reduce X-detail if needed**
   - Lower `cols` in R **or** decimate columns in JS
   - Optional 1D smoothing along row

6. **Camera + background**
   - Slightly higher camera angle
   - Light background or lower opacity for chart-like effect

---

# Next Tasks Plan (Requested Changes)

## 1) Fix: Rerun `data-processing.r` but outputs don’t change

**Likely cause:** output path or overwrite behavior doesn’t match the “data” folder you’re inspecting.

**Plan:**
1. **Make output folder explicit and configurable**
   - Add a top‑level `output_dir` config that defaults to `static/data`.
   - Allow override via CLI arg (e.g. `--out=static/data`) or environment variable.
2. **Log absolute output paths**
   - Print the full path for `values.bin` and `meta.json` every run.
3. **Write a run manifest**
   - Write `static/data/manifest.json` with `rows`, `cols`, `createdAt`, filter settings.
   - This makes it obvious if a re-run happened.
4. **Force overwrite**
   - `file.remove(values_path, meta_path)` before writing (optional).
   - Write to a temp file then replace (prevents partial writes).

**Success check:** `manifest.json` and `meta.json` show the new `rows` values and timestamp.

---

## 2) Switchable filters (bilinear / Gaussian / 1D smooth)

**Goal:** choose resampling and smoothing without changing code.

**Plan:**
1. Add config flags in `data-processing.r`:
   - `resample_method = "bilinear" | "nearest"`
   - `smoothing_method = "none" | "gaussian2d" | "mean2d" | "gaussian1d_x" | "gaussian1d_y"`
   - `gaussian_sigma` + `gaussian_radius`
2. Implement options:
   - **Resample:** `terra::resample(..., method = resample_method)`
   - **Gaussian 2D:** `kernel <- terra::focalMat(grid, sigma, type="Gauss")` then `terra::focal(...)`
   - **Mean 2D:** 3×3 or 5×5 uniform kernel
   - **Gaussian 1D (X):** use a 1×N kernel
   - **Gaussian 1D (Y):** use an N×1 kernel
3. Store chosen filter settings in `meta.json` for traceability.

**Success check:** toggling settings yields visibly smoother or more jagged ribbons.

---

## 3) Background + lighting (chart-like feel)

**Goal:** match the soft, paper‑like look of `demo-threejs.png`.

**Plan:**
1. **Switch ribbon material to lit**
   - Use `MeshLambertMaterial` (diffuse) or `MeshPhongMaterial` (slightly glossy).
   - Keep `transparent: true`, `opacity: 0.2–0.4`, `side: DoubleSide`.
2. **Add simple lights**
   - `AmbientLight` (soft base, low intensity).
   - One `DirectionalLight` to give gentle shading.
3. **Lighten background**
   - Change background to a light gray or soft blue.
   - Optionally add subtle fog to push depth.
4. **Palette tuning**
   - Desaturate row gradient to match the reference (cool blues + a single accent).

**Success check:** ribbons read as translucent filled areas rather than wireframes.

---

## B8) Camera framing

- Compute bounding box of all lines
- Place camera to fit the box
- `controls.target` = center

---

## B9) Labels / places (optional)

If `places.json` includes projected meters:
- Convert to scene units with the same `scale`
- Sample height via bilinear interpolation for accurate Z
- Add text labels (Troika or canvas sprites)

---

# Implementation order (to avoid getting stuck)

1. R: download DEM → project → resample to **small grid** (e.g. 60×200) → export `meta.json + values.bin`
2. Three.js: load files → build ridgelines → OrbitControls working
3. Tune `zScale`, fog, opacity, palette
4. Increase grid resolution (120×600)
5. Add labels/places (optional)

---

# Border Artifact Investigation Plan (unexpected outline)

## Hypothesis
The “border” is likely caused by edge rows/cols being **flat or constant** due to:
- NA fill at the raster boundary (mean fill creates a straight edge),
- heavy smoothing near edges,
- or a single edge row (first/last) being much flatter than the interior.

## Steps
1. **Verify edge behavior**  
   Log min/max per row/col in JS (or inspect in R) to see if the first/last
   rows or columns are nearly constant.

2. **Test without NA fill**  
   Temporarily keep NA values and skip those points (or drop the first/last
   row/col) to see if the border disappears.

3. **Use better NA fill**  
   Replace mean fill with **nearest-neighbor** or **IDW** fill so edges
   blend naturally.

4. **Edge trim (quick fix)**  
   As a visual fix, ignore 1–2 rows/cols at the perimeter to remove the outline.

5. **Optional fade**  
   Apply an alpha fade at the row endpoints (left/right edges) to soften any
   remaining outline.


# JS Refactor Plan (Script.js → Modules)

## Summary
Split `src/script.js` into focused modules (settings, scene setup, data load, geometry, materials, post-processing). Move inline shaders to `src/shaders/ribbon/`. Keep `main.js` as the entry point.

## Proposed Folder Structure

```
src/
  main.js                 // entry point (replaces script.js)
  config/
    settings.js           // SETTINGS object
  core/
    scene.js              // createScene()
    camera.js             // createCamera(), frameCamera()
    renderer.js           // createRenderer()
    controls.js           // createControls()
    lights.js             // addLights()
    resize.js             // attachResizeHandler()
  data/
    loadTerrain.js        // fetch meta.json + values.bin
    normalize.js          // clamp/percentile helpers
  geometry/
    ribbon.js             // buildRibbonMesh()
    stroke.js             // buildStroke()
  materials/
    ribbonMaterial.js     // createRibbonMaterial()
    strokeMaterial.js     // createStrokeMaterial()
  post/
    composer.js           // createComposer()
  shaders/
    ribbon/
      height.vert.glsl    // moved from inline shader strings
      height.frag.glsl    // moved from inline shader strings
  utils/
    gradient.js           // sampleGradient()
    math.js               // computeQuantile(), helpers
```

## Shader Move (Required)
- Inline GLSL in `script.js` becomes:
  - `src/shaders/ribbon/height.vert.glsl`
  - `src/shaders/ribbon/height.frag.glsl`
- Import in `materials/ribbonMaterial.js` via Vite GLSL plugin.

## Step-by-step Migration
1. Create `config/settings.js` and move SETTINGS out of script.
2. Split scene/camera/renderer/controls/lights into `core/`.
3. Split data load + normalization into `data/`.
4. Split ribbon/stroke generation into `geometry/`.
5. Split materials into `materials/`, importing shaders.
6. Split post-processing into `post/`.
7. Replace `script.js` with `main.js` orchestrating the flow.
8. Update `src/index.html` to load `main.js`.

## Tests / Validation
- App runs with same visuals.
- Resize works.
- Shader imports resolve.
- Post-processing still enabled.

## Assumptions
- Vite GLSL plugin remains enabled.
- No behavior changes, only refactor.
