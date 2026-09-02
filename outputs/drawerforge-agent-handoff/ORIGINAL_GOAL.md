# Original DrawerForge goal

The following brief was the source requirement for the implementation. It is preserved here so future agents can distinguish the original v1 contract from later roadmap ideas.

> Build a polished, fully functional in-browser parametric STL generator called “DrawerForge.” Its purpose is to let ordinary users design a simple, 3D-printable drawer organizer without installing CAD software. Continue working until the app builds successfully, passes its tests, has been visually verified in a real browser at desktop and mobile sizes, and can generate, preview, and download a valid STL.
>
> Begin by inspecting the repository and following its existing conventions. If it is empty, use React, TypeScript, and Vite. Prefer a browser-only architecture with Three.js for visualization and a robust client-side geometry library such as `@jscad/modeling` for solid construction and STL serialization. Do not add a backend, authentication, database, or cloud dependency.
>
> Product experience:
>
> - Create a clean, inviting workshop-inspired interface—not a generic admin dashboard.
> - Use a responsive split layout: parameter controls on the left and a large 3D preview on the right. Stack them sensibly on small screens.
> - Give every dimensional parameter both a slider and a synchronized numeric field.
> - Use millimeters throughout and clearly label units.
> - Regenerate the preview immediately or with a short debounce after valid input changes.
> - Include useful presets such as “Cutlery,” “Desk Supplies,” “Hardware,” and “Custom.”
> - Persist the most recent valid design in localStorage and provide a clear reset-to-defaults action.
>
> Parametric model:
>
> - Generate one watertight drawer-organizer tray with a solid floor, rounded outer corners, perimeter walls, and evenly divided rectangular compartments.
> - Parameters must include:
>   - Drawer interior width and depth
>   - Fit clearance per side
>   - Organizer height
>   - Outer wall thickness
>   - Base thickness
>   - Divider thickness
>   - Outer corner radius
>   - Number of rows and columns
>   - Mesh quality: Draft, Standard, or Fine
> - Calculate organizer width and depth from the drawer dimensions minus the selected clearances.
> - Display the resulting outside dimensions and approximate internal compartment dimensions.
> - Add an optional shallow front finger scoop that does not compromise the base or produce invalid geometry.
> - Keep the first version intentionally simple: no arbitrary divider drawing, automatic multi-piece splitting, slicer features, or multi-model projects.
>
> Validation and geometry safety:
>
> - Prevent impossible combinations such as walls consuming the interior, corner radii exceeding the tray bounds, non-positive dimensions, or compartments narrower than 10 mm.
> - Show concise inline validation messages and preserve the last valid preview when current inputs are invalid.
> - Use practical 3D-printing defaults, including approximately 2 mm walls, a 2 mm base, sensible clearance, and Standard mesh quality.
> - Ensure generated geometry contains finite coordinates, outward-facing normals, no zero-area triangles, and no unintended open boundaries or self-intersections.
> - Confirm the generated mesh bounds match the requested organizer dimensions within a small floating-point tolerance.
>
> 3D preview:
>
> - Provide orbit, zoom, and pan controls.
> - Add a ground grid, soft lighting, shadows or contact shading where practical, and an easy-to-read material color.
> - Include Reset View and Fit to Model controls.
> - Show loading or regeneration feedback without blocking the rest of the UI.
> - Dispose of replaced Three.js geometries and materials so repeated edits do not leak memory.
> - Keep the browser console free of errors and avoid remounting the entire viewer on every parameter update.
>
> STL export:
>
> - Add a prominent “Download STL” button that is disabled while inputs are invalid.
> - Export the exact geometry currently shown in the preview as a binary STL generated entirely in the browser.
> - Use a deterministic filename such as `drawerforge-300x200x50-2x3.stl`.
> - Treat model coordinates as millimeters and explain that STL is unitless but intended for millimeter-based slicers.
> - Verify the downloaded file is nonempty, parseable, and has the same bounding box as the previewed model.
>
> Engineering quality:
>
> - Separate parameter validation, geometry generation, Three.js conversion, STL export, and UI state into maintainable modules.
> - Keep a single normalized parameter model as the source of truth for preview and export.
> - Add accessible labels, keyboard-operable controls, visible focus states, and sufficient contrast.
> - Avoid unnecessary dependencies and premature abstraction.
> - Add a concise README covering setup, commands, parameter behavior, geometry approach, STL units, and known v1 limitations.
>
> Verification:
>
> - Add unit tests for parameter normalization, derived dimensions, invalid combinations, preset loading, and deterministic filenames.
> - Add geometry tests confirming expected bounds, positive volume, finite vertices, non-degenerate triangles, and closed manifold edges for representative 1×1, 1×3, 2×3, and 4×4 organizers.
> - Add an integration or browser test proving that numeric fields and sliders stay synchronized, valid changes update the preview, invalid inputs block download, presets work, and STL download succeeds.
> - Run the repository’s lint, type-check, test, and production build commands.
> - Launch the app and inspect it in a real browser at desktop and mobile widths. Exercise the controls, orbit the model, test invalid values, download an STL, and correct visual or interaction problems you find.
>
> Work autonomously in checkpoints and provide compact progress updates naming what was implemented, what was verified, and what remains. Make pragmatic decisions when details are unspecified. Do not stop merely because the first implementation renders; stop only when the complete validation loop above passes and the app feels coherent and usable.

