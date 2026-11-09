# Benchmarks

`triflow_benchmark.cpp` compares the time to generate 5,000,000 64-bit outputs
from `clank::TriFlowRng` and `std::mt19937_64`. It reports each generator's
elapsed time, nanoseconds per output, and a checksum computed from its outputs.

Build and run from the repository root with optimization enabled:

```sh
g++ -std=c++11 -O3 -Wall -Wextra -Wpedantic -Werror \
    benchmarks/triflow_benchmark.cpp -o benchmarks/triflow_benchmark
./benchmarks/triflow_benchmark
```

This is a local speed comparison only. Results depend on the compiler, hardware,
and system load; the benchmark does not assess output quality or security.
One run in this development environment measured about 8.2 ns/output for
TriFlow and 1.7 ns/output for `std::mt19937_64`; treat those as an example
measurement, not a portable performance claim.

## Seed Lab statistics

Run `node benchmarks/seed_lab_benchmark.cjs` from the repository root. This
dependency-free benchmark warms up the existing model, then reports seven
five-run averages and their median for summarizing a fixed 65,536-word batch.
It records Node, platform, CPU, seed and a result checksum. An optional module
path measures a saved CommonJS copy of an earlier `seed_lab.js` with the same
workload, for example `node benchmarks/seed_lab_benchmark.cjs build/optimization/seed_lab_before.cjs`.
This measures statistics computation, excluding generation, canvas drawing and
browser layout. Compare repeated runs on the same machine and runtime.
