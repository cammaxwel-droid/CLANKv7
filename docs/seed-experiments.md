# Seed Lab: toggleable mathematical experiments

Open [the visualizer](../examples/seed_visualizer.html) in a modern browser
with JavaScript and BigInt support. It runs locally: no installation, server,
network requests, or external libraries. On Windows, from the repository root:

```powershell
Invoke-Item .\examples\seed_visualizer.html
```

## Try it in small steps

1. Leave every equation **off**. This is the original TriFlow sequence.
2. Turn on one equation. Follow the hexadecimal seed through the stages; the
   changed-bit count compares each stage's input with its output.
3. Compare the original and experimental plots. Try two or three equations;
   they always run in the order below, not the order you click them.
4. Replay or step through the fixed 4,096-output batch. The same seed and
   toggles reproduce exactly the same sequence. Animation changes only how
   quickly that fixed sequence is revealed.
5. Try seeds `0` and `0xffffffffffffffff` with only Cross-feed enabled: both
   become seed `0`. This is a real defect if distinct seed preservation matters,
   not a sign of extra randomness. It is intentionally exposed as an experiment.

Decimal seeds range from `0` through `18446744073709551615`; hexadecimal
seeds start with `0x` and have at most 16 digits. Seeds stay as exact 64-bit
integers; JavaScript's ordinary floating-point numbers cannot preserve all of
these values. Invalid input leaves the last valid plot intact.

## What the equations actually do

These are optional **seed preprocessors**, not extra entropy sources and not
changes to TriFlow's output algorithm. Each stage takes the previous stage's
seed as its input. Every addition and multiplication wraps modulo $2^{64}$:
keep the lowest 64 bits, like a clock rolling over at its limit.

Let $R(s,k)$ mean a 64-bit left rotation: bits leaving the left edge re-enter
at the right edge. XOR sets a bit when its inputs differ; OR 1 sets the bottom
bit, making an integer odd. Disabled stages simply pass their input through.

### 1. Quadratic bend

$$
s' = (s + 2s^2 + \mathtt{0x434c414e4b5f5131}) \bmod 2^{64}
$$

Squaring makes the arithmetic nonlinear; addition and multiplication produce
carries into higher bits. The fixed tag is just a constant, not secret data or
an entropy source. This step is a design experiment, not an established
improvement in output quality.

### 2. Rotate fold

$$
s' = s \oplus R(s,17) \oplus R(s,41)
$$

Two rotated views spread each bit into different positions. Despite looking
busy, this step is linear over bits and maps zero to zero. A scrambled picture
does not mean unpredictability.

### 3. Cross-feed

$$
s' = \bigl(s + R(s,23)\,(R(s,47)\mathbin{\mathrm{OR}}1)\bigr) \bmod 2^{64}
$$

A rotated view multiplies another rotated view before being added back. This
mapping is **lossy**: seeds `0` and `0xffffffffffffffff` both map to zero when
this stage is used alone. Any identical effective seeds yield identical output
streams. Keep this toggle off when seed collisions are unacceptable; no claim
is made that the other combinations have been exhaustively analyzed.

These formulas were assembled for this project; that does not certify global
originality. The default remains all-off, and the original generator is unchanged.

## Reading the pictures without fooling ourselves

- **Histogram:** 32 buckets from the top five bits. Counts fluctuate; perfectly
  flat is not the expected result of a small random sample.
- **Adjacent-pair scatter:** two consecutive outputs become a point. Lines or
  clumps may reveal structure, but absence of visible structure proves little.
- **Bit raster:** each row shows one complete output's 64 bits, most significant
  bit at the left. These are output bits, not internal generator state.
- **Mean and adjacent correlation:** plots use the top 32 bits divided by
  $2^{32}$, in $[0,1)$. Correlation uses consecutive pairs; it is unavailable
  with too few samples or zero variance.
- **One-bit share:** counts all 64 bits, not just the plotted top 32 bits.
- **Repeated outputs:** counts duplicates in the displayed prefix, not internal
  state cycles. Zero observed duplicates does not establish a long period.

More changed seed bits, a mean near 0.5, or a noisy-looking bitmap is not a
quality score. In particular, the known Cross-feed collision still produces
plausible-looking plots.

## Using the same equations in C++

The optional [seed header](../src/seed_experiments.hpp) is dependency-free
C++11. Apply it once, before constructing or reseeding TriFlow:

```cpp
#include "seed_experiments.hpp"
#include "triflow_rng.hpp"

clank::SeedExperiments options;
options.quadratic_bend = true;
options.rotate_fold = true;
// Leave the lossy Cross-feed experiment off.
const std::uint64_t seed = 0x0123456789ABCDEFULL;
clank::TriFlowRng rng(clank::experimental_seed(seed, options));
const std::uint64_t value = rng.next();
```

Add `src` to your compiler's include path. A default `SeedExperiments` has all
three fields false, so `experimental_seed(seed)` returns the original seed.
Existing users of `TriFlowRng` need no changes. To replay an experiment, record
both the seed and all three toggle settings.

The browser's [math model](../examples/seed_lab.js) mirrors the C++ unsigned
wraparound using BigInt. The test mask uses bits 1, 2, and 4 for the three
stages; all eight combinations are covered. Native/browser agreement is tested
on 36,864 outputs across 576 seed/settings profiles, including high-bit seeds.
See [test instructions](../tests/README.md) for repeating the checks. Automated
math/controller checks do not replace opening the local HTML file to verify
actual browser rendering, keyboard operation, and interactions.

This is a deterministic educational PRNG experiment. Equations cannot create
entropy and can discard seed distinctions. Statistical smoke tests and visual
inspection are not cryptographic evidence, proof of quality, or certification.
Do not use it for cryptographic keys, passwords, or real-money gambling.
