# Chain 0.6.2-rc.1

Release candidate for review. The preprocessing contract is `chain-seed-v2`.
The generator contract remains `triflow-v1`.

## Why this changes the experimental wrapper

Chain 0.6.1 used incorrect inverse formulas, applied them in forward order,
and attempted to recover seeds after a lossy Cross-feed transformation. Both
seed 0 and seed 2^64 - 1 produced the same repaired seed and TriFlow stream for
the same generation when Cross-feed was enabled.

The new Chain path applies reversible transformations directly to the original
seed before combining it with generation. Every step preserves all seed bits
in an invertible mapping. The old lossy experiment remains available through
`experimental_seed` for reproduction. Its saved vectors and browser Seed Lab
continue to describe that original experiment.

## Functions and compatibility

| Function | Contract |
| --- | --- |
| `experimental_seed` | Original experimental formulas, including the known lossy Cross-feed |
| `invert_seed_experiment` | Correct inverse for the original Quadratic/Rotate stages, applied in reverse order. Throws `std::invalid_argument` when Cross-feed is enabled |
| `chain_seed` | Version 2 preprocessing using reversible Quadratic, Rotate and replacement Cross-feed |
| `invert_chain_seed` | Exact inverse of `chain_seed` for all eight option combinations |
| `generation_rng_tail` | Existing deterministic generation permutation |
| `experimental_seed_repaired` | Version 2 Chain preprocessing, XOR with generation tail, then the existing final rotation braid |

The broken 0.6.1 wrapper's effective seeds intentionally change. Replay records
must distinguish `chain-seed-v2` from 0.6.1, and record the original seed,
generation and three option flags. The old tag preserves the original snapshot.
Calls trying to invert the old lossy experiment now receive an explicit error,
and that function no longer has a `noexcept` contract. Source callers using that
contract or enabling original Cross-feed must account for this change.

`src/triflow_rng.hpp`, the raw TypeScript engine, `experimental_seed` and their
existing expected outputs retain their prior behavior. The browser Seed Lab
continues to demonstrate the original experiment. It does not display Chain v2.
The original Chain release candidate kept Bench on a separate branch. The
unified candidate now includes Bench with a native-matching JavaScript Chain
port, selectable preprocessing, generation and all eight stage masks.

## Exact operations

All 64-bit additions and multiplications wrap modulo 2^64. The Quadratic and
Rotate forward formulas are the original formulas.

Quadratic is invertible because the difference between outputs for x and y is
`(x - y) * (1 + 2 * (x + y))`. The second factor is odd, hence invertible modulo
2^64. To invert, subtract the tag constant, start `x = target`, then repeat
`x = target - 2*x*x` 32 times. The initial approximation has correct parity.
Each iteration adds at least two correct low bits, so 32 iterations suffice.

Write Rotate fold as `F = I XOR R17 XOR R41`. Over bits, repeated squaring
gives `F^8 = I`, because the two rotations both become R8 and cancel. Thus
the inverse is `F^7 = F * F^2 * F^4`. The native inverse applies those three
factors. Combined stages are undone in the opposite order to application.

The new Cross-feed divides the word into two unsigned 32-bit halves L and R.
Define `H(v, m, k) = v*m + rotate32(v, k)`, keeping the low 32 bits. Apply:

```text
L = L XOR H(R, 0xa6c5928b, 7)
R = R XOR H(L, 0xd42e90f5, 13)
```

The second line uses the updated L. To invert, undo the R assignment first,
then undo L. Each assignment changes one half using only the other half, so
XORing the same value again recovers it. This replacement is a reversible
two-half cross-feed construction. The original lossy formula is not evaluated
in the Chain v2 path.

The final wrapper XORs the prepared seed with `generation_rng_tail(generation)`,
then applies `I XOR R31 XOR R17`. Any three-term sum of rotations on 64 bits
has its 64th power equal to I, so this last map is invertible. The rotation
map in the generation tail has the same property. Its remaining operations
are invertible unsigned addition, XOR shifts and multiplication by an odd
constant.

Consequently, for fixed generation and option flags, different original seeds
produce different effective seeds. For fixed seed and flags, different 64-bit
generations also produce different effective seeds. There is no claim that
every distinct seed/generation/options tuple has a unique 64-bit result.
These are permutation properties, not proofs of statistical independence,
unpredictability, or added entropy.

## Use and verify

```cpp
#include "seed_experiments.hpp"
#include "triflow_rng.hpp"

clank::SeedExperiments options(true, true, true);
const std::uint64_t effective = clank::experimental_seed_repaired(original_seed, generation, options);
clank::TriFlowRng rng(effective);
const std::uint64_t word = rng.next();
```

`examples/chain_demo.cpp` is a complete fixed-seed program using this path.
On a GCC host, from the repository root:

```sh
g++ -std=c++11 -Wall -Wextra -Wpedantic -Werror examples/chain_demo.cpp -o chain_demo
./chain_demo
python3 -I -B scripts/verify.py --cxx g++
```

On Windows with the supported existing development tools, run
`.\scripts\verify.cmd`. The common driver now includes the new native Chain
tests and independent Python comparison. Normal verification only reads saved
fixtures. The separate Python fixture-creation mode refuses to overwrite a file.

The Chain suite checks 10,392 seeds across all eight modes in both directions,
including edge values, single-bit words, their complements, low integers and
a fixed deterministic corpus. It tests explicit rejection of old Cross-feed
inversion, the previously colliding seed pair and 65,536 generation/replay
cases. Sixty-four independent Python records pin preprocessing, inversion,
the generation wrapper and 512 downstream TriFlow outputs. Python uses modular
Newton iteration and seven Rotate applications to independently check the
native inverse algorithms.

This release is experimental source code for review. It has no independent
randomness assessment or real-money gaming certification.
