# Documentation screenshots

`manifest.json` connects each published `DocsScreenshot` to its real product
route, capture state, localized image files, dimensions, and data source. The
component and Markdown export both resolve images from this manifest; authors do
not need to repeat `imageSrc` in MDX.

## Capture and update

1. Follow the tutorial in the current web or native mobile app using synthetic
   athlete data. Mock responses are allowed; render the actual product components.
2. Capture the whole application viewport. Web images must retain the app header,
   navigation, page identity, and the relevant action. Do not capture only a dialog
   or graph. Native images retain the screen header, safe areas, and available
   navigation. Do not include desktop browser or operating-system chrome.
3. For a dialog that obscures or blurs its page, also show the page and opening
   action before the dialog in the tutorial. A larger dialog image alone does not
   explain where to start.
4. Use a readable viewport, normally 1280×960 for web. A different height is fine
   when needed to show context. Native captures come from the simulator at the
   device's own resolution and display at a maximum width of 390 CSS pixels.
5. Check every image for loading or error states, development overlays, clipped
   controls, real names, private email addresses, tokens, provider identifiers,
   and private GPS locations. Never publish an image with these artifacts.
6. Capture the actual light and dark product themes in English and Simplified
   Chinese. Keep the viewport and operation state identical across themes. Never
   invert colors or use filters to manufacture a dark screenshot. Save WebP assets
   under `apps/docs/public/docs/`. Set `localizedAssets.en`, `localizedAssets.zh`,
   `localizedDarkAssets.en`, `localizedDarkAssets.zh`, the default `asset` and
   `darkAsset`, `aspectRatio`, `viewport`, `capturedAt`, `sourceVersion`, and
   `dataSource`.
7. Keep the caption and operation path accurate for the pictured state. Reuse one
   image for several articles only when it genuinely illustrates the same state.
   Use a stable Demo route, avoiding synthetic fixture IDs and non-existent paths.
8. Set `companionId` only for the same feature on the other platform. The component
   follows this reference once, places the full web viewport behind the phone,
   and uses the article's existing Demo target for the whole group. A source
   capture used only as a companion does not need its own MDX reference. Keep
   platform-exclusive functions as a single full screenshot.
9. Set `status` to `ready` only after reviewing all four locale/theme images.
   Remove obsolete entries when neither an article nor a companion uses them.
10. Run `pnpm --dir apps/docs screenshots:check`, `pnpm --dir apps/docs test`, and
    `pnpm --dir apps/docs build`. Inspect desktop, 390px, and 320px articles in
    both themes, including first load, theme switching, and keyboard activation.

The build checks every published screenshot reference. Unknown IDs, pending
captures, missing locale/theme files, invalid image files, mismatched dimensions
or proportions, invalid pairings, and isolated web crops fail the check.
`pending` is for unpublished capture work;
it must not be used as a published substitute for an image.

The entire screenshot group is one keyboard-accessible Demo link. Do not add an
image lightbox, Preview overlay, nested link, or “View original image” action.
Center the description, operation paths, and Demo hint below the image. Keep
images proportional at narrow widths without clipping or horizontal scrolling.
The product images and device frames follow the docs theme, including the system
preference. Markdown export contains standard images for both platforms using
their light source files, the description, and one Demo link.

Homepage `DocsTaskCard` entries use `screenshotId` to resolve the same themed,
paired media. Their entire card still opens the linked guide; do not nest a Demo
link inside a card. Export their light source images with the guide link, and
include these capture references in the same build-time validation.
