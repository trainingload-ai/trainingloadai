# Shared design tokens

Web, NativeWind and native rendering share these authoring sources:

- `src/tokens.mjs`: theme roles, chart roles, spacing, type, radii and motion.
- `src/palette.mjs`: primitive HSL scales and equivalent native hex values.
- `src/visual-colors.mjs`: provider/data/artwork colors, Desktop theme overrides and Apple system color references.
- `src/color-utils.mjs`: `withAlpha()` and `toRgb()` for native, maps, canvas and SVG.

Application components use semantic CSS variables/classes or the exported configuration. Define new colors here rather than adding literals to feature code. Athlete-provided colors remain data and should not be replaced with defaults.

```ts
import { visualColors, withAlpha } from '@trainingloadai/design-tokens/colors';

const focusOverlay = withAlpha(visualColors.map.focus, 0.2);
```

Use `/native` from React Native. CSS consumers import `/web.css`; NativeWind additionally imports `/palette.css` to bind the same primitive scales. Web-only Desktop overrides and chart selectors are in `/desktop.css` and `/integrations.css`. `/apple.swift` supplies generated Watch/widget/recording tokens; consumers verify any committed copy against that export.

Run `pnpm generate`, `pnpm check`, and `pnpm test` in this package after changing sources. The Public root's `pnpm design-tokens:check` also checks Client color usage. Other consumers can run `node scripts/check-color-usage.mjs <source-directory...>`; add `--report-json <path>` for a file inventory. Tests and static artwork are excluded; source literals and runtime color interpolation in Tailwind classes are rejected.
