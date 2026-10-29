# Product screenshot workflow

The screenshot manifest is the capture contract for public tutorials. It keeps
the article, product route, required state, privacy rules, and final asset path
together so screenshots do not become anonymous files that silently drift from
the UI.

## Status values

- `pending` — the tutorial intentionally renders a visual placeholder.
- `ready` — a reviewed asset exists under `public/<asset>` and can be wired to
  the matching `<DocsScreenshot imageSrc="/<asset>" ... />`.

Do not mark a capture `ready` before the asset is committed. `pnpm docs:check`
verifies that every ready asset exists.

## Capture procedure

1. Open the exact route and product state from `manifest.json`.
2. Use a synthetic athlete account with no personal identifiers.
3. Set the viewport to the manifest default: 1440×960 for web or 390×844 for
   mobile, unless the capture defines another size.
4. Hide email addresses, connection identifiers, tokens, precise home
   locations, and real athlete names.
5. Capture the smallest state that proves the tutorial step. Avoid browser
   chrome and unrelated navigation when they do not help orientation.
6. Crop only after capture; do not stretch the image or change the UI's aspect
   ratio.
7. Save a WebP asset at `apps/docs/public/<asset>` using the exact manifest path.
8. Add `imageSrc="/<asset>"` and useful `imageAlt` text to the matching
   `DocsScreenshot` in the English and Simplified Chinese article.
9. Change the manifest status to `ready`, run `pnpm docs:check`, and inspect the
   rendered page in light and dark themes.

## Review checklist

- The screenshot matches the current UI labels and control positions.
- The state is understandable without relying on surrounding prose.
- Text remains readable at the article's normal content width.
- No private or production data is visible.
- Alt text describes what the reader should find or verify.
- A mobile screenshot includes safe-area content but not unnecessary device
  chrome.
- The same asset remains accurate for every locale that reuses it; otherwise,
  create a locale-specific capture and document that choice in the manifest.
