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

## Marker and brush cup block

### Record 5: Marker cup block defaults

| Field | Value |
|---|---|
| Date | |
| Product and geometry version | Marker cup block, geometry version 1 |
| Preset or parameters | Defaults (unmodified). blockWidth 120, blockDepth 90, blockHeight 70, rows 2, cupsPerRow 4, boreDiameter 20, boreDepth 45, tiltDegrees 8, chamfer true, wallThickness 2, baseThickness 2.4, cornerRadius 6, lightenUnderside true, meshQuality standard |
| Design file name | drawerforge-marker-cup-block-120x90x70-2x4-2a20d9.stl |
| Printer, nozzle, material | |
| Perimeters, layer height | |
| Target outside width x depth x height, mm | 120 × 90 × 70 |
| Target bore diameter, mm | 20 |
| Measured outside width x depth x height, mm | |
| Measured bore diameter, mm | |
| Correction applied, X and Y, mm | |
| Fit result | |
| Photo | file name |
| Notes | Measure the bore at the mouth and near the floor with a caliper; the tilt makes the mouth an oval, wider along Y than the plain bore diameter. Record both readings. |

## Battery organizer

### Record 6: Battery organizer, AA preset

| Field | Value |
|---|---|
| Date | |
| Product and geometry version | Battery organizer, geometry version 1 |
| Preset or parameters | Preset: AA cells. organizerWidth 140, organizerDepth 90, organizerHeight 45, rows 3, cellsPerRow 4, cellDiameter 14.5, cellLength 50.5, cellShape round, exposedHeight 12, clearancePerSide 0.3, fingerRelief true, wallThickness 2, baseThickness 2.4, cornerRadius 4, lightenUnderside true, meshQuality standard |
| Design file name | drawerforge-battery-organizer-140x90x45-3x4-c7f78b.stl |
| Printer, nozzle, material | |
| Perimeters, layer height | |
| Target outside width x depth x height, mm | 140 × 90 × 45 |
| Target well diameter, mm | 15.1 (14.5 mm cell plus 0.3 mm clearance per side) |
| Measured outside width x depth x height, mm | |
| Measured well diameter, mm | |
| Correction applied, X and Y, mm | |
| Fit result | too tight, fits, loose, with the gap in mm |
| Photo | file name |
| Notes | Test an AA cell in three wells: a corner well, an edge well, and a center well. The wells are not compensated by the printer profile. |

## Tool fin rack

### Record 7: Tool fin rack defaults

| Field | Value |
|---|---|
| Date | |
| Product and geometry version | Tool fin rack, geometry version 1 |
| Preset or parameters | Defaults (unmodified). rackWidth 150, rackDepth 90, finCount 6, finThickness 3, finHeight 40, wallThickness 2, baseThickness 4, cornerRadius 4, meshQuality standard |
| Design file name | drawerforge-tool-fin-rack-150x90x44-6fins-a8ef13.stl |
| Printer, nozzle, material | |
| Perimeters, layer height | |
| Target outside width x depth x height, mm | 150 × 90 × 44 |
| Target fin gap, mm | 18.3 at the top; about 14.3 at the filleted foot |
| Measured outside width x depth x height, mm | |
| Measured fin gap, mm | |
| Correction applied, X and Y, mm | |
| Fit result | |
| Photo | file name |
| Notes | Slide a 3 mm blade into the gap between two fins near the middle of the row, both near the top and down at the filleted foot; the foot is narrower by twice the fillet width (4 mm). Check that a fin does not flex or crack at its filleted foot when a tool leans against it. |
## Parts bin

Two prints are necessary for this product. One bin proves the size. Two bins
prove the stack. Print the first bin, measure it, then print the second bin
with the same parameters.

### Record 8: Parts bin defaults, first bin

| Field | Value |
|---|---|
| Date | |
| Product and geometry version | Parts bin, geometry version 1 |
| Preset or parameters | Defaults (unmodified). binWidth 150, binDepth 100, binHeight 70, stacking true, lipHeight 4, lipWallThickness 1.2, stackClearance 0.3, frontScoop true, labelLedge true, wallThickness 3.4, baseThickness 3, cornerRadius 3, meshQuality standard. The outer wall was 3 mm until S13; 3.4 mm leaves 0.8 mm of wall on each side of the stacking recess, two widths of a 0.4 mm nozzle (28_CONTRACT_FOLLOW_UPS_NOTES.md, D-1713) |
| Design file name | drawerforge-parts-bin-150x100x70-stack-e65f30.stl |
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
| Design file name | drawerforge-parts-bin-150x100x70-stack-e65f30.stl |
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

### Record 10: Remote caddy defaults

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

### Record 11: Drawer riser defaults

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

## Plant pot saucer

### Record 12: Plant pot saucer defaults

| Field | Value |
|---|---|
| Date | |
| Product and geometry version | Plant pot saucer, geometry version 1 |
| Preset or parameters | Defaults (unmodified). innerDiameter 160, rimHeight 15, taperDegrees 6, rimRadius 1, overflowNotch false, liftRibs 2, ribHeight 3, wallThickness 2, baseThickness 2.4, meshQuality standard |
| Design file name | drawerforge-plant-saucer-160x15-896046.stl |
| Printer, nozzle, material | |
| Perimeters, layer height | |
| Target outside width x depth x height, mm | 166.5 × 166.5 × 15 |
| Target inner floor diameter, mm | 160 |
| Measured outside width x depth x height, mm | |
| Measured inner floor diameter, mm | |
| Correction applied, X and Y, mm | |
| Fit result | too tight, fits, loose, with the gap in mm |
| Photo | file name |
| Notes | Stand the matching pot on the ribs. Measure the inner floor diameter across two points 90 degrees apart. Fill the saucer with water and leave it for one hour to check the floor. The saucer's inner diameter takes the mean of the X and Y corrections from the printer profile (S13, D-1704), so measure the inner floor diameter across X and across Y and record both; the calibration protocol then reads each as that axis's measurement. Record the diameter shrink as a number as well. |

## Nursery plant pot

### Record 13: Nursery plant pot defaults

| Field | Value |
|---|---|
| Date | |
| Product and geometry version | Nursery plant pot, geometry version 1 |
| Preset or parameters | Defaults (unmodified). baseDiameter 120, potHeight 130, wallAngleDegrees 6, rimRadius 1, drainHoles 4, drainHoleDiameter 6, wallThickness 2.2, baseThickness 3, meshQuality standard |
| Design file name | drawerforge-plant-pot-120x130-4h-237a74.stl |
| Printer, nozzle, material | |
| Perimeters, layer height | |
| Target outside width x depth x height, mm | 147.1 × 147.1 × 130 |
| Target base diameter, mm | 120 |
| Target drainage hole diameter, mm | 6 |
| Measured outside width x depth x height, mm | |
| Measured base diameter, mm | |
| Measured drainage hole diameter, mm | |
| Correction applied, X and Y, mm | |
| Fit result | too tight, fits, loose, with the gap in mm |
| Photo | file name |
| Notes | Print the matching saucer at an inner floor diameter of 122 mm and stand the pot in it. Measure two of the four drainage holes. Check the first layer under each hole for a dropped bridge. The pot's base diameter takes the mean of the X and Y corrections from the printer profile (S13, D-1704), so measure the base diameter across X and across Y and record both; the calibration protocol then reads each as that axis's measurement. Record the diameter shrink as a number as well. |

## Card and cartridge slot holder

### Record 14: Card holder, memory cards preset

| Field | Value |
|---|---|
| Date | |
| Product and geometry version | Card and cartridge slot holder, geometry version 1 |
| Preset or parameters | Preset: Memory cards. holderWidth 100, holderDepth 32, holderHeight 20, cardGauge 2.1, slotClearance 0.4, cardWidth 24, slotCount 12, slotDepth 14, slotTilt 10, wallThickness 2, baseThickness 2.4, cornerRadius 3, meshQuality standard |
| Design file name | drawerforge-card-holder-100x32x20-12s-85683b.stl |
| Printer, nozzle, material | |
| Perimeters, layer height | |
| Target outside width x depth x height, mm | 100 × 32 × 20 |
| Target slot width, mm | 2.5 |
| Measured outside width x depth x height, mm | |
| Measured slot width, mm | |
| Correction applied, X and Y, mm | |
| Fit result | too tight, fits, loose, with the gap in mm |
| Photo | file name |
| Notes | Put one card in an end slot and one card in a middle slot. A card must go in with one finger and stay in when the holder is tipped. Record the slot clearance that fits. The slots are not compensated by the printer profile. |

## Wall hook rail

The hook rail coupon is a single hook: the app's fit-test download for this
product builds one hook on a 60 mm plate with two screws, at the rail's own
root, projection, lip, and plate thickness. Print and load the coupon before
the rail. Record 15 is the coupon. Print the whole rail only after the coupon
holds its load.

### Record 15: Wall hook rail coupon, single hook, defaults

| Field | Value |
|---|---|
| Date | |
| Product and geometry version | Wall hook rail, geometry version 1, fit-test coupon |
| Preset or parameters | Defaults (unmodified). railLength 240, railHeight 50, plateThickness 5, hookCount 4, hookWidth 12, hookRoot 8, hookProjection 20, hookLip 6, screwCount 2, screwSpacing 160, screwDiameter 4.5, keyShelf false, shelfDepth 40, cornerRadius 4, meshQuality standard. The coupon is one hook on a 60 mm plate with two screws. |
| Design file name | drawerforge-fit-test-60x25-<hash>.stl |
| Printer, nozzle, material | |
| Perimeters, layer height | |
| Target outside width x depth x height, mm | 60 x 25 x 50 |
| Target hook root, mm | 8 |
| Target hook projection, mm | 20 |
| Target approximate load per hook | 3.3 kg at 3 perimeters in PLA (the app's estimate) |
| Measured outside width x depth x height, mm | |
| Measured hook root, mm | |
| Measured hook projection, mm | |
| Correction applied, X and Y, mm | |
| Fit result | |
| Load result | the mass the hook held for one day, and the mass at which it broke, if you loaded it to failure |
| Photo | file name |
| Notes | Print the coupon with the plate flat on the bed and the hook pointing up, no supports, three perimeters. Screw it to a board. Hang a known mass on the hook, starting at 1 kg, and add 0.5 kg at a time. Record the mass at which the hook bends visibly and the mass at which it breaks. Note whether it broke at the root across the layers. This record calibrates the 5 MPa constant in the load model; see 24_BRACKET_FAMILY_NOTES.md. |

## Headphone and controller mount

### Record 16: Headphone mount defaults

| Field | Value |
|---|---|
| Date | |
| Product and geometry version | Headphone mount, geometry version 1 |
| Preset or parameters | Defaults (unmodified). plateWidth 90, plateHeight 150, plateThickness 5, hookWidth 40, hookRoot 12, hookProjection 30, hookLip 12, bandGauge 10, controllerPocket true, pocketWidth 70, pocketDepth 40, pocketLip 12, pocketFloor 5, screwDiameter 4.5, cornerRadius 4, meshQuality standard |
| Design file name | drawerforge-headphone-mount-90x45x150-6e1376.stl |
| Printer, nozzle, material | |
| Perimeters, layer height | |
| Target outside width x depth x height, mm | 90 x 45 x 150 |
| Target hook opening, mm | 15 (the plate face to the lip, at the arm top) |
| Target pocket inside width x depth, mm | 64 x 40 (between the side walls) |
| Target screw spacing, mm | 125 |
| Measured outside width x depth x height, mm | |
| Measured hook opening, mm | |
| Measured pocket inside width x depth, mm | |
| Measured screw spacing, mm | |
| Correction applied, X and Y, mm | |
| Fit result | whether a 10 mm headband slips over the lip and rests on the arm |
| Load result | the headset mass, and whether the hook deflected after one week |
| Photo | file name |
| Notes | Print with the plate flat on the bed and the hook and the pocket pointing up, no supports, three perimeters. The two lip ramps are the only faces that point down; look at them for sag. Measure the screw spacing on the print and compare it to 125 mm before you drill. |

## Shelf riser

### Record 17: Shelf riser defaults

| Field | Value |
|---|---|
| Date | |
| Product and geometry version | Shelf riser, geometry version 1 |
| Preset or parameters | Defaults (unmodified). deckWidth 300, deckDepth 200, deckThickness 4, clearHeight 120, legSection 14, lightenDeck true, cornerRadius 6, meshQuality standard |
| Design file name | drawerforge-shelf-riser-300x200x124-bdd8f7.stl |
| Printer, nozzle, material | |
| Perimeters, layer height | |
| Target outside width x depth x height, mm | 300 x 200 x 124 |
| Target clear height under the deck, mm | 120 |
| Target leg section, mm | 14 |
| Target pockets | 5 x 3, 2 mm deep, with two ribs |
| Measured outside width x depth x height, mm | |
| Measured clear height under the deck, mm | |
| Measured leg section, mm | |
| Correction applied, X and Y, mm | |
| Fit result | |
| Load result | the mass the deck carried, spread over it, and the sag at the deck center in mm after one day |
| Photo | file name |
| Notes | The file is already in its print pose: deck top on the bed, legs up. Do not turn it in the slicer. No supports. Four perimeters, at least 25 percent infill. After printing, turn it over and stand it on a flat surface; note whether all four feet touch. Load the deck and measure the sag at the center. A second print of the Boot riser preset (clearHeight 300, legSection 28) tests the press-fit pegs: record whether each peg pressed in by hand, needed sanding, or was loose. |

## Entryway valet

### Record 18: Entryway valet defaults

| Field | Value |
|---|---|
| Date | |
| Product and geometry version | Entryway valet, geometry version 1 |
| Preset or parameters | Defaults (unmodified). valetWidth 240, valetDepth 150, valetHeight 40, wellWidths [80, 60, 92], wellDepth 70, slotWidth 12, restHeight 70, restAngle 15, wallThickness 2, baseThickness 2.4, dividerThickness 2, cornerRadius 6, meshQuality standard |
| Design file name | drawerforge-entryway-valet-240x150x70-3wells-66f5a6.stl |
| Printer, nozzle, material | |
| Perimeters, layer height | |
| Target outside width x depth x height, mm | 240 x 150 x 70 |
| Target well widths, mm | 80, 60, 92 |
| Target slot width, mm | 12 |
| Target rest angle, degrees | 15 |
| Measured outside width x depth x height, mm | |
| Measured well widths, mm | |
| Measured slot width, mm | |
| Measured rest angle, degrees | |
| Correction applied, X and Y, mm | |
| Fit result | whether a phone stands in the slot and leans on the rest without tipping |
| Photo | file name |
| Notes | Print upright, base on the bed, no supports, three perimeters. The wedge is solid in the file; the slicer's infill fills it. Measure the rest angle with a protractor against the face. Stand the phone in the slot and note whether the 12 mm slot is loose or tight for its case. |
