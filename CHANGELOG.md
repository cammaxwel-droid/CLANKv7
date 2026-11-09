# Changelog

## Unified candidate — 2026-11-09

- Consolidated corrected Chain, Bench, Seed Lab and sampling/backend work.
- Added native-matching Chain selection to the offline Bench.
- Fixed source-archive verification and complete test/binary evidence coverage.
- Fixed mutation-sensitive weighted sampling and bounded backend uploads/connections.
- Hardened native half-word arithmetic, fixture creation and vector output checks.
- Preserved frozen raw sequences, saved vectors, main and historical tags.
- Recorded current acceptance and pending Windows/browser visual checks in docs/UNIFIED-CANDIDATE.md.

The following entries describe the earlier sampling branch snapshot.


## [Unreleased] - 2026-11-06

### Features

- Froze the deterministic C++11 TriFlow engine as `triflow-v1`.
- Added a dependency-free TypeScript engine that reproduces the same seeded output stream.
- Added versioned sampling helpers for bounded values, probabilities, weights, picks, shuffles, and 53-bit floats.
- Added reproducible dice and toy reel examples.
- Added a local, token-protected RNG API and CLI diagnostics for known output and source checks.

### Bug fixes

- None.

### Chores

- Added cross-language verification, reference fixtures, tests, benchmarks, and development documentation.
- Documented the engine contract, compatibility limits, and project roadmap.
- Documented sampling validation and draw-consumption rules.

### Breaking changes

- None.
