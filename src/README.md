Core RNG source lives here. `triflow_rng.hpp` contains the first dependency-free,
header-only C++11 implementation. It needs an explicit 64-bit seed and returns
a deterministic 64-bit sequence; see [`docs/triflow-design.md`](../docs/triflow-design.md)
for the steps and current limitations.
