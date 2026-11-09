# CLANKv7 🎲

Clankv7 was an experiment to see if I could generate random numbers.. and it hopefully succeeded in the way I wanted.

Now we're experimenting with our own random / pseudo-random number generator from scratch, built with AI help by someone pushing their brain. Free for anyone to use and join in; statistical and security claims still need evidence.

## Folder tour
| Folder | What lives there |
|---|---|
| `src/` | the RNG itself |
| `tests/` | randomness and determinism tests |
| `docs/` | design notes and specs |
| `examples/` | dice and toy pokie-reel demos |
| `benchmarks/` | speed comparisons |
| `journal/` | session logs |

See [AGENTS.md](AGENTS.md) for how the AI helper behaves.

## First experiment: TriFlow

The first prototype is a dependency-free C++11 PRNG. Each call advances three
deterministic number lanes, averages their mixed values, then mixes that
average with the lanes to return a 64-bit result. The average is not returned
by itself because plain averaging tends to bunch values near the middle.

Build and run the fixed-seed demo:

```sh
g++ -std=c++11 -Wall -Wextra -Wpedantic examples/triflow_demo.cpp -o triflow_demo
./triflow_demo
```

Run the reproducibility, bounded-sampling, and statistical smoke checks:

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

This is an experimental PRNG, not true randomness or a cryptographic generator.
Do not use it for Bitcoin keys, live gambling, passwords, or other
security-sensitive uses. The tests are fixed-seed smoke checks, not a
statistical certification. See the [design notes](docs/triflow-design.md).

## Visual seed experiments

Open [Seed Lab](examples/seed_visualizer.html) in a modern browser. No server,
installation, or internet connection is needed. Toggle **Quadratic bend**,
**Rotate fold**, and **Cross-feed** to follow a seed through experimental
integer equations, then compare histograms, adjacent-output scatter, and bit
rasters against the original stream. Play, pause, step, and replay a fixed batch.

```powershell
Invoke-Item .\examples\seed_visualizer.html
```

All toggles start off, preserving the original generator. The equations are
also available through an optional C++11 header. They do **not** add entropy;
Cross-feed even merges some distinct seeds. See the
[walkthrough and equations](docs/seed-experiments.md) before interpreting the
pictures as evidence of randomness.

## CLANK Bench

Open [CLANK Bench](examples/clank_bench.html) locally to inspect real TriFlow
draws, lane values, output plots, seed-bit comparisons and raw-word-to-reel
mapping. Simulate bounded batches and compare measured payouts with exact
216-combination maths, then export a diagnostic JSON report. See the
[Bench guide](docs/clank-bench.md) and the optional importable
[main-freeze ruleset](docs/protect-main.md).

## Reproduce the frozen baseline

The current sequence is now named **`triflow-v1`**. The C++ engine and its
existing expected outputs are preserved. An independent Python reference
checks the arithmetic and compares 60,000 outputs with the C++ engine.

On Windows, run the complete milestone 1 check from this folder:

```powershell
.\scripts\verify.cmd
```

It reuses installed development tools and saves an evidence report in a new
`build/milestone-1/` folder. See [development instructions](docs/development.md),
the [frozen engine contract](docs/triflow-v1.md), and the
[approved RNG-kit roadmap](docs/rng-kit-roadmap.md). The planned TypeScript kit
targets play-money browser/Electron games with no cash or redeemable prizes;
later milestones remain separate work.

## TypeScript raw engine

Milestone 2 adds the exact `bigint` port for the future play-money game kit.
It currently provides `createRng(seedHex)` and `nextUint64()`, with declarations
and no runtime dependencies. Helpers and save/replay support come later.

```powershell
npm.cmd ci --ignore-scripts --no-audit --no-fund
npm.cmd run verify
```

The complete check compares C++, Python and TypeScript across 87 seeds and
870,000 raw words per engine, keeping all original expected outputs. See the
[TypeScript engine guide](docs/typescript-engine.md) for the API, exact checks
and current compatibility limits. The local npm metadata remains private.

## Roadmap (tick as we go)
- [x] RNG kit milestone 1: freeze `triflow-v1`, preserve vectors, independent Python reference, repeatable build/check commands and tested failure diagnostics
- [x] RNG kit milestone 2: exact TypeScript engine, strict declarations and C++/Python/TypeScript conformance
- [ ] RNG kit milestones 3-8: helpers, replay, reference game, research, local package, release preparation
- [x] Pick the language: C++11
- [x] Learn the basics: seed, state, output
- [x] Design our first algorithm (write it up in `docs/`)
- [x] First working version in `src/`
- [x] Regression tests: stable streams, edge seeds, reseeding, callable API, and copied state
- [x] Bounded-sampling edge tests: rejection thresholds, large bounds, and invalid-input state preservation
- [x] Initial checks: fixed-seed replay, broad output/bit/transition smoke checks, and bounded-sampling checks
- [x] Edge regressions: seed vectors, reseeding/copying, rejection thresholds, and exact draw consumption
- [ ] Fuller statistical testing: multi-seed bias, runs, correlation, and independent review
- [x] Examples: reproducible dice and toy pokie reels
- [x] Visual seed lab: toggleable integer equations, replayable plots, and C++/browser parity checks
- [x] Speed benchmark against `std::mt19937_64` (not a quality comparison)
- [x] Faster Seed Lab bit statistics using exact 32-bit halves, with a repeatable Node benchmark
- [x] CLANK Bench with raw tracing, reel diagnostics, bounded simulation and report export
- [ ] Choose a licence / release for free
- [ ] Security review before any bitcoin-style use

## Join in
1. Pick an unchecked roadmap item (or propose one in an issue).
2. Ask the AI helper to explain it, then try it yourself.
3. Add a short note to `journal/`.
4. Open a PR and tick the box.

## Questions to ponder
- What is the difference between random and pseudo-random?
- What should our seed be?
- What makes ours *unique*?
