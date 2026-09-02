# Print Records

One record per printed coupon or part. The sprint agent fills the target rows.
A person prints, measures, and fills the rest. Never fill a measured value
without a print.

## Template

| Field | Value |
|---|---|
| Date | |
| Product and geometry version | |
| Preset or parameters | |
| Design file name | |
| Printer, nozzle, material | |
| Perimeters, layer height | |
| Target outside width x depth x height, mm | |
| Measured outside width x depth x height, mm | |
| Correction applied, X and Y, mm | |
| Fit result | too tight, fits, loose, with the gap in mm |
| Photo | file name |
| Notes | |

## Calibration protocol

Run the following steps after the first three drawer tray coupons to apply
dimensional correction.

1. Print the coupon with the correction at 0 mm in X and 0 mm in Y.
2. Let the print cool. Measure the outside width and outside depth of the print
   with a caliper. Record the two measurements in the coupon record.
3. Open the **Printer** section in the app.
4. Enter the two measurements in the **Measured width, X** and **Measured depth, Y**
   fields.
5. Read the proposal. It shows the new correction for each axis.
6. Select **Apply correction**.
7. Record the new X and Y correction in the coupon record.
8. Print the coupon again. Let the print cool.
9. Measure the second print. Record the second measurements.
10. If the second print is within tolerance, the correction is ready to use for
    the full tray.

## Drawer tray fit-test coupon

### Record 1: Defaults

| Field | Value |
|---|---|
| Date | |
| Product and geometry version | Drawer tray, geometry version 1 |
| Preset or parameters | Preset: Defaults (unmodified). drawerWidth 300, drawerDepth 200, clearancePerSide 0.5, organizerHeight 50, wallThickness 2, baseThickness 2, dividerThickness 2, cornerRadius 8, rows 2, columns 3, meshQuality standard, fingerScoop true |
| Design file name | drawerforge-fit-test-299x199-<hash>.stl |
| Printer, nozzle, material | |
| Perimeters, layer height | |
| Target outside width x depth x height, mm | 299 × 199 × 5 |
| Measured outside width x depth x height, mm | |
| Correction applied, X and Y, mm | |
| Fit result | |
| Photo | file name |
| Notes | |

### Record 2: Hand tools preset

| Field | Value |
|---|---|
| Date | |
| Product and geometry version | Drawer tray, geometry version 1 |
| Preset or parameters | Preset: Hand tools. drawerWidth 360, drawerDepth 260, clearancePerSide 0.5, organizerHeight 55, wallThickness 2, baseThickness 2, dividerThickness 2.2, cornerRadius 10, rows 2, columns 4, meshQuality standard, fingerScoop true |
| Design file name | drawerforge-fit-test-359x259-<hash>.stl |
| Printer, nozzle, material | |
| Perimeters, layer height | |
| Target outside width x depth x height, mm | 359 × 259 × 5 |
| Measured outside width x depth x height, mm | |
| Correction applied, X and Y, mm | |
| Fit result | |
| Photo | file name |
| Notes | |

### Record 3: Desk supplies preset

| Field | Value |
|---|---|
| Date | |
| Product and geometry version | Drawer tray, geometry version 1 |
| Preset or parameters | Preset: Desk supplies. drawerWidth 320, drawerDepth 220, clearancePerSide 0.5, organizerHeight 45, wallThickness 2, baseThickness 2, dividerThickness 2, cornerRadius 8, rows 2, columns 3, meshQuality standard, fingerScoop true |
| Design file name | drawerforge-fit-test-319x219-<hash>.stl |
| Printer, nozzle, material | |
| Perimeters, layer height | |
| Target outside width x depth x height, mm | 319 × 219 × 5 |
| Measured outside width x depth x height, mm | |
| Correction applied, X and Y, mm | |
| Fit result | |
| Photo | file name |
| Notes | |

## Socket tray

### Record 4: Socket tray defaults

| Field | Value |
|---|---|
| Date | |
| Product and geometry version | Socket tray, geometry version 1 |
| Preset or parameters | Defaults (unmodified). trayWidth 200, trayDepth 110, trayHeight 25, rows 2, holesPerRow 8, boreDepth 18, chamfer true, boreDiameter1 13, boreDiameter2 17, boreDiameter3 22, boreDiameter4 27, wallThickness 2, baseThickness 2.4, cornerRadius 3, lightenUnderside true, meshQuality standard |
| Design file name | drawerforge-socket-tray-200x110x25-2x8-5561e9.stl |
| Printer, nozzle, material | |
| Perimeters, layer height | |
| Target outside width x depth x height, mm | 200 × 110 × 25 |
| Target bore diameter, row 1 and row 2, mm | 13 and 17 |
| Measured outside width x depth x height, mm | |
| Measured bore diameter, row 1 and row 2, mm | |
| Correction applied, X and Y, mm | |
| Fit result | |
| Photo | file name |
| Notes | Measure two bores per row with a caliper: one at the end of the row and one in the middle. The bores are not compensated by the printer profile; record the bore shrink as a number. |
