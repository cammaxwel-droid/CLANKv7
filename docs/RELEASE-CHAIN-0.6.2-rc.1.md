# Chain 0.6.2-rc.1 — Release candidate for review

Experimental C++11 source candidate fixing the seed-repair failures reproduced
in Chain 0.6.1. Preprocessing contract `chain-seed-v2`; raw engine `triflow-v1`.

## Changes

- Corrects the original Quadratic and Rotate inverses and applies them in
  reverse stage order.
- Explicitly rejects inversion of the original lossy Cross-feed with
  `std::invalid_argument`.
- Adds reversible two-half Cross-feed through `chain_seed` and its exact
  inverse `invert_chain_seed`.
- Makes `experimental_seed_repaired` preserve the original seed through that
  reversible path before combining it with the generation tail.
- Adds native regression coverage, independent Python arithmetic, 64 fixed
  evidence records, a complete demo, and integration with the common verifier.

## Compatibility

The corrected wrapper produces a new sequence of effective seeds. Record
`chain-seed-v2`, the original seed, generation and option flags for replay.
The original lossy experiment remains available for comparison. Attempts to
invert it with Cross-feed enabled now throw, and `invert_seed_experiment` no
longer promises `noexcept`.

The original TriFlow engine, raw TypeScript engine and existing golden words
are preserved. Browser Seed Lab still displays the original experimental
equations. CLANK Bench remains on its separate review branch.

The older `tag-chain-release` tag remains a debugging snapshot. This candidate
is published from its own branch and tag. Main is outside this change.

## Verification

- The full native/Python verifier passed, including the frozen header, 28
  original golden words, 60,000 original C++/Python comparisons, and verifier
  failure-evidence tests.
- Chain round trips passed for 10,392 seeds across all eight modes in both
  directions, including edges, single-bit patterns and a fixed generated corpus.
- The former zero/maximum-seed collision is separated across the tested
  generation/option cases. 65,536 generation/replay cases passed.
- Native and independent Python agree on 64 fixed preprocessing/inverse/wrapper
  records and all 512 downstream TriFlow words. Python checks the native
  inverse with different numerical methods.
- Undefined-behavior sanitizer checks passed for the Chain native suite.
- The original seed experiments and all 15 browser-model/controller tests
  passed, including 36,864 native/browser output comparisons across 576 profiles.

Recorded environment was Linux x64 with GCC 14.2.0, Python 3.12.14 and Node
24.22.1. Windows execution, actual browser rendering and the TypeScript test
suite were not rerun for this candidate.

## Try it

Download the source ZIP, extract it and run the existing verification command
for your development environment. With GCC:

```sh
python3 -I -B scripts/verify.py --cxx g++
g++ -std=c++11 -Wall -Wextra -Wpedantic -Werror examples/chain_demo.cpp -o chain_demo
./chain_demo
```

Windows users with the existing supported compiler/Python setup can use
`.\scripts\verify.cmd`. This is a source release without a Windows installer.

Correctness and permutation properties do not establish statistical quality,
cryptographic security or suitability for real-money gaming. See
`docs/chain-seed-v2.md` for the exact formulas and compatibility contract.
