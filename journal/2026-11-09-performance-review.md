# Performance review and visualizer proposal

Reviewed main at `9fe757f502f795ccf30070e396fac6ea3fd3b7a8` for Cam's request
to understand CLANKv7, optimize code, and propose a pokie-oriented visualizer.

## How it works

TriFlow has three unsigned 64-bit lanes and a counter. A seed initializes all
four. Every draw adds fixed odd constants, rotates and mixes the lanes, takes
an overflow-safe average of three mixed words, braids rotated values together,
and mixes once more. The seed determines the complete sequence. The C++ engine
is the frozen reference; TypeScript and the browser model reproduce it.
The state repeats after 2^64 draws. This is not proof of the output's minimal
period or statistical quality. The current game helper uses rejection sampling
before taking a remainder to avoid introducing modulo bias into a uniform raw
stream. Raw-stream uniformity still needs assessment.

## Implemented optimization

Seed Lab statistics now extract two exact unsigned 32-bit halves per word,
then count their bits with ordinary unsigned shifts. Previously it extracted
eight bytes using BigInt operations. Full words remain BigInt.

On Linux x64, AMD EPYC 9V74, Node v24.22.1, the checked-in benchmark measured
median times of 38.749410 ms before and 25.022383 ms after for 65,536 words,
about 35.4% less time. Each median used seven samples of five summaries after
four warmups. Both checksums were 1360593. These are local statistics timings,
excluding generation and drawing. Windows/browser timings need measurement.

Validation passed:

- The full C++/Python baseline, including 28 pinned words and 60,000 exact
  cross-language comparisons, before the browser-only edit.
- All 16 Seed Lab/controller tests, including an added test isolating each of
  the 64 bit positions, with no skipped native parity test.
- C++ seed experiments, including native/browser parity on 36,864 outputs
  across 576 profiles.
- Exact before/after generated batches for six seeds and all eight masks,
  and 336 complete summary-object comparisons across seven prefix lengths.

The TypeScript suite was not run. Its source and dependencies were outside the
implemented change. Actual browser rendering was not tested in this review.

## Outstanding seed-wrapper defect

`invert_seed_experiment` does not implement an inverse of the complete
preprocessing pipeline. Its comment describes reverse-order inversion, while
the code applies stages in forward order. Cross-feed is many-to-one, so a
general inverse cannot recover the original seed from its output alone.

For Cross-feed alone, both seeds 0 and 18446744073709551615 produce 0 before
the supposed repair. At generation 0, `experimental_seed_repaired` returns
`a786b9158f3bfe8c` for both inputs. A native C++ reproduction confirmed this.
Applying a shared generation tail after the collision cannot restore the lost
distinction. This review records the defect for an explicitly versioned design
decision. The optimized statistics do not depend on these C++ wrapper helpers.

## Proposed visualizer: CLANK Bench

Extend the existing offline Seed Lab with a game diagnostics view. This is a
proposal, not an implemented feature.

- Show the seed, engine identifier, raw draw index, 64-bit output and the three
  lane transformations for a paused draw. Trace the engine's actual arithmetic.
- Retain the histogram, bit raster and adjacent-pair scatter. Add selectable
  output-bit frequencies and seed-bit-flip comparisons over matched draw ranges.
- Add a reel mapping panel that shows the raw draw, rejection threshold,
  discarded draws, accepted stop and symbol. Record all consumed draws.
- Use the approved three-reel play-credit example from the roadmap. Compare
  observed outcomes and payouts with its exact 216-combination enumeration.
  Its theoretical gross return under independent uniform stops is 204/216,
  about 94.44%, and hit frequency is 36/216, about 16.67%. Display measured
  TriFlow results separately, including sample size and uncertainty.
- Add replay/export after the versioned sampling and snapshot contracts exist.
  Gameplay and cosmetic animations need separately seeded instances.
- Keep generation in bounded chunks, optionally in a worker, with a fixed
  visible history and 30 fps maximum. Pausing or hiding the tab stops animation.
  This fits the existing dependency-free browser workflow and an 8 GB laptop.

The immediate useful extension is the raw-draw-to-reel-stop view. It makes
sampling and replay inspectable while reusing the existing Seed Lab.

For real-money deployment in NSW, the official technical-standards page says
new or modified gaming machines require testing by a licensed testing facility
before ILGA approval. This experimental project has no such assessment evidence.
Source: https://www.nsw.gov.au/business-and-economy/liquor-and-gaming/gaming/gaming-machines/tech-standards
