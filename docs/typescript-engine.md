# TypeScript raw engine: milestone 2

The TypeScript port reproduces the frozen `triflow-v1` C++ stream. The public
entry point exports `createRng`, `ENGINE_ID`, `SAMPLING_ID`, and the `RawRng`
type. The helper identifier is `clank-sampling-v1`; its separate identity keeps
future sampling-contract changes distinguishable from the unchanged raw stream.

After `npm.cmd run build`, this example works from a module in this repository:

```js
import { createRng, ENGINE_ID } from "@clankv7/rng";

const rng = createRng("0123456789abcdef");
console.log(ENGINE_ID); // triflow-v1
console.log(rng.nextUint64().toString(16)); // ef50f516af9ed39
```

The raw word is a `bigint`. Formatting it as hexadecimal text is safe; passing
the full word through `Number()` would discard precision for many outputs.
Use `.padStart(16, "0")` on its hexadecimal text when saving a canonical word.

## Input and state contract

- Seeds must be strings of exactly 16 lowercase hexadecimal digits, with no
  `0x`, spaces, signs or trailing newline. Leading zeros are required.
- A non-string seed throws `TypeError`; noncanonical text throws `RangeError`.
  Objects are not coerced to strings. Invalid creation affects no other RNG.
- The first call returns draw 1, after advancing the three lanes and counter.
  A fresh instance with the same seed restarts the identical sequence.
- Each instance holds its own state in a closure. Drawing from one instance
  does not advance another. The draw function can be called after destructuring.
- `rng.engineId` is the literal `triflow-v1`; the returned API object is frozen.
  Identical seeds still mean identical streams, not independent randomness.

All complete seeds, lanes, counters and output words stay as `bigint`.
`BigInt.asUintN(64, value)` explicitly wraps additions and multiplications;
rotations discard bits outside the unsigned word. The three-value average
uses a wide sum before division. Its direct wide arithmetic agrees with
Python's integers and C++'s overflow-safe quotient/remainder calculation.
See the [frozen algorithm](triflow-v1.md) for every constant and operation.

## Build and check

From the repository root on Windows:

```powershell
npm.cmd ci --ignore-scripts --no-audit --no-fund
npm.cmd run verify
```

`npm.cmd test` builds and runs the Node unit and declaration tests without
requiring C++ or Python. `npm.cmd run verify` additionally runs the complete
C++/Python baseline and three-way conformance. It reuses the development-tool
discovery in [development](development.md) and writes `report.json` plus
`conformance.json` into a new `build/milestone-2/` directory.

The core is compiled with explicit `target: ES2020`, `lib: ["ES2020"]`, strict
checking, `NodeNext` module/resolution settings and declaration output. It has
no Node or DOM ambient types. This helps keep host APIs out of the engine.
The [official target reference](https://www.typescriptlang.org/tsconfig/#target)
explains target/lib, and the
[module reference](https://www.typescriptlang.org/tsconfig/#module) explains
the NodeNext/`package.json` `type` relationship. Here `type: module` produces
native ES modules, which the recorded Node checks load through the public
package entry point.

Development dependencies are pinned to TypeScript **7.0.2** and
`@types/node` **26.6.6**. The lockfile records official npm registry URLs and
SHA-512 archive integrity, including the compiler's platform package and
transitive development types. Installation used `--ignore-scripts`.
No dependency is required by the generated RNG at runtime.

## Conformance evidence

The original `tests/fixtures/triflow-v1.json` and every original C++ expected
output remain unchanged. The new `triflow-v1-checkpoints.json` adds an ordered
corpus of **87 unique seeds**:

- All six existing vector seeds, plus zero/maximum neighbours.
- Both alternating-bit patterns and all 64 single-bit seeds.
- Nine adjacent seeds around `0123456789abcdef`.
- Seeds around the initial lane-B addition's wrap boundary and a seed that
  initializes lane C to zero.

Some families overlap. For each unique seed, checkpoints are draws
`1, 2, 3, 4, 8, 16, 64, 137, 256, 1024, 4096, 10000`: **1,044 saved words**.
These new expected values were saved only after the unchanged C++ engine and
independent Python reference agreed on all 10,000 words per seed. TypeScript
was not used to calculate expected outputs. The one-time creation mode
refuses to overwrite existing files; ordinary verification only reads them.

Full verification compares every one of **870,000 raw words per engine**
between C++, Python and compiled TypeScript, not only the saved checkpoints.
Its report includes canonical text-stream SHA-256 fingerprints per seed.
Nine Node tests also cover the 28 original words, checkpoint agreement,
unsigned results, seed validation, instance isolation, immutable API,
64-bit wrapping/rotation and averages near maximum values. Compile-time
checks exercise the public declarations and reject numeric seeds and outputs.

## Sampling helpers: milestone 3

Each RNG instance also provides:

- `intBelow(bound)`: unbiased `bigint` in `[0, bound)` for bounds `1..2^32`,
  using rejection sampling. A bound of one returns zero without drawing.
- `intBetween(minInclusive, maxExclusive)`: unbiased `bigint` in the requested
  nonempty interval, at most `2^32` wide.
- `float53()`: a number in `[0, 1)` formed from the top 53 bits of one raw word.
- `chance(numerator, denominator)`: exact integer probability; zero and certain
  outcomes are shortcuts that consume no words.
- `pickWeighted(items, weights)`: select according to nonnegative `bigint`
  weights with a positive total no larger than `2^32`. A sole positive weight
  consumes no words.
- `shuffle(items)`: returns a Fisher-Yates shuffled copy, leaving its input
  unchanged; arrays of length zero or one consume no words.

Inputs are validated before deterministic shortcuts. Full-width quantities
remain `bigint`; the float is intentionally limited to the exact 53-bit
precision available in a JavaScript `number`. Rejection sampling has no retry
cutoff. These helpers make sampling behaviour reproducible, not unpredictable.

## Current limits

Observed acceptance is Windows AMD64 with Node **26.13.0**, Python **3.13.13**,
MSVC **19.51.36260.0**, and the pinned TypeScript compiler. Browser and Electron
acceptance remain later work; an ES2020 build alone does not establish them.

This prototype still wraps its counter like C++. Snapshots, direct
large-position restoration and the `2^64` exhaustion marker arrive in milestone
4. Host entropy, game persistence,
local archive acceptance, benchmarks and statistical suites are also pending.

Package metadata is provisional: `@clankv7/rng@0.1.0-experimental.1`, private.
The `UNLICENSED` npm marker grants no distribution licence; the owner's licence
and public namespace decisions remain open. No archive or public publication
is part of this milestone. These tests establish deterministic agreement,
not uniformity, security, true randomness or suitability for real-money use.
