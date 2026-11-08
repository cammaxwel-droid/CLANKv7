# CLANKv7

An experimental, reproducible random-number toolkit built around the original
TriFlow generator. This unified candidate brings the native engine, corrected
Chain seed preprocessing, TypeScript sampling, local diagnostics and both
browser workbenches into one checkout.

Main and historical tags remain available for debugging. See the
[current candidate review](docs/UNIFIED-CANDIDATE.md) for integration decisions,
verification evidence and remaining limits.

## Start here

| What you want | Open or run |
| --- | --- |
| Inspect draws, Chain stages and reel outcomes | Open `examples/clank_bench.html` locally |
| Explore the original seed equations | Open `examples/seed_visualizer.html` locally |
| Run native, reference and available browser-model tests | `python3 -I -B scripts/verify.py --cxx g++` |
| Verify on Windows using installed development tools | `.\scripts\verify.cmd` |
| Build and test the TypeScript kit | `npm.cmd ci --ignore-scripts --no-audit --no-fund`, then `npm.cmd test` |
| Run every verification layer | `npm.cmd run verify` |
| Inspect local source/vector diagnostics | `npm.cmd run backend -- diagnostics` |

Use `npm` instead of `npm.cmd` outside Windows. Compiler and interpreter setup
is covered in the [development guide](docs/development.md). Source ZIPs work
without Git metadata. Keep browser HTML, scripts and stylesheets together.

## The pieces

**TriFlow** is the dependency-free C++11 PRNG in `src/triflow_rng.hpp`. Its
sequence is frozen as `triflow-v1`. The TypeScript and browser implementations
reproduce its exact unsigned 64-bit arithmetic. A seed determines the sequence.

**Chain** preprocesses an original seed and generation using reversible stages.
The current contract is `chain-seed-v2`. Its corrected wrapper intentionally
produces different effective seeds from the broken Chain 0.6.1 snapshot.
The original lossy seed experiments remain available for comparison.
[Chain contract](docs/chain-seed-v2.md)

**Sampling** turns raw words into bounded values for games. Its separate
`clank-sampling-v1` contract defines validation and exact draw consumption.
[Sampling API](docs/sampling-v1.md)

```js
import { createRng, createSampler } from "@clankv7/rng";

const rng = createRng("0123456789abcdef");
const sampler = createSampler(rng);
console.log(sampler.intBelow(6));
```

Build the TypeScript package before using its import. Full seeds and output
words remain BigInts. The raw API requires exactly 16 lowercase hex digits
without `0x`. The browser interfaces also accept exact decimal seed text.

**CLANK Bench** displays real draw traces, output plots, a one-bit seed
comparison, rejection mapping into reel stops, measured payouts and exact
216-combination game maths. Select raw TriFlow or Chain v2 preprocessing.
Its simulations use hypothetical credits and bounded batches.
[Bench guide](docs/clank-bench.md)

**Seed Lab** exposes the original optional equations, including the documented
Cross-feed collision. It helps compare transformations and inspect results.
[Seed Lab guide](docs/seed-experiments.md)

**Local diagnostics** offers a command-line check and an optional authenticated
loopback HTTP service. It uses a separate host-generated token and bounded
requests. [Backend guide](docs/local-backend.md)

## Verification and packaging

`npm.cmd test` builds the TypeScript declarations and runs engine, sampling,
backend and browser-model tests. The native parity test is explicitly skipped
when no `CLANK_VECTOR_EXE` is supplied. `npm.cmd run verify` builds that adapter
and runs the complete native/Python/TypeScript comparisons and browser models
without that skip. Each verifier run writes a new evidence directory under
`build/` and records source identities, commands, outcomes and binary hashes.

For a local npm archive, run `npm.cmd pack`. Its prepack step rebuilds the
JavaScript and declarations. The package stays private with no runtime
dependencies. Public publishing and licensing remain separate decisions.

## Layout

| Folder | Contents |
| --- | --- |
| `src/` | Native generator, Chain and TypeScript engine/helpers |
| `examples/` | Offline workbenches and native demonstrations |
| `tests/` | Regression suites, independent references and fixed evidence |
| `scripts/` | Verification and optional local diagnostics |
| `docs/` | Current contracts, guides and research roadmap |
| `benchmarks/` | Reproducible local speed measurements |
| `journal/` | Historical development records |

## Current limits

Passing tests establishes the checked arithmetic and repeatability properties.
It does not establish uniformity, independence or unpredictability. TriFlow is
an experimental PRNG with no external entropy source and no cryptographic or
real-money gaming certification. Broader statistical assessment, durable game
sessions and public release preparation remain on the
[roadmap](docs/rng-kit-roadmap.md).

No distribution licence has been selected. Package metadata remains private
and `UNLICENSED`. Existing designs and saved vectors are preserved. See
[AGENTS.md](AGENTS.md) for the project's development instructions.
