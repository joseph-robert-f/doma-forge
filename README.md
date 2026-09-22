# DrawerForge

DrawerForge is a browser-based parametric generator for 3D-printable organizers, bins, caddies, risers, wall mounts, and plant pots and saucers. Choose a product, enter your measurements, tune its layout and construction, inspect the result in 3D, and download the generated mesh as a binary STL. Design editing and geometry generation run locally in your browser. No account or CAD installation is required.

## Local setup

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

The development server prints the local URL, normally `http://localhost:3000`.

## Commands

```bash
npm run dev              # live Vite/vinext development server
npm run lint             # ESLint
npm run typecheck        # strict TypeScript check
npm test                 # unit, geometry, STL, and app integration tests
npm run test:unit        # all unit, geometry, and STL tests; excludes app integration
npm run test:integration # all tests/*.integration.test.tsx suites
npm run build            # production/Cloudflare Worker build
npm run test:ssr         # production build plus server-render smoke test
npm run test:deploy-config  # proves a preview build targets the separate preview Worker
npm run check:public-origin # warns if the built page still ships the localhost default
npm run deploy           # build, then deploy to Cloudflare Workers (production)
npm run deploy:preview   # build under CLOUDFLARE_ENV=preview, then deploy to the "preview" Worker environment
```

## Parameters and validation

All dimensions are millimeters. Each product defines its own measurements, layout, and construction rules. For the drawer organizer tray, width and depth are calculated as the drawer interior dimension minus the selected clearance on both sides. Internal compartment dimensions account for the two perimeter walls and every divider. Its rows and columns are evenly spaced; other products offer individual well widths, bores, slots, hooks, or revolved profiles.

DrawerForge rejects non-finite or out-of-range values and applies each product's construction rules. For the drawer organizer tray, those rules reject a base that leaves too little wall, a corner radius larger than the tray, and layouts with compartments under 10 mm. Invalid edits never replace the last valid preview and always disable STL download. The latest valid normalized design for each product is stored locally in the browser and can be reset to practical defaults.

Draft, Standard, and Fine change curved-feature tessellation only. Standard is the recommended balance for editing and export.

## Design files

A design file holds one product's settings in millimeters. Use it to move a design between devices or to keep more than one design.

1. Enter a design name. The name is optional. It becomes the first part of each file name.
2. Select **Save design file**. The browser downloads `<name>-<product-id>-<hash>.drawerforge.json`.
3. On any device, select **Open design file** and choose the file. The design replaces the current settings only after every check passes.

A file with an unknown format, an unsupported version, a missing parameter, or an out-of-range value is refused with a message. The current design does not change. A file saved by a different app version loads with a warning that the mesh may differ.

The design file never holds printer data. Printer corrections belong to a local printer profile.

## Fit test

Products with a fit-test coupon offer **Download fit test**. For the drawer organizer tray, it produces a small, fast print that tests whether the tray fits the drawer before the full tray prints. This coupon is a 5 mm high ring with the tray's outside profile. It has no base, no dividers, and no scoop. The wall hook rail has a single-hook coupon, described in its print notes below.

Print this ring first. It uses little material and shows whether the tray fits the drawer. The ring wall is never thinner than 2 mm, even if the tray wall is set thinner. A thin wall is weak.

The **Download fit test** button follows the same rules as **Download STL**. It stays disabled until the current settings pass validation and the preview finishes. The coupon builds in the same background worker as the preview, so the page never loads the geometry kernel. While it builds, the button reads **Building fit test…** and stays disabled. An edit during the build cancels it; wait for the preview, then select the button again. The file name is `drawerforge-fit-test-<product id>-<width>x<depth>-<hash>.stl`, so two coupons in one downloads folder are told apart the way two model files are. The design name, when set, becomes the first part of the file name, the same way it does for the STL download.

### Print notes

Print the coupon flat on the bed. Do not use supports. Use enough perimeters to print the ring wall solid. Three perimeters is a minimum. Use a stiff filament. PLA and PETG are satisfactory.

## Bit, socket, and driver tray

The bit, socket, and driver tray is a flat tray with a bore for every socket, bit, or driver. Open it from the product switcher or at `/products/socket-tray`.

Set the outside size, the number of rows, the bores per row, and the bore depth. Each row has its own bore diameter. Row 1 is at the front. Measure the widest item in a row with a caliper and add your own clearance; the app does not add one. The rows and the bores are spaced evenly, with the same web between neighbours as between a bore and the rim.

The app rejects a layout that leaves less than 2.5 mm between two bores or between two rows, and it names the row and the fix. The bore depth cannot exceed the tray height minus the base, so the base under the bores is at least the base you set. A large corner radius that would cut into an end bore is rejected with the largest radius that fits. A chamfered bore mouth adds a 0.8 mm lead-in. Underside pockets remove material below the base; each pocket ceiling bridges at most 40 mm, so the tray prints flat without supports. The pockets leave the rim and the ribs on the bed. Use a brim if the first layer lifts.

The presets are typical outside diameters for quarter-inch and half-inch drive sockets and for quarter-inch hex bits. They are starting points, not a brand's sizes.

### Print notes for the socket tray

Print the tray flat on the bed, bores up. Do not use supports. Use three perimeters. Use a stiff filament. PLA and PETG are satisfactory. No printed record exists for this product yet; see `outputs/drawerforge-agent-handoff/sprints/PRINT_RECORDS.md`.

## Stackable parts bin

The stackable parts bin is an open bin that stacks on an identical bin. Open it from the product switcher or at `/products/parts-bin`.

Set the width, the depth, and the height of the bin body. These are outside sizes. The bin has no fit clearance, so the size you set is the size the app builds. Measure your shelf, then divide the shelf width by a whole number of bins.

The stacking lip stands on the top rim. The recess in the underside of the next bin receives that lip. The app builds the recess from the lip and the stacking clearance. Two bins with equal parameters stack. Increase the clearance if the bins bind. Decrease the clearance if the stack is loose. Print one bin first. Print a second bin. Keep the clearance that fits your printer.

Two rules protect the stack. The outer wall is at least 1.6 mm when the bin stacks. A bin carries the bins above it. The lip wall and the two clearances take at most the outer wall minus 0.8 mm. The recess must leave material on each side. The app names the field and the fixes when a value breaks a rule. The calculated results show the material that stays on each side of the recess.

The lip stands above the bin height. The **Outside** result therefore shows a taller box than the bin body. The app checks the mesh against that box. The **Stack pitch** result is the height that one more bin adds to a stack.

The front scoop is a round notch in the front rim. It also cuts a gap in the lip at the front. The gap keeps the notch open to the top. The label ledge is a slot at the front foot. Push a card into the slot. The ledge stands 2.8 mm in front of the bin. It adds to the depth of the bin on the shelf. Both features are optional.

Turn the stacking lip off for a plain bin. The plain bin keeps the shell, the scoop, and the ledge. It drops the lip and the recess.

### Print notes for the parts bin

Print the bin in the pose the app shows: the open side up, the underside on the bed. Do not use supports. The recess is a groove in the underside, so it prints against the bed. Use three perimeters. Use four perimeters for a bin that carries heavy parts. Use a stiff filament. PLA and PETG are satisfactory. No printed record exists for this product yet; see `outputs/drawerforge-agent-handoff/sprints/PRINT_RECORDS.md`.
## Remote and controller caddy

The remote and controller caddy has a well for every remote and every controller. Open it from the product switcher or at `/products/remote-caddy`.

Set the outside size, then give each well its own width. Use **Add well** and **Remove well** to change the number of wells, from two to five. The last well is solved: it takes the width that is left inside the caddy after the other wells and the dividers, so the wells always fill the caddy exactly. The list you type is the design; the calculated result card shows the widths the caddy is built from.

Every well must be at least 25 mm wide. If the solved well is too narrow, the app names the well to shrink and the number of millimeters to take off it. The well depth is measured down from the top, and the material under a well is the caddy height minus the well depth. The front wall is lower than the sides and the back, so you can lift a remote out with one hand. The front wall must stand at least 3 mm above the well floor.

### Print notes for the caddy

Print the caddy flat on the bed, wells up. Do not use supports. Use three perimeters. Use a stiff filament. PLA and PETG are satisfactory. No printed record exists for this product yet; see `outputs/drawerforge-agent-handoff/sprints/PRINT_RECORDS.md`.

## Two-tier drawer riser

The two-tier drawer riser is a drawer tray on four legs. It makes a second level in a drawer that is deeper than the items in it. Open it from the product switcher or at `/products/drawer-riser`.

Measure four values in the drawer: the interior width, the interior depth, the usable height, and the height of the tallest item that stays on the drawer floor. Set the clear height to that item height plus your own clearance. The riser height is the clear height plus the deck plus the tray height. That total must be at most the drawer usable height minus 5 mm; the app names the number of millimeters to remove when it is not.

The legs carry the load of the upper tray. Two rules protect them. The leg section is at least 8 mm. The clear height is at most 12 times the leg section; the app names the smallest section and the tallest leg that pass. Each leg flares into the deck with a gusset, so the joint is never a sharp corner.

The tray above the deck holds an even grid of rows and columns, the same grid the drawer organizer tray uses. Each compartment is at least 10 mm.

### Print notes for the riser

Print the riser upside down: the tray rim goes on the bed and the legs point up. Select **Print pose** in the viewer to see this pose. In that pose every gusset carries the layer above it, so no gusset needs support.

The deck is a bridge in this pose. Each compartment is an upside-down box, and its ceiling is the deck. The **Longest bridge** line in the calculated result card gives the span: the shorter side of one compartment, 96.5 mm with the defaults. That span is longer than the 40 mm this app allows for an underside pocket, so read it before you slice. Three ways to shorten it: use more rows or more columns, use a smaller drawer, or slice the part with supports under the deck. Nobody has printed this part yet, so the app sets no rule here. Record what you find.

Use four perimeters and at least 25 percent infill in the legs. Use a stiff filament. PLA and PETG are satisfactory. Do not stand on the riser and do not load it with more than a few kilograms. No printed record exists for this product yet; see `outputs/drawerforge-agent-handoff/sprints/PRINT_RECORDS.md`.
## Plant pot saucer

The plant pot saucer is a round saucer that matches the base of a plant pot. Open it from the product switcher or at `/products/plant-saucer`.

Measure the base of the pot with a caliper. Set the inner floor diameter to that measurement plus 2 mm. The printer profile's correction reaches the inner floor diameter as the mean of the X and Y corrections; see [Printer profile and calibration](#printer-profile-and-calibration). Set the rim height and the wall taper. The wall opens upward, between 3 and 12 degrees from vertical, so the saucer lifts off the bed cleanly and stacks with another saucer. The inner floor diameter stops at 208 mm, the 220 mm reference bed less 12 mm. The app rejects a saucer whose outside diameter passes the bed less 12 mm, and names the taper. Once you save a printer profile, that rule reads your bed: the smaller of its width and depth, less 12 mm, and the message names your bed. The field limit itself stays at 208 mm.

The rolled rim is a bead that rolls inward from the top of the wall. It never overhangs the outside, so the saucer prints without supports. The app reduces the bead radius when the setting does not fit: the bead is never more than a quarter of the rim height, never wider than the wall it rolls over, and never near the axis. The calculated result names the radius the app used and the radius you asked for.

Lift ribs hold the pot above the water. Each rib crosses the whole floor through the center and is 3 mm wide. Set the count to 0 for a flat floor. The overflow notch is a 12 mm notch in one side of the rim. Extra water leaves through the notch instead of over the whole rim.

### Print notes for the saucer

Print the saucer upright, floor on the bed. Do not use supports. Use three perimeters and four solid bottom layers, so the floor holds water. Use PLA or PETG.

## Nursery plant pot

The nursery plant pot is a round plant pot with drainage. Open it from the product switcher or at `/products/plant-pot`.

Set the outside diameter at the base, the height, and the wall angle. The printer profile's correction reaches the base diameter as the mean of the X and Y corrections, and the flare above it follows. The base diameter is the measurement the saucer must match, so the calculated result shows **Matching saucer floor**: the base diameter plus 2 mm. Enter that number as the saucer's inner floor diameter. The saucer floor is then 2 mm wider than the pot base all round, which is a 1 mm gap on each side.

The wall angle runs from 0 to 45 degrees from vertical. The app rejects a pot that is wider across the rim than the bed less 12 mm, 208 mm on the 220 mm reference bed, and names the wall angle. Once you save a printer profile, the rule reads your bed, the smaller of its width and depth, and the message names it. The drainage holes are 4 to 8 mm, and they go through the flat base only. They never cut the wall: a single hole sits at the center, and two or more sit on a circle of half the floor radius. The app rejects holes that leave less than 2.5 mm between two neighbours, or less than 2.5 mm between a hole and the wall.

### Print notes for the pot

Print the pot upright, base on the bed. Do not use supports. Each drainage hole bridges nothing, because it goes straight through a flat base. Use three perimeters and four solid bottom layers. Use PLA or PETG. This pot is for a plant. It is not for anything else.

## Card and cartridge slot holder

The card and cartridge slot holder is a slab with a slot for every card. Open it from the product switcher or at `/products/card-holder`.

Measure one card with a caliper. The card thickness plus the slot clearance is the gap the card sits in. The card width is the edge that goes into the slot. Set the slot count, the slot depth, and the tilt.

The tilt leans every card to one side, from 0 to 20 degrees. A tilted slot needs more width than an upright one. Its mouth is wider, and its floor moves sideways by the slot depth times the tangent of the tilt. The app solves the pitch on that whole footprint, keeps at least 2.5 mm between two slots and between a slot and the rim, and rejects a corner radius that would cut into an end slot. The calculated result shows the pitch, the web, and the floor offset.

The presets are typical sizes for memory cards, game cartridges, and cassettes. They are starting points, not a brand's sizes.

### Print notes for the card holder

Print the holder flat on the bed, slots up. Do not use supports. Use three perimeters. A slot is a thin gap, so print a test holder with two slots before a long one.
## Marker and brush cup block

The marker and brush cup block has a cup for every marker or brush. Open it from the product switcher or at `/products/marker-cup-block`.

Set the outside size, the rows, the cups per row, and one bore diameter for every cup. Every cup shares this diameter. Set a tilt from 0 to 15 degrees. A tilt leans every cup back, away from the user, about the block's X axis. Row 1 is at the front.

The app checks the whole tilted bore against the outer wall, not only its top opening. It computes where the bore axis exits at the bore floor, and it checks both the mouth and the floor against the straight sides and the rounded corners. A large corner radius, or a large tilt, that would cut a cup open is rejected with the largest corner radius that fits. Underside pockets work the same way as the socket tray's.

The presets are typical bore diameters for fine markers, wide markers, and round brushes. Measure your own markers and brushes and adjust.

### Print notes for the marker cup block

Print the block flat on the bed, cups up. Do not use supports. A tilt past 15 degrees is not offered, so no cup overhangs past the printer's normal 45 degree limit. No printed record exists for this product yet; see `outputs/drawerforge-agent-handoff/sprints/PRINT_RECORDS.md`.

## Battery organizer

The battery organizer has a well for every cell. Open it from the product switcher or at `/products/battery-organizer`.

Set the outside size, the rows, the cells per row, the cell diameter, and the cell length. Pick a cell shape: round for a cell that stands upright in a bore, or coin cell for a cell that stands on edge in a slot. A coin cell's diameter runs vertical and its length is its thickness. Set how much of the cell's standing length stays exposed above the well; the app derives the well depth from the rest. Set a clearance per side, and turn the finger relief on or off: a wider, 3 mm deep counterbore at the top of every well, so a fingertip can reach the cell.

The well depth never exceeds the organizer height minus the base. The app rejects a layout that leaves less than 2.5 mm between two wells or between two rows, and it names the row and the fix. A large corner radius that would cut into an end well, once the finger relief is included, is rejected with the largest radius that fits.

The presets cover AA, AAA, C, D, 18650, and 2032 coin cells. Each preset states the clearance it uses. Measure your own cells and adjust.

### Print notes for the battery organizer

Print the organizer flat on the bed, wells up. Do not use supports. No printed record exists for this product yet; see `outputs/drawerforge-agent-handoff/sprints/PRINT_RECORDS.md`.

## Tool fin rack

The tool fin rack is a base slab with a row of fins standing up, for pliers, files, and wrenches to stand between. Open it from the product switcher or at `/products/tool-fin-rack`.

Set the outside size, the fin count, the fin thickness, and the fin height. Every fin shares the same thickness and height. The app solves the fin pitch from the rack width, the fin count, and the fin thickness, keeping at least a 12 mm gap between two fins so a tool blade fits. Fin height cannot exceed 15 times the fin thickness, so a tall, thin fin does not snap. Every fin gets a filleted foot, wider than the fin itself, so it does not meet the base at a sharp corner; the gap between two fins is narrower there than at the top, by twice the fillet's own width (4 mm). The derived values show both gaps. The base slab is at least 3 mm thick.

The app rejects a fin count and thickness that leave less than a 12 mm gap, naming the fix. A large corner radius that would leave an end fin hanging past the rounded corner, unsupported, is rejected with the largest radius that fits.

The presets cover pliers and cutters, files and screwdrivers, and wrenches. Measure your own tools and adjust the fin thickness to the widest blade that must sit between two fins.

### Print notes for the tool fin rack

Print the rack flat on the bed, fins up. Do not use supports. No printed record exists for this product yet; see `outputs/drawerforge-agent-handoff/sprints/PRINT_RECORDS.md`.

## Wall hook rail

The wall hook rail screws to a wall, with hooks along its bottom edge and an optional shelf along its top. Open it from the product switcher or at `/products/wall-hook-rail`.

Set the rail length, the hook count, and the screw spacing that matches the wall. The app centers the screws on the rail and keeps 8 mm of plate between every countersink and any edge, any hook, and any gusset. It names the largest spacing that fits when yours does not.

Two load rules protect every hook, and they are validation errors, not warnings. The hook root, the thickness where the hook meets the plate, is at least 8 mm. The projection is at most 2.5 times the root and never over 60 mm. The app names the longest projection the root carries and the smallest root the projection needs. The root is filleted above and below, and the hook lip has a 45 degree ramp on its inside, so nothing under the lip needs support in the print pose. The calculated result shows an approximate load per hook. It is a bending estimate at 5 MPa, for three perimeters in PLA, and it is not a rating.

The key shelf sits on a hull gusset at each end, and a rib gusset every 150 mm along a long rail.

### Print notes for the rail

Print the rail with the plate flat on the bed and the hooks pointing up. Select **Print pose** in the viewer to see this pose. Every hook arm stands vertical, and the only face that points down is the 45 degree ramp under each lip. Do not use supports.

Print the fit-test coupon first: it is one hook on a short plate with two screws, at the same root, projection, and lip as the rail. Hang the load you expect on it before you print the whole rail. Use three perimeters and at least 20 percent infill. Use PLA or PETG. The load the app shows assumes three perimeters in PLA; more perimeters carry more, fewer carry less. No printed record exists for this product yet; see `outputs/drawerforge-agent-handoff/sprints/PRINT_RECORDS.md`.

## Headphone and controller mount

The headphone and controller mount is a wall plate with one wide hook for a headset and an optional pocket above it for a controller. Open it from the product switcher or at `/products/headphone-mount`.

Measure the headband where it rests on the hook, and enter that as the headband thickness. The opening between the plate and the hook lip must be at least that plus 2 mm, and the app names the projection that clears it. The hook is at least 20 mm wide, and the same root rule as the hook rail applies: projection at most 2.5 times the root, never over 60 mm.

The pocket is a wide J-profile with a floor, a lip, and a side wall at each end, so the side walls carry the floor and no root rule applies to it. It sits above the hook with room for the band to slip over the lip. Two screws sit on the center line, one near the bottom and one near the top; the calculated result shows their spacing.

### Print notes for the mount

Print the mount with the plate flat on the bed and the hook and the pocket pointing up. Select **Print pose** to see this pose. The hook arm, the pocket floor, and the pocket walls stand vertical, and the only faces that point down are the 45 degree ramps under the two lips. Do not use supports. Use three perimeters and at least 20 percent infill. No printed record exists for this product yet; see `outputs/drawerforge-agent-handoff/sprints/PRINT_RECORDS.md`.

## Shelf riser

The shelf riser is a deck on four legs, for a second level on a shelf or a closet floor. Open it from the product switcher or at `/products/shelf-riser`.

Set the deck size and the clear height under it. The leg rule from the drawer riser applies: the clear height is at most 12 times the leg section, the section is at least 8 mm, and every leg flares into the deck with a gusset. A rib stands under the deck wherever the span between two legs passes 150 mm. The deck underside is lightened with pockets inside the leg pads, each pocket ceiling at most 40 mm, and you can turn the pockets off.

The **one-piece height** is the tallest part your printer builds in one go: normally your bed height, 240 mm by default. Once you save a printer profile, a riser that is taller than your bed is refused on that field until the one-piece height is at most the bed height, so the legs split where your printer needs them. A riser that fits the bed prints whatever the setting says. A riser taller than the one-piece height does not print in one piece. The app then splits each leg: the deck keeps as much leg as one piece allows, but never so much that an extension would be shorter than the peg it carries, and four extensions with square pegs stand beside the deck in the same file. The joint needs a leg section of at least 12 mm; the peg is the section minus 6 mm, with 0.1 mm of clearance per side. The calculated result names the pieces.

### Print notes for the riser

The preview shows the riser as it prints: the deck top on the bed, the pockets open upward, the ribs and the legs standing up. There is no print pose toggle, because the modeled pose is the print pose. Turn the printed riser over to use it. Do not use supports; every gusset flares toward the bed. When the legs split, the four extensions print beside the deck, feet down. Press each peg into its socket; sand the peg if it is tight, and glue it if it is loose. Use four perimeters and at least 25 percent infill in the legs. Do not stand on the riser. No printed record exists for this product yet; see `outputs/drawerforge-agent-handoff/sprints/PRINT_RECORDS.md`.

## Entryway valet

The entryway valet is a tray with wells for keys and a watch along the front, and an angled phone rest along the back. Open it from the product switcher or at `/products/entryway-valet`.

Give every well its own width; the last well takes the width that is left, exactly as in the remote caddy. Set how deep the well row is from front to back. The rest is a solid wedge whose face leans back by the rest angle, 8 to 25 degrees from vertical. A lip in front of the wedge forms the slot for the phone's bottom edge, and the slot width is yours to set. The wedge thins toward its top, so the app keeps at least 4 mm of material there and names the deepest well row that allows it.

### Print notes for the valet

Print the valet upright, base on the bed. Do not use supports: the rest face leans back, so it points up and forward. Use three perimeters. The wedge is solid in the file; let the slicer fill it with its own infill. No printed record exists for this product yet; see `outputs/drawerforge-agent-handoff/sprints/PRINT_RECORDS.md`.

## Printer profile and calibration

A printer profile holds what one machine needs: the bed size, the nozzle diameter, and the X and Y correction. The profile stays in this browser. It is not part of a design file, and it is not sent anywhere.

Select **Printer** to open the section. The defaults are a bed of 220 × 220 × 250 mm and a nozzle of 0.4 mm. Both corrections start at 0 mm.

### What a correction does

A correction is the millimeters that this printer prints small in one axis. The app adds the correction to the modeled part before it builds the mesh. It adds the X correction to the outside width and the Y correction to the outside depth. It changes no other value.

A round part has no width or depth of its own. The plant pot's base diameter and the saucer's inner floor diameter take the mean of the two corrections, once. A machine that prints small by different amounts in X and Y prints a circle as a slight oval, and one number cannot correct that; the mean keeps the average size right. Measure a round print across X and across Y and enter both, the same way as for a tray.

The app shows one line for each corrected axis:

```
X · Modeled 299.5 mm = target 299 mm + 0.5 mm correction
```

The correction changes the mesh, the preview, the STL, and the fit-test coupon. It does not change your target, the calculated results, the design file, or the design that this browser saves. The same design therefore is intended to print to the same size on a different machine after that machine's own correction.

A file name keeps the design hash and gets a marker for the correction, for example `drawerforge-drawer-tray-299x199x50-2x3-08d29d-cx0p5.stl`. Two prints of one design under different corrections get different file names.

### How to calibrate

1. Set the correction to 0 mm in X and in Y for a first calibration.
2. Select **Download fit test** and print the coupon.
3. Measure the outside width and the outside depth of the print. Use a caliper.
4. Open the **Printer** section. Read the target width and depth: the size a correctly calibrated print should measure.
5. Enter the two measurements.
6. Read the proposal. It shows `existing + target − measured` for each axis.
7. Select **Apply correction**. The proposal replaces the correction. It does not add to it.
8. Print the coupon again and measure it again to confirm the result.

Apply clears the two measurements. A second Apply of the same measurement is therefore not possible, and the correction cannot double.

### Warnings and errors

The app shows a **warning** when the part is larger than the bed in X, Y, or Z. A part equal to the bed gives no warning. A warning never stops a download: you can split the part or use another machine.

A saved profile also reaches two product rules. The plant pot and the saucer refuse a part wider than your bed less 12 mm, instead of the 220 mm reference bed, and the shelf riser refuses a one-piece height above your bed height. Both messages name your bed. No other rule reads the bed; a part larger than the bed stays a warning.

The bed warning starts only after you save a printer profile. Open the **Printer** section and enter your bed size once. Until then the bed values are placeholders, and the app shows the line "Enter your bed size to get build-volume warnings." instead of a warning about a bed you did not enter.

The app shows an **error** when a wall is thinner than two nozzle widths. A wall that thin is weak, so DrawerForge does not print it. The error names the nozzle and the wall, and it keeps **Download STL** and **Download fit test** disabled until you set a larger wall or a smaller nozzle.

The rule reads the walls and thicknesses you set, and the thin features the product itself reports: the webs between bores or slots, the webs between underside pockets, the skin left over a pocket, leg sections, ribs, press-fit socket walls, and lips. A socket tray whose solved web falls under two nozzle widths therefore shows the same error as a thin outer wall, and the error names the web.

The app also shows an error when a correction takes a value past its limit. The example is a drawer width of 600 mm with a 0.5 mm correction. The field still shows 600 mm, which is legal, so the message names the correction: "The X correction takes the drawer width past its limit." Lower the correction, or lower the value.

## Code layout

- `lib/kernel/` — shared geometry code in two layers. The pure planners, which a product's schema and validation import: the pitch solver (`pitch.ts`), the lightening plan (`lightening-plan.ts`), the leg plan and its rules (`leg-plan.ts`), the bracket rules, the J-hook outline, the screw row, the ribs, the leg split, and the load model (`bracket-rules.ts`), the vessel profile (`vessel-profile.ts`), and the Boolean overlap constant (`overlap.ts`). The solid builders, which only a product's geometry module imports: the Manifold loader, profile builders (`profiles.ts`), the shell pattern (`shell.ts`), cutter arrays and dividers at explicit positions (`arrays.ts`), leg posts with hull gussets (`legs.ts`), underside lightening (`lightening.ts`), revolved shells (`revolve.ts`), the J-hook, screw cutters, and hull gussets (`brackets.ts`), and the mesh copy. A test in `tests/products.test.ts` fails when a definition-side module imports a builder.
- `lib/products/types.ts` — the `ProductDefinition` contract every product satisfies.
- `lib/products/shared.ts` — normalization, range validation, signature, slug, and hash helpers.
- `lib/products/drawer-tray/` — the drawer organizer: schema, validation, geometry, presets.
- `lib/products/socket-tray/` — the bit, socket, and driver tray: schema, the layout solver, validation, geometry, presets.
- `lib/products/parts-bin/` — the stackable parts bin: schema, the stacking layout, validation, geometry, presets.
- `lib/products/remote-caddy/` — the remote and controller caddy: schema with the well-width layout, validation, geometry, presets.
- `lib/products/drawer-riser/` — the two-tier drawer riser: schema with the leg plan, validation, geometry, presets.
- `lib/products/plant-saucer/` — the plant pot saucer: the revolved profile, the lift ribs, validation, geometry, presets.
- `lib/products/plant-pot/` — the nursery plant pot: the revolved profile, the drainage layout, validation, geometry, presets.
- `lib/products/card-holder/` — the card and cartridge slot holder: the tilted slot layout, validation, geometry, presets.
- `lib/products/marker-cup-block/` — the marker and brush cup block: schema, the tilted-bore containment check, validation, geometry, presets.
- `lib/products/battery-organizer/` — the battery organizer: schema, the round-bore and coin-cell-slot layout, validation, geometry, presets.
- `lib/products/tool-fin-rack/` — the tool fin rack: schema, the fin pitch solver, validation, geometry, presets.
- `lib/products/wall-hook-rail/` — the wall hook rail: schema with the hook, screw, and shelf layout, validation, geometry, the single-hook coupon, presets.
- `lib/products/headphone-mount/` — the headphone and controller mount: schema with the bottom-to-top layout, validation, geometry, presets.
- `lib/products/shelf-riser/` — the shelf riser: schema with the leg plan, the ribs, the pockets, and the leg split, validation, geometry, presets.
- `lib/products/entryway-valet/` — the entryway valet: schema with the well-width layout and the rest wedge, validation, geometry, presets.
- `lib/products/registry.ts` — the ordered list of products the app can build: each product's schema, validation, copy, presets, and derived values, with its geometry loaded on demand.
- `lib/products/geometry-registry.ts` — one lazy loader per product for its geometry and, where it has one, its fit-test coupon. The worker and every product definition build through this table, so the geometry of a product loads once, when a page first asks for it.
- `lib/generation/` — the Web Worker that loads one product's geometry on demand and builds the preview or the fit-test coupon off the main thread, its message protocol with a `kind` of model or coupon, and the page-side client.
- `lib/design-file.ts` — the portable `.drawerforge.json` format, export, and non-destructive import.
- `lib/printer-profile.ts` — the local printer profile, the pure `compensate()` step, the compensation and calibration text, the build-volume warning, the thin-wall error, and the print context a product's validation may read.
- `lib/workspace.ts` — the versioned local storage envelope with one current design per product, and the version 1 migration.
- `app/components/ProductApp.tsx` — renders any product from the registry.
- `app/components/ParameterControls.tsx` — number, boolean, and enum controls driven by specs.
- `app/components/ModelViewer.tsx` — the Three.js preview.

To add a product, create a folder under `lib/products/`, export a `ProductDefinition`, and add it to `lib/products/registry.ts`. Register its lazy geometry loader in `lib/products/geometry-registry.ts` under the same product id, including its coupon builder if it has one. Route the definition's `generate` and optional `coupon` through `loadGeometry()` so the page and worker share that loader. Keep definition imports separate from solid builders. `tests/products.test.ts` checks every registered product, matching geometry loaders, and these import boundaries.

## Geometry and export

The drawer tray is constructed as one solid with a rounded outer profile. A manifold-guaranteeing WebAssembly geometry kernel, running in a dedicated Web Worker so the page stays responsive, subtracts one exact inward-offset cavity, clips and unions the row/column dividers into that shell, and then cuts the optional front finger scoop. This keeps the rounded perimeter continuous even at large corner radii. The result is copied once into a Three.js triangle mesh; that same in-memory mesh drives both the preview and the custom binary STL serializer.

Automated geometry checks cover representative 1×1, 1×3, 2×3, and 4×4 organizers. They verify requested bounds, finite coordinates, positive signed volume, non-degenerate triangles, outward winding, and exactly two oppositely directed faces per mesh edge. Cross-section and point-in-solid regressions also prove that extreme valid radii and the Hand tools preset retain a continuous perimeter around every compartment. Export tests independently parse the binary STL and compare its bounds to the preview mesh.

The socket tray starts as a rounded slab. One batched union of every bore cutter is subtracted in one Boolean, then the underside pockets. Its tests slice the mesh above the base and count one outer contour and one hole per bore, and slice through the pockets and count the pocket grid.

The card holder starts as the same rounded slab and subtracts one batched union of tilted slot cutters. The plant pot and the plant pot saucer are revolved forms: a two-dimensional profile in the radius-height plane is revolved about the Z axis, and a second revolved profile is subtracted as the cavity. Mesh quality sets the segments in one revolution, 48, 96, or 192. Their tests slice the mesh at many heights and check that the part is one closed solid at every level, that the saucer floor has no hole in it, and that the pot's drainage holes never reach the wall.

The bracket products model the wall as the plane Y = 0: the plate fills Y from minus its thickness to zero, and every hook, pocket, and shelf projects toward −Y, the side the viewer's camera faces, so the hooks show in the default view. A print pose test turns each product's mesh exactly as the viewer's **Print pose** toggle does and checks every face normal: no face may point down more steeply than 45 degrees unless it lies on the bed. The hook lip ramp is the one face at that limit.

STL has no embedded unit metadata. DrawerForge models coordinates as millimeters, so import downloads into a millimeter-based slicer without scaling.

## Deployment

DrawerForge deploys to Cloudflare Workers, from `wrangler.jsonc` at the repository root. `npm run deploy` builds and deploys the production Worker. `npm run deploy:preview` builds and deploys the separate `preview` Worker environment; it never touches production. Both need `wrangler login` locally, or the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` environment variables in CI.

The Cloudflare environment (production or `preview`) is selected at build time, through the `CLOUDFLARE_ENV` variable, not at deploy time. `npm run deploy:preview` sets it for you (`CLOUDFLARE_ENV=preview vinext deploy --preview`) — do not replace it with a plain `vinext deploy --preview`, which silently deploys production under the preview label instead. `npm run test:deploy-config` proves this stays correct.

CI deploys a preview on every pull request and production on every push to `main`. It also runs the preview-config proof above and a `PUBLIC_ORIGIN` warning check (below) on every push and pull request, with no Cloudflare account needed; only the two actual deploy commands are skipped when the `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` repository secrets are not set.

`app/layout.tsx` builds every absolute URL (Open Graph, canonical links) from a configured `PUBLIC_ORIGIN` Worker variable, resolved by `lib/origin.ts`. It defaults to `http://localhost:3000`. `wrangler.jsonc` sets `vars.PUBLIC_ORIGIN` to the production Worker's address and `env.preview.vars.PUBLIC_ORIGIN` to the preview Worker's address (Wrangler does not inherit `vars` into a named environment); change both if a Worker gets a custom domain — this is a config-file edit, not something CI can set for you. CI separately reads a `PUBLIC_ORIGIN` **repository variable** (not a secret) and runs `npm run check:public-origin`, which prints a visible warning (never a failure) if the built page would still ship the `localhost:3000` default; setting that repository variable silences the warning but does not, by itself, change the real deployed origin.

See [`outputs/drawerforge-agent-handoff/26_CLOUDFLARE_MIGRATION_NOTES.md`](outputs/drawerforge-agent-handoff/26_CLOUDFLARE_MIGRATION_NOTES.md) for the rollback plan and the deployed-origin acceptance checklist.

## Current limitations

- Layouts follow each product's parameters: tray grids, individual wells, bores, slots, fins, hooks, and revolved forms
- One product per design; automatic splitting is supported for shelf-riser legs, but there is no general-purpose splitting for other products
- No arbitrary divider drawing, slicer settings, or multi-model projects
- The last valid design for each product persists in the current browser’s local storage; use a design file to move it
- The drawer tray's front finger scoop has an automatically constrained size and position

## Engineering handoff

The repository includes a self-contained engineering handoff for agents and
contributors in [`outputs/drawerforge-agent-handoff/`](outputs/drawerforge-agent-handoff/README.md).
It covers product requirements, architecture diagrams, geometry and STL
contracts, UX decisions, tests, deployment migration, and the recommended
expansion roadmap. A portable ZIP is also available at
[`outputs/drawerforge-agent-handoff-2026-09-01.zip`](outputs/drawerforge-agent-handoff-2026-09-01.zip).
