Run with CLI flags: 
```R
Rscript data-processing.r --rows=80 --cols=400 --resample=bilinear --smooth=gaussian2d --sigma=1.2 --radius=2

```

Or use env vars:
```R
RIDGE_ROWS=80 RIDGE_COLS=400 RIDGE_RESAMPLE=bilinear RIDGE_SMOOTH=gaussian2d RIDGE_GAUSS_SIGMA=1.2 RIDGE_GAUSS_RADIUS=2 Rscript data-processing.r


```

Available values

--resample=bilinear|near (nearest also supported, maps to near)
--smooth=none|mean2d|gaussian2d|gaussian1d_x|gaussian1d_y
--sigma and --radius for gaussian kernels
--mean-radius for mean kernel (1 → 3×3, 2 → 5×5)