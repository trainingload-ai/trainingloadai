# Lactate numerical reference

`generate.R` sources the original base-R helpers from lactater **1.0.0**, commit
[`2cd3709f6442447b3b9128e325f13fa38570eb17`](https://github.com/fmmattioni/lactater/tree/2cd3709f6442447b3b9128e325f13fa38570eb17).
No replacement R implementation or optional R package is used. The committed
fixture consists of simulated data, not athlete records.

Run from the repository root with Node 22 or later:

```sh
node scripts/lactate-reference/regenerate.mjs --check
# To intentionally update the checked-in JSON after reviewing changes:
node scripts/lactate-reference/regenerate.mjs
```

The first run downloads two immutable, checksum-verified archives to a temporary
cache. Set `LACTATE_REFERENCE_CACHE` to retain that cache; subsequent runs work
offline. The script verifies both archives on every run. A fixed WebR 0.5.4
WebAssembly worker runs **R 4.5.1** with an in-memory filesystem containing only
the seven method files and the generator. No host R or Docker is required.
WebR is a development-only download, absent from the workspace dependencies,
production bundle and regular CI. A native R 4.5.2 container was considered but
not used to generate this reference; fixture metadata names the actual runtime.

Regular verification:

```sh
pnpm --filter @trainingloadai/docs exec vitest run src/lib/lactate-analysis.spec.ts
```

The six cases exercise cycling/running, optional rest, an early dip, a rise of
exactly 0.4 mmol/L, four exercise stages and targets above the observed curve.
Every method's availability and unrounded intensity is compared. Tolerances are
**0.01 W** and **0.001 km/h**, above base R optimizer/root tolerance and below UI
rounding. Independent analytic tests check cubic recovery, multiple roots,
tangencies, maximum distance, flat curves, unit scaling and validation.

Intentional edge policies, tested separately:

- Rest supplies baseline but is excluded from curve fitting and Log-log.
- A rise of 0.4 uses a 1e-9 tolerance; a decimal representation must not move the
  ModDmax start to a later stage.
- Roots are solved within the measured exercise range. The last upward crossing
  is selected; tangencies are unavailable and no extrapolation is returned.
- Heart rate is interpolated only between adjacent measured stages with both
  values. Upstream's interpolation can bridge missing heart-rate samples.
- Internal results remain unrounded; presentation/export retains provenance.
- Flat/degenerate fits, zero-distance Dmax and invalid LT1/LT2 pairs return explicit
  unavailability rather than an arbitrary numeric threshold.

The TypeScript implementation is adapted from the method definitions and
independently implemented numerical routines. Retain the upstream MIT notice in
[`LICENSE.lactater`](./LICENSE.lactater). The Public repository's AGPL license
continues to apply to this implementation. WebR's license is included in its
downloaded archive; no WebR files are redistributed here.
