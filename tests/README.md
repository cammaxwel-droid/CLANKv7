`triflow_rng_test.cpp` checks a fixed output vector, same-seed repeatability,
different-seed divergence, zero-seed handling, and a broad high-byte histogram
smoke bound. `example_utils_test.cpp` checks that the examples' rejection-based
bounded-sampling helper stays in range, replays for the same seed, rejects a
zero bound, and passes a broad fixed-seed six-way histogram smoke check.
`triflow_statistics_test.cpp` checks broad fixed-seed byte-frequency, bit
balance, and adjacent low-bit transition bounds.

Build and run all checks from the repository root with:

```sh
g++ -std=c++11 -Wall -Wextra -Wpedantic tests/triflow_rng_test.cpp -o triflow_rng_test
./triflow_rng_test
g++ -std=c++11 -Wall -Wextra -Wpedantic tests/example_utils_test.cpp -o example_utils_test
./example_utils_test
g++ -std=c++11 -Wall -Wextra -Wpedantic tests/triflow_statistics_test.cpp -o triflow_statistics_test
./triflow_statistics_test
```

These are deterministic smoke checks, not statistical certification or evidence
of cryptographic security. Multi-seed bias, runs, and deeper correlation
testing still need independent study.
