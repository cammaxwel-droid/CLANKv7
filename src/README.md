Core RNG source lives here. `triflow_rng.hpp` contains the first dependency-free,
header-only C++11 implementation. It needs an explicit 64-bit seed and returns
a deterministic 64-bit sequence; see [`docs/triflow-design.md`](../docs/triflow-design.md)
for the steps and current limitations.

[`seed_experiments.hpp`](seed_experiments.hpp) adds optional, integer-only seed
preprocessing without changing TriFlow. `SeedExperiments` defaults to all-off;
`experimental_seed(seed, options)` applies enabled stages in a fixed order.
These equations add no entropy and the Cross-feed experiment has known seed
collisions. See the [equations and visual lab](../docs/seed-experiments.md).
