[`triflow_rng_test.cpp`](triflow_rng_test.cpp) checks the original fixed output
vector plus five edge-seed vectors, same-seed repeatability, different-seed
divergence, reseeding, interchange of `operator()` and `next()`, copied-state
continuation, and a broad high-byte histogram smoke bound.
[`example_utils_test.cpp`](example_utils_test.cpp) checks that the examples'
rejection-based bounded-sampling helper stays in range, replays for the same
seed, rejects a zero bound, and passes a broad fixed-seed six-way histogram
smoke check. [`example_utils_edge_test.cpp`](example_utils_edge_test.cpp) adds
threshold equality and adjacent-value checks, maximum and power-of-two bounds,
one/multiple rejections with exact draw consumption, and zero-bound exceptions
that leave generator state unchanged. These catch off-by-one and state-advancement
mistakes, not statistical weaknesses.
[`triflow_statistics_test.cpp`](triflow_statistics_test.cpp) checks broad
fixed-seed byte-frequency, bit balance, and adjacent low-bit transition bounds.

Build and run the core and bounded-sampling checks from the repository root with:

```sh
g++ -std=c++11 -Wall -Wextra -Wpedantic tests/triflow_rng_test.cpp -o triflow_rng_test
./triflow_rng_test
g++ -std=c++11 -Wall -Wextra -Wpedantic tests/example_utils_test.cpp -o example_utils_test
./example_utils_test
g++ -std=c++11 -Wall -Wextra -Wpedantic tests/example_utils_edge_test.cpp -o example_utils_edge_test
./example_utils_edge_test
g++ -std=c++11 -Wall -Wextra -Wpedantic tests/triflow_statistics_test.cpp -o triflow_statistics_test
./triflow_statistics_test
```

## Seed-equation and browser-model checks

[`seed_experiments_test.cpp`](seed_experiments_test.cpp) covers 24 fixed seed
vectors, all eight toggle combinations, stage order, disabled-stage compatibility,
576 replay profiles, and the documented Cross-feed collision. Its `--vectors`
mode emits seeds, settings, effective seeds, and 64 outputs per profile.

[`seed_lab_test.cjs`](seed_lab_test.cjs) uses Node's built-in test runner (no npm
packages). It checks exact seed parsing, the original output vector, all equation
combinations, plot statistics, replay, and 48 fixed seed/settings statistical
smoke checks. When `CLANK_VECTOR_EXE` points at the compiled C++ test, it also
compares 36,864 outputs directly with C++. Without it, that one parity test is
explicitly skipped; the other tests still run.

With GCC and Node, from the repository root:

```sh
g++ -std=c++11 -Wall -Wextra -Wpedantic tests/seed_experiments_test.cpp -o seed_experiments_test
./seed_experiments_test
CLANK_VECTOR_EXE=./seed_experiments_test node --test tests/seed_lab_test.cjs
```

On Windows, in a Visual Studio Developer PowerShell with Node installed:

```powershell
cl /nologo /EHsc /W4 /std:c++14 tests\seed_experiments_test.cpp /Fe:seed_experiments_test.exe
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
.\seed_experiments_test.exe
$env:CLANK_VECTOR_EXE = (Resolve-Path .\seed_experiments_test.exe).Path
node --test .\tests\seed_lab_test.cjs
```

MSVC's earliest selectable mode is C++14; the header itself uses C++11 features.
The optional browser script does not add any requirement to the C++ core.

### Visualizer controller and manual checks

[`seed_visualizer_test.cjs`](seed_visualizer_test.cjs) runs the actual controller
with a small simulated DOM, canvas, and clock using Node's built-in modules.
It checks state and control behavior without installing a browser package:

```powershell
node --test .\tests\seed_lab_test.cjs .\tests\seed_visualizer_test.cjs
```

These tests cannot validate real browser layout, canvas pixels, focus handling,
or browser compatibility. Open [`seed_visualizer.html`](../examples/seed_visualizer.html)
and check the following manually:

- All toggles start off, and both streams agree. Turning an equation on updates
  the seed stages and plots; turning it off restores the original sequence.
- Zero and the maximum unsigned seed are accepted; a negative or too-large
  seed shows an accessible error without replacing the last valid plots.
- Play/pause, Step, and Replay are deterministic and stop at 4,096 samples.
- Keyboard controls remain usable, and charts/text fit a narrow window.
- With Cross-feed alone, seeds zero and `0xffffffffffffffff` produce the same
  effective seed and plots, as the collision warning describes.

These are deterministic smoke checks, not statistical certification or evidence
of cryptographic security. A passed test does not make the known seed collision
disappear. Runs, deeper correlation studies, long-cycle checks, larger seed
samples, and independent testing still need further work.
