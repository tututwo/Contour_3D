#!/usr/bin/env Rscript

suppressPackageStartupMessages({
  library(sf)
  library(terra)
  library(jsonlite)
})

# -----------------------------
# Config
# -----------------------------

args <- commandArgs(trailingOnly = TRUE)

get_arg_value <- function(prefix) {
  hit <- args[startsWith(args, prefix)]
  if (length(hit) == 0) return(NA_character_)
  sub(prefix, "", hit[[1]])
}

read_env_or_arg <- function(env_key, arg_prefix, default) {
  arg_val <- get_arg_value(arg_prefix)
  if (!is.na(arg_val) && nzchar(arg_val)) return(arg_val)
  env_val <- Sys.getenv(env_key, "")
  if (nzchar(env_val)) return(env_val)
  return(default)
}

bbox <- list(
  west = 9.0723,
  east = 9.9565,
  south = 51.1340,
  north = 51.4261
)

rows <- as.integer(read_env_or_arg("RIDGE_ROWS", "--rows=", 120))
cols <- as.integer(read_env_or_arg("RIDGE_COLS", "--cols=", 600))

# For Germany, prefer ETRS89 / UTM zone 32N
# Fallback: "EPSG:32632" (WGS84 UTM 32N)
target_crs <- "EPSG:25832"

# DEM source: "auto" | "elevatr" | "geodata"
dem_source <- "auto"

# elevatr zoom level (only used if elevatr is selected)
z_level <- 9

# Resampling / smoothing
resample_method <- read_env_or_arg("RIDGE_RESAMPLE", "--resample=", "bilinear")
smoothing_method <- read_env_or_arg("RIDGE_SMOOTH", "--smooth=", "none")
gaussian_sigma <- as.numeric(read_env_or_arg("RIDGE_GAUSS_SIGMA", "--sigma=", 1.0))
gaussian_radius <- as.integer(read_env_or_arg("RIDGE_GAUSS_RADIUS", "--radius=", 2))
mean_radius <- as.integer(read_env_or_arg("RIDGE_MEAN_RADIUS", "--mean-radius=", 1))

if (resample_method == "nearest") resample_method <- "near"
if (!resample_method %in% c("bilinear", "near")) {
  stop("resample_method must be 'bilinear' or 'near'.")
}

# If TRUE, flip row order to south->north
flip_rows <- FALSE

# Clamp percentiles (stored in meta.json; can be edited later)
# Example: low = 0.01, high = 0.98
clamp_percentiles <- list(low = 0.02, high = 1.0)

# Output directory
script_dir <- tryCatch(dirname(normalizePath(sys.frames()[[1]]$ofile)), error = function(e) NULL)
cwd <- getwd()
project_root <- if (!is.null(script_dir) && file.exists(file.path(script_dir, "static"))) {
  normalizePath(script_dir)
} else {
  normalizePath(cwd)
}
output_dir <- read_env_or_arg("RIDGE_OUTPUT_DIR", "--out=", file.path(project_root, "static", "data"))

# -----------------------------
# Helpers
# -----------------------------

require_optional <- function(pkg) {
  if (!requireNamespace(pkg, quietly = TRUE)) {
    stop(sprintf("Package '%s' is required but not installed.", pkg), call. = FALSE)
  }
}

gaussian_kernel_1d <- function(radius, sigma) {
  if (radius < 1) return(matrix(1, nrow = 1, ncol = 1))
  x <- seq(-radius, radius)
  w <- exp(-(x^2) / (2 * sigma^2))
  w / sum(w)
}

gaussian_kernel_2d <- function(radius, sigma) {
  w1 <- gaussian_kernel_1d(radius, sigma)
  kernel <- outer(w1, w1)
  kernel / sum(kernel)
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

grid <- terra::resample(dem_m, template, method = resample_method)

# -----------------------------
# Optional smoothing (configurable)
# -----------------------------

if (smoothing_method != "none") {
  message("Applying smoothing: ", smoothing_method)

  if (smoothing_method == "mean2d") {
    size <- mean_radius * 2 + 1
    kernel <- matrix(1, size, size)
    kernel <- kernel / sum(kernel)
    grid <- terra::focal(grid, w = kernel, fun = "sum", na.policy = "omit")
  } else if (smoothing_method == "gaussian2d") {
    kernel <- gaussian_kernel_2d(gaussian_radius, gaussian_sigma)
    grid <- terra::focal(grid, w = kernel, fun = "sum", na.policy = "omit")
  } else if (smoothing_method == "gaussian1d_x") {
    w1 <- gaussian_kernel_1d(gaussian_radius, gaussian_sigma)
    kernel <- matrix(w1, nrow = 1)
    grid <- terra::focal(grid, w = kernel, fun = "sum", na.policy = "omit")
  } else if (smoothing_method == "gaussian1d_y") {
    w1 <- gaussian_kernel_1d(gaussian_radius, gaussian_sigma)
    kernel <- matrix(w1, ncol = 1)
    grid <- terra::focal(grid, w = kernel, fun = "sum", na.policy = "omit")
  } else {
    warning("Unknown smoothing_method: ", smoothing_method, " (skipping)")
  }
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
message("Output directory: ", normalizePath(output_dir))

# Values.bin: row-major order
flat <- as.vector(t(mat))
values_path <- file.path(output_dir, "values.bin")
meta_path <- file.path(output_dir, "meta.json")
manifest_path <- file.path(output_dir, "manifest.json")

if (file.exists(values_path)) file.remove(values_path)
if (file.exists(meta_path)) file.remove(meta_path)
if (file.exists(manifest_path)) file.remove(manifest_path)

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
  filters = list(
    resampleMethod = resample_method,
    smoothingMethod = smoothing_method,
    gaussian = list(radius = gaussian_radius, sigma = gaussian_sigma),
    meanRadius = mean_radius
  ),
  source = if (!is.null(attr(dem_ll, "source"))) attr(dem_ll, "source") else dem_source,
  createdAt = format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ", tz = "UTC")
)

jsonlite::write_json(meta, meta_path, auto_unbox = TRUE, pretty = TRUE)

manifest <- list(
  rows = rows,
  cols = cols,
  output_dir = normalizePath(output_dir),
  createdAt = format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ", tz = "UTC"),
  resample_method = resample_method,
  smoothing_method = smoothing_method,
  gaussian = list(radius = gaussian_radius, sigma = gaussian_sigma),
  mean_radius = mean_radius
)

jsonlite::write_json(manifest, manifest_path, auto_unbox = TRUE, pretty = TRUE)

message("Done.")
message("Wrote:")
message("- ", values_path)
message("- ", meta_path)
message("- ", manifest_path)
