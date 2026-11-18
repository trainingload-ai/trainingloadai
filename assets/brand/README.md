# Trainingload.ai brand artwork

`app-icon-source.png` is the approved glass TL identity prepared as a 1024px opaque,
full-bleed square. Platform masks and export sizes are applied by the generators.
`legacy/` preserves the previous web symbol and the unchanged vector wordmarks.
`LOGO_DARK.svg` and `LOGO_LIGHT.svg` are text-only logos and are never regenerated
by the icon exporter. The former desktop vector source remains
in `apps/desktop/assets/app-icon-source.svg` as a legacy archive.

Regenerate Web, Docs and Desktop assets from the repository root:

```sh
pnpm brand:generate
pnpm brand:check
```

The shared export code is `scripts/brand-assets.mjs`. It uses the desktop package's
declared Sharp dependency. It does not depend on a private checkout or credentials.
Keep the production master and legacy artwork unchanged when regenerating exports.
