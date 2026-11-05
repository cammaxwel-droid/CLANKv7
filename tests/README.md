`triflow_rng_test.cpp` checks a fixed output vector, same-seed repeatability,
different-seed divergence, zero-seed handling, and a broad high-byte histogram
smoke bound.

Build it from the repository root with:

```sh
g++ -std=c++11 -Wall -Wextra -Wpedantic tests/triflow_rng_test.cpp -o triflow_rng_test
./triflow_rng_test
```

The histogram is only a quick sanity check, not a statistical certification.
Distribution, bias, runs, and correlation testing still need to be added.
