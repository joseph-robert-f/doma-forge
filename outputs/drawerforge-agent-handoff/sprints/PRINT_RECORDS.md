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

## Parts bin

Two prints are necessary for this product. One bin proves the size. Two bins
prove the stack. Print the first bin, measure it, then print the second bin
with the same parameters.

### Record 8: Parts bin defaults, first bin

| Field | Value |
|---|---|
| Date | |
| Product and geometry version | Parts bin, geometry version 1 |
| Preset or parameters | Defaults (unmodified). binWidth 150, binDepth 100, binHeight 70, stacking true, lipHeight 4, lipWallThickness 1.2, stackClearance 0.3, frontScoop true, labelLedge true, wallThickness 3, baseThickness 3, cornerRadius 3, meshQuality standard |
| Design file name | drawerforge-parts-bin-150x100x70-stack-7e1edf.stl |
| Printer, nozzle, material | |
| Perimeters, layer height | |
| Target outside width x depth x height, mm | 150 × 100 × 70, and 74 over the lip |
| Target lip wall and stacking clearance, mm | 1.2 and 0.3 |
| Measured outside width x depth x height, mm | |
| Measured lip wall, mm | |
| Correction applied, X and Y, mm | |
| Fit result | |
| Photo | file name |
| Notes | Measure the height twice: at the rim, and over the lip. Measure the lip wall with a caliper at the middle of a long side. |

### Record 9: Parts bin defaults, stack test

| Field | Value |
|---|---|
| Date | |
| Product and geometry version | Parts bin, geometry version 1 |
| Preset or parameters | The same parameters as record 8 |
| Design file name | drawerforge-parts-bin-150x100x70-stack-7e1edf.stl |
| Printer, nozzle, material | |
| Perimeters, layer height | |
| Target stack pitch, mm | 70 |
| Measured stack pitch, mm | |
| Target stacking clearance per side, mm | 0.3 |
| Measured side play at the top of the stack, mm | |
| Fit result | too tight, fits, loose, with the gap in mm |
| Photo | file name |
| Notes | Put the second bin on the first bin. The two rims must meet. Measure the height of the pair, then subtract the height of one bin over the lip. Push the top bin sideways and record the play. Increase the stacking clearance if the bins bind. Decrease it if the play is more than 1 mm. |

## Remote caddy

### Record 5: Remote caddy defaults

| Field | Value |
|---|---|
| Date | |
| Product and geometry version | Remote caddy, geometry version 1 |
| Preset or parameters | Defaults (unmodified). caddyWidth 220, caddyDepth 130, caddyHeight 60, wellWidths [70, 70, 72], wellDepth 45, frontWallHeight 25, wallThickness 2, baseThickness 2.4, dividerThickness 2, cornerRadius 3, meshQuality standard |
| Design file name | drawerforge-remote-caddy-220x130x60-3w-9e09e7.stl |
| Printer, nozzle, material | |
| Perimeters, layer height | |
| Target outside width x depth x height, mm | 220 x 130 x 60 |
| Target well widths, mm | 70, 70, 72 (the third well is solved) |
| Target front wall height, mm | 25 |
| Measured outside width x depth x height, mm | |
| Measured well widths, mm | |
| Correction applied, X and Y, mm | |
| Fit result | |
| Photo | file name |
| Notes | Measure each well at the top of the divider and at the floor. The third well is solved from the inside width, so a shrink on the outside width lands on that well. |

## Drawer riser

### Record 6: Drawer riser defaults

| Field | Value |
|---|---|
| Date | |
| Product and geometry version | Drawer riser, geometry version 1 |
| Preset or parameters | Defaults (unmodified). drawerWidth 300, drawerDepth 200, drawerUsableHeight 120, clearancePerSide 0.5, clearHeight 45, trayHeight 35, legSection 12, rows 2, columns 2, wallThickness 2, baseThickness 2.4, dividerThickness 2, cornerRadius 4, meshQuality standard |
| Design file name | drawerforge-drawer-riser-299x199x82p4-2x2-e0becc.stl |
| Printer, nozzle, material | |
| Perimeters, layer height | |
| Target outside width x depth x height, mm | 299 x 199 x 82.4 |
| Target clear height under the deck, mm | 45 |
| Target leg section, mm | 12 |
| Target longest bridge, mm | 96.5 (the deck over one compartment, in the print pose) |
| Measured outside width x depth x height, mm | |
| Measured clear height under the deck, mm | |
| Measured leg section, mm | |
| Correction applied, X and Y, mm | |
| Fit result | |
| Load result | the mass the riser carried, and whether a leg bent |
| Bridge result | the deck over one compartment: clean, drooped, or failed. Give the droop in mm. |
| Photo | file name |
| Notes | Print the part upside down: the tray rim goes on the bed and the legs point up. Print it once without supports and look at the deck from below; the deck over each compartment is a 96.5 mm bridge. Measure the clear height at one leg and at the middle of a long side; a bowed deck shows there. Load the tray and look at the legs after one day. This record decides whether the product needs a maximum compartment span, a rib under the deck, or a two-part print. |
