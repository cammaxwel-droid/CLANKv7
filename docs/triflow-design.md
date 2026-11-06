# TriFlow: first experimental design

TriFlow is a small, deterministic, three-lane PRNG prototype. It is our first
design to test the idea of several number flows contributing to one result.
It is a project experiment, not a claim of a proven or globally unique
algorithm.

## What one call does

1. A 64-bit seed initializes three lanes using different fixed tags.
2. Each call advances all three lanes by a different odd 64-bit step. Unsigned
   arithmetic wraps modulo 2^64, as defined by C++.
3. Each lane is mixed with a rotated view of a neighboring lane, producing
   three 64-bit observations.
4. The observations' exact integer average is calculated without overflowing:

   `floor((a + b + c) / 3) = a/3 + b/3 + c/3 + ((a%3 + b%3 + c%3)/3)`

5. That average is braided with rotated lane values and the call count, then
   mixed again to produce the returned 64-bit value.

The average is only one part of the final result. A plain average of random
values tends to cluster around the middle and is not, by itself, a good
uniform-random output method. The extra mixing is an experiment, not proof
that TriFlow is uniform or statistically strong.

## Optional seed experiments

The [visual seed lab](seed-experiments.md) applies toggleable integer equations
before the normal lane initialization. It does not modify TriFlow's recurrence
or its default seed behavior. The all-off path reproduces existing output
vectors; enabled paths are replayable using the seed and toggle settings.
Some experimental mappings have known seed collisions, so they must not be
mistaken for new entropy or automatic quality improvements.

## Reproducibility and limits

- The same 64-bit seed produces the same sequence on implementations with
  standard 64-bit unsigned integers.
- The internal lane state cycles after 2^64 calls; a long period alone does
  not establish good output quality.
- A seed does not add entropy. TriFlow does not read a clock or operating
  system random source.
- TriFlow is a deterministic PRNG, not a true-random source and not a
  cryptographic generator.
- Do not use this prototype for Bitcoin/private keys, passwords, live gambling,
  or any security-sensitive purpose.

The current tests cover fixed-seed repeatability, broad output-byte and
bit-balance smoke checks, adjacent low-bit transitions, and example bounded
sampling. They are small deterministic checks, not a statistical
certification. Multi-seed bias, runs, deeper correlation, and established
test-suite work remain future work.
