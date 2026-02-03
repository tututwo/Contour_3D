#!/usr/bin/env Rscript

suppressPackageStartupMessages({
  library(sf)
  library(terra)
  library(jsonlite)
})

# -----------------------------
# Config
# -----------------------------

bbox <- list(
  west = 9.0723,
  east = 9.9565,
  south = 51.1340,
  north = 51.4261
)

rows <- 120
cols <- 600

# For Germany, prefer ETRS89 / UTM zone 32N
# Fallback: "EPSG:32632" (WGS84 UTM 32N)
target_crs <- "EPSG:25832"

# DEM source: "auto" | "elevatr" | "geodata"
dem_source <- "auto"

# elevatr zoom level (only used if elevatr is selected)
z_level <- 9

# Smoothing
apply_smoothing <- TRUE

# If TRUE, flip row order to south->north
flip_rows <- FALSE

# Clamp percentiles (stored in meta.json; can be edited later)
# Example: low = 0.01, high = 0.98
clamp_percentiles <- list(low = 0.02, high = 1.0)

# Output directory
script_dir <- tryCatch(dirname(normalizePath(sys.frames()[[1]]$ofile)), error = function(e) NULL)
cwd <- getwd()

if (!is.null(script_dir) && basename(script_dir) == "R_data_processing") {
  project_root <- normalizePath(file.path(script_dir, ".."))
} else {
  project_root <- normalizePath(cwd)
}
output_dir <- file.path(project_root, "static", "data")

# -----------------------------
# Helpers
# -----------------------------

require_optional <- function(pkg) {
  if (!requireNamespace(pkg, quietly = TRUE)) {
    stop(sprintf("Package '%s' is required but not installed.", pkg), call. = FALSE)
  }
}

# -----------------------------
# Build AOI (EPSG:4326)
# -----------------------------

bbox_ll <- st_bbox(
  c(
    xmin = bbox$west,
    ymin = bbox$south,
    xmax = bbox$east,
    ymax = bbox$north
  ),
  crs = 4326
)

bbox_poly <- st_as_sfc(bbox_ll)

# -----------------------------
# Download DEM
# -----------------------------

message("Preparing DEM download...")

use_elevatr <- dem_source %in% c("auto", "elevatr") && requireNamespace("elevatr", quietly = TRUE)
use_geodata <- dem_source %in% c("auto", "geodata")

if (!use_elevatr && dem_source == "elevatr") {
  stop("'elevatr' selected but package is not installed.")
}

if (!use_geodata && dem_source == "geodata") {
  require_optional("geodata")
}

if (!use_elevatr && !use_geodata) {
  stop("No DEM source available. Install 'elevatr' and/or 'geodata'.")
}

dem_ll <- NULL

if (use_elevatr) {
  message("Trying elevatr...")
  dem_ll <- tryCatch({
    elevatr::get_elev_raster(
      locations = sf::st_as_sf(bbox_poly),
      z = z_level,
      clip = "bbox"
    )
  }, error = function(e) {
    message("elevatr failed: ", e$message)
    NULL
  })
}

if (is.null(dem_ll) && use_geodata) {
  require_optional("geodata")
  message("Falling back to geodata...")

  # Note: elevation_30s is global and reliable but coarse (~1km).
  # If you want more detail, try elevation_3s or elevation_1s where available.
  full <- geodata::elevation_30s(country = "DEU", path = tempdir())
  dem_ll <- terra::crop(full, terra::ext(bbox_ll))
}

if (is.null(dem_ll)) {
  stop("Failed to download DEM from any source.")
}

# Convert to terra SpatRaster
if (!inherits(dem_ll, "SpatRaster")) {
  dem_ll <- terra::rast(dem_ll)
}

# -----------------------------
# Project to meters (UTM)
# -----------------------------

message("Projecting DEM to meters (", target_crs, ")...")

dem_m <- terra::project(dem_ll, target_crs, method = "bilinear")

# Crop/mask in projected space
bbox_m <- st_transform(bbox_poly, target_crs)

dem_m <- terra::crop(dem_m, terra::vect(bbox_m))
dem_m <- terra::mask(dem_m, terra::vect(bbox_m))

# -----------------------------
# Resample to exact rows × cols
# -----------------------------

message("Resampling to grid: ", rows, " × ", cols)

ext_m <- terra::ext(dem_m)

template <- terra::rast(
  ext = ext_m,
  ncol = cols,
  nrow = rows,
  crs = target_crs
)

grid <- terra::resample(dem_m, template, method = "bilinear")

# -----------------------------
# Optional smoothing
# -----------------------------

if (apply_smoothing) {
  message("Applying smoothing...")
  kernel <- matrix(1, 3, 3) / 9
  grid <- terra::focal(grid, w = kernel, fun = "mean", na.policy = "omit")
}

# -----------------------------
# Matrix conversion and orientation
# -----------------------------

mat <- terra::as.matrix(grid, wide = TRUE)
row_order <- "north_to_south"

if (flip_rows) {
  mat <- mat[nrow(mat):1, ]
  row_order <- "south_to_north"
}

# Fill NAs to avoid broken lines
if (anyNA(mat)) {
  fill_value <- mean(mat, na.rm = TRUE)
  mat[is.na(mat)] <- fill_value
}

# -----------------------------
# Robust elevation range (for metadata + runtime clamp)
# -----------------------------

min_elev <- min(mat, na.rm = TRUE)
max_elev <- max(mat, na.rm = TRUE)

if (clamp_percentiles$low < 0 || clamp_percentiles$high > 1 || clamp_percentiles$low >= clamp_percentiles$high) {
  stop("clamp_percentiles must satisfy 0 <= low < high <= 1.")
}

p_low <- as.numeric(quantile(mat, clamp_percentiles$low, na.rm = TRUE))
p_high <- as.numeric(quantile(mat, clamp_percentiles$high, na.rm = TRUE))

if (abs(p_high - p_low) < 1e-6) {
  p_low <- min_elev
  p_high <- max_elev
}

# -----------------------------
# Export
# -----------------------------

dir.create(output_dir, recursive = TRUE, showWarnings = FALSE)

# Values.bin: row-major order
flat <- as.vector(t(mat))
values_path <- file.path(output_dir, "values.bin")
writeBin(as.numeric(flat), values_path, size = 4, endian = "little")

# Meta.json
extent_meters <- list(
  xmin = ext_m[1],
  xmax = ext_m[2],
  ymin = ext_m[3],
  ymax = ext_m[4]
)

dx <- (extent_meters$xmax - extent_meters$xmin) / cols
dy <- (extent_meters$ymax - extent_meters$ymin) / rows

meta <- list(
  rows = rows,
  cols = cols,
  bbox_lonlat = list(
    west = bbox$west,
    east = bbox$east,
    south = bbox$south,
    north = bbox$north
  ),
  crs = target_crs,
  extent_meters = extent_meters,
  dx = dx,
  dy = dy,
  rowOrder = row_order,
  rowMajor = TRUE,
  clampPercentiles = clamp_percentiles,
  clampValues = list(low = p_low, high = p_high),
  min = min_elev,
  max = max_elev,
  source = if (!is.null(attr(dem_ll, "source"))) attr(dem_ll, "source") else dem_source,
  createdAt = format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ", tz = "UTC")
)

meta_path <- file.path(output_dir, "meta.json")
jsonlite::write_json(meta, meta_path, auto_unbox = TRUE, pretty = TRUE)

message("Done.")
message("Wrote:")
message("- ", values_path)
message("- ", meta_path)
