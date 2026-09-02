# S03. Viewer Scale and Print Orientation

## Goal

Make the 3D viewer correct for any part size, from a 40 mm battery holder to a 600 mm tray, and show the print orientation for products that need one.

## Model and effort

Sonnet 5, medium. Three.js scene work with a visual check in a real browser. Review by Opus 5, high.

## Depends on

None. S09 needs the orientation hint.

## Scope

1. Derive the ground plane size, grid spacing, fog range, shadow camera bounds, and camera distance from the mesh bounding box on every model change. Keep the current look for the default tray.
2. Snap grid spacing to 1, 5, 10, 50, or 100 mm so the grid stays readable.
3. Add an optional `printOrientation` member to `ProductDefinition`: a rotation that puts the part in its print pose plus one line of text. The viewer shows a "Print pose" toggle when the product provides one. The default is the modeled pose.
4. Keep the viewer's public props unchanged except for the new optional orientation.

## Out of scope

Supports, slicer previews, and layer visualization.

## Deliverables

- `ModelViewer.tsx` changes
- `printOrientation?` on the contract; the drawer tray does not set one
- A Playwright screenshot script under `tests/browser/` that renders the default tray and a 40 mm cube fixture, for a person to compare
- `18_VIEWER_SCALE_NOTES.md`

## Acceptance

- A 40 mm part fills the viewport as well as a 300 mm part does.
- The default tray screenshot matches the current one within a visual tolerance a person accepts.
- The "Print pose" toggle appears only for a product with an orientation.

## Tests

- Unit: the scale function returns expected grid spacing and camera distance for bounds of 40, 300, and 600 mm.
- Existing viewer integration tests still pass with the mock.
- Screenshots recorded in the notes.

## Risks

Software WebGL in headless Chromium renders slowly. Keep screenshot tests out of the CI gate until S10 measures their cost.

## Notes to record

The scale formula. Screenshot pairs before and after.
