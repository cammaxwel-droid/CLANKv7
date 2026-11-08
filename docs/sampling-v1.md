# Sampling helpers: `clank-sampling-v1`

The sampling layer converts the unchanged `triflow-v1` raw stream into common
game values. Its separate identifier is `clank-sampling-v1`. It does not change
raw outputs, add dependencies, or make the PRNG suitable for security-sensitive
or real-money uses.

```js
import { createRng, createSampler } from "@clankv7/rng";

const sampler = createSampler(createRng("0123456789abcdef"));
const reelStop = sampler.intBelow(6);
const shuffledCards = sampler.shuffle(["A", "B", "C"]);
```

`createSampler` accepts only a `triflow-v1` raw RNG. Its frozen API provides:

| Method | Result |
|---|---|
| `intBelow(bound)` | Integer from `0` through `bound - 1`; `bound` is 1 through `2^32`. |
| `intBetween(minInclusive, maxExclusive)` | Integer in the half-open interval; width is 1 through `2^32`. Endpoints must be safe integers. |
| `float53()` | Number in `[0, 1)`, formed from the top 53 bits of one raw word. |
| `chance(numerator, denominator)` | True with the exact integer ratio; denominator is 1 through `2^32`, numerator is 0 through denominator. |
| `pick(items)` | One uniformly bounded array index. Empty arrays are invalid. |
| `pickWeighted(items)` | Selects `{ value, weight }` records using nonnegative integer weights whose total is 1 through `2^32`. |
| `shuffle(items)` | Fisher-Yates shuffle returned as a new array; the input is unchanged. |

Wrong input types throw `TypeError`; values of the right type outside the
documented range throw `RangeError`. Validation completes before any raw draw.
Array inputs are copied before drawing. Weighted records have their values
and weights read once during validation, so later caller mutation or changing
getters cannot alter an accepted selection. These are shallow snapshots.
The same validation rule applies to deterministic shortcuts: bound-one sampling, a probability
of zero or one, a one-item pick, a weighted pick with exactly one positive
weight, and shuffling arrays of length zero or one consume no draws.

For `intBelow(n)`, the sampler rejects raw words below `2^64 mod n` and reduces
the remaining words modulo `n`. This removes modulo bias for a uniform raw-word
source; it is not evidence that TriFlow itself is uniform. There is no retry
limit, so every accepted result follows the rejection rule rather than a
biased fallback. A rejection consumes another raw word.

`float53()` consumes exactly one word. Other operations consume the number of
bounded draws their algorithm needs; rejection can add draws. A shuffle of
`n` items makes `n - 1` bounded draws before any rejection retries. These
consumption rules are part of the versioned helper contract and matter when
replaying a seeded sequence.

The helpers provide deterministic transformations, not entropy. They are
intended for the project's play-money examples only. Passing tests does not
establish unpredictability, statistical quality, cryptographic security, or
suitability for live gambling.
