The common verifier also compiles/runs `chain_seed_test.cpp` and compares its
64 fixed records and 512 downstream outputs with independent Python arithmetic
in `reference/chain_seed_v2.py`. Chain tests cover both directions of every
enabled stage combination, generation/replay, the former seed collision, and
explicit errors for attempts to invert original lossy Cross-feed. See the
[candidate contract](../docs/chain-seed-v2.md) for scope and compatibility.

[`triflow_rng_test.cpp`](triflow_rng_test.cpp) checks:

- The original fixed output vector, 10,000-output same-seed replay, and five
  edge-seed vectors for zero, one, the highest seed bit, all bits set, and a seed
  that initializes the first lane to zero.
- Reseeding, including restarting the current seed; mixed `operator()`/`next()`
  calls; and copy/assignment continuation without changing the other instance.
- Different-seed divergence and a broad high-byte histogram smoke bound.

The edge-seed vectors were calculated with a separate Python integer reference
using `(a + b + c) // 3`, whose integers do not overflow, rather than the core's
division-and-remainder average. These vectors pin the current algorithm; they do
not prove that its output is statistically strong.

[`example_utils_test.cpp`](example_utils_test.cpp) checks that the examples'
rejection-based bounded-sampling helper stays in range, replays, rejects zero,
and passes a broad fixed-seed six-way histogram. The
[`example_utils_edge_test.cpp`](example_utils_edge_test.cpp) suite checks
threshold equality and adjacent values, maximum and power-of-two bounds, exact
draw consumption through rejections, and zero-bound exceptions that preserve
generator state. These catch mechanics errors, not statistical weaknesses.
[`triflow_statistics_test.cpp`](triflow_statistics_test.cpp) checks broad
fixed-seed byte-frequency, bit-balance, and adjacent low-bit transition bounds.

Build and run the core and smoke checks from the repository root with a C++11
compiler:

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
Multi-seed bias, runs, and deeper correlation testing still need independent
study.

On Windows with GCC available, use PowerShell:

```powershell
g++ -std=c++11 -Wall -Wextra -Wpedantic .\tests\triflow_rng_test.cpp -o .\triflow_rng_test.exe
if ($LASTEXITCODE -eq 0) { .\triflow_rng_test.exe }
```

## Bounded-sampling edge regressions

`example_utils_edge_test.cpp` tests the example helper from the merged roadmap
work without changing its implementation. A six-sided-dice histogram almost
never exercises rejected draws: its threshold is only 4 out of 2^64 possible
raw values. These deterministic checks deliberately exercise that path:

- Bounds of one, powers of two, and the largest 64-bit unsigned value.
- Raw values immediately below, exactly on, and immediately above the rejection
  threshold; equality must be accepted.
- One rejected draw and several consecutive rejections, checking the precise
  stream position after sampling.
- Invalid zero bounds throwing without advancing a used generator.

```sh
g++ -std=c++11 -Wall -Wextra -Wpedantic -Werror tests/example_utils_edge_test.cpp -o example_utils_edge_test
./example_utils_edge_test
```

With MSVC, run in a Developer Command Prompt from the repository root:

```cmd
cl /nologo /std:c++14 /EHsc /W4 /WX /permissive- tests\example_utils_edge_test.cpp /Fe:example_utils_edge_test.exe
if %errorlevel% equ 0 example_utils_edge_test.exe
```

The source uses C++11 features; MSVC's earliest explicit language switch is
C++14. The original generator regressions and these edge checks both passed
with MSVC and warnings treated as errors. The earlier generator regression
suite also passed with GCC.

The histogram is only a quick sanity check, not a statistical certification.
These edge checks verify sampling mechanics, not the quality or uniformity of
the underlying PRNG.

## Frozen v1 conformance (milestone 1)

Run `.\scripts\verify.cmd` from the repository root on Windows, or
`python3 -I -B scripts/verify.py --cxx g++` with GCC. See the
[development guide](../docs/development.md) for tool discovery and reports.
These commands include all four C++ suites described above without modifying them.

`fixtures/triflow-v1.json` retains the 28 expected words already present in
`triflow_rng_test.cpp`. `reference/triflow_v1.py` checks all of them using
Python's unlimited-width average, verifies the frozen header's identity, and
compares 10,000 consecutive outputs per fixture seed with the C++ engine via
`triflow_stream.cpp`. The fixture is saved evidence, never generated by the
verification command. `reference/test_reference.py` checks that corrupted
evidence fails, and that CRLF/LF checkout differences do not change identity.
`reference/test_verify_driver.py` simulates tool timeouts and launch failures
without running a compiler: reports must keep the attempted command, elapsed
time, error, and any partial output. Ordinary nonzero-exit diagnostics are also
protected. Run all ten Python tests alone from the repository root with:

```powershell
python -I -B -m unittest discover -s .\tests\reference -p test_*.py
```

The text adapter is bounded to one million raw draws per invocation and emits
one lowercase, 16-digit hexadecimal word per line. It is not the planned
binary statistics adapter or the future public sampling API. In particular,
the preserved C++ example helper's one-bound draw behaviour differs from the
approved future helper version; see the [v1 contract](../docs/triflow-v1.md).

Milestone 1 establishes deterministic reproduction on recorded Windows hosts.
It adds no statistical certification, browser/Electron acceptance or gameplay
persistence evidence.

## TypeScript conformance (milestone 2)

After installing the pinned development tools with
`npm.cmd ci --ignore-scripts --no-audit --no-fund`, use `npm.cmd run verify`.
This includes the original C++/Python suites, the existing four verifier
failure-evidence tests, strict declaration checks and nine Node engine tests.
`npm.cmd test` runs the TypeScript/Node part alone.

The new `triflow-v1-checkpoints.json` fixture covers 87 ordered seeds and 12
stream checkpoints per seed. `reference/conformance.py` validates the entire
corpus and compares every one of 10,000 consecutive words per seed across the
unchanged C++, independent Python and compiled TypeScript engines. Saved
checkpoints were created from C++/Python agreement before TypeScript checking;
normal verification does not write fixtures. The creation mode refuses to
overwrite existing files. The original 28-value fixture remains unchanged.

Node tests cover canonical seed rejection (including trailing newlines),
unsigned 64-bit results, instance isolation, immutable API identity, boundary
wrapping/rotations and the wide average. `typescript/api.types.ts` consumes
the public package declarations and pins type errors for number seeds/outputs.
The core compiles without Node or DOM ambient types. See the
[TypeScript guide](../docs/typescript-engine.md) for exact scope and limits.
