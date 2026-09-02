# S02. Per-Product Route and Page Metadata

## Goal

Give each product its own URL and page metadata, so a second product can ship without touching the page shell.

## Model and effort

Sonnet 5, medium. This is routing, copy, and metadata in an app that already has the registry. Review by Opus 5, high.

## Depends on

None.

## Scope

1. Add `app/products/[id]/page.tsx`. It reads the id, resolves the product from the registry, and renders `ProductApp` keyed on the id. An unknown id renders a not-found page with links to every product.
2. Keep `/` as the drawer tray. It renders the same component with the default product id.
3. Move the page title and description into `product.copy`. Add `title` and `description` to `ProductCopy`. `generateMetadata` reads them.
4. Put the design name in the document title while a name is set: "Left bench · DrawerForge".
5. Add a favicon in `app/`. Remove the 404 noted in document 12.
6. Add a small product switcher in the header that lists every registered product. With one product it shows one item.
7. Move the header brand copy out of `ProductApp` into the layout, so the component renders only product content.

## Out of scope

A product catalog landing page with images. Per-product Open Graph images.

## Deliverables

- Route file, not-found page, favicon
- `ProductCopy` additions and the drawer tray's values
- Header switcher and layout change
- Tests listed below
- `17_PRODUCT_ROUTES_NOTES.md`

## Acceptance

- `/products/drawer-tray` and `/` render the same app.
- `/products/unknown` renders the not-found page with a 404 status from the worker.
- The SSR test asserts the title and description from `product.copy`, not literals.
- No request for `/favicon.ico` fails.

## Tests

- SSR test: both routes render, the unknown route returns 404, the title comes from the product.
- Integration: the document title follows the design name.
- Browser smoke: navigate between `/` and the product route; the workspace design restores on both.

## Risks

The vinext router classifies routes by static analysis. Verify the dynamic route builds and renders in the worker before writing tests around it.

## Notes to record

How the worker returns 404 for an unknown product. Whether the switcher should hide with one product.
