Core RNG source lives here. `triflow_rng.hpp` contains the first dependency-free,
header-only C++11 implementation. It needs an explicit 64-bit seed and returns
a deterministic 64-bit sequence; see [`docs/triflow-design.md`](../docs/triflow-design.md)
for the steps and current limitations.

[`seed_experiments.hpp`](seed_experiments.hpp) adds optional, integer-only seed
preprocessing without changing TriFlow. `SeedExperiments` defaults to all-off;
`experimental_seed(seed, options)` applies enabled stages in a fixed order.
These equations add no entropy and the Cross-feed experiment has known seed
collisions. See the [equations and visual lab](../docs/seed-experiments.md).

Chain 0.6.2-rc.1 adds `chain_seed` and `invert_chain_seed`, with a reversible
Cross-feed replacement. `experimental_seed_repaired` uses this version 2 path.
`invert_seed_experiment` now correctly inverts the original reversible stages
and throws for the original lossy Cross-feed. See the
[Chain v2 contract and replay changes](../docs/chain-seed-v2.md).
