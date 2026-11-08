# CLANK Bench

Open `examples/clank_bench.html` in a modern browser with JavaScript, BigInt
and structuredClone support. Everything runs locally. Keep the neighboring
scripts and stylesheet with the HTML file. This includes `seed_lab.js`,
`chain_seed.js`, `clank_bench_model.js` and `clank_bench.js`. No installation or server is needed.

On Windows, from this checkout:

```powershell
Invoke-Item .\examples\clank_bench.html
```

## Inspect a draw

Apply an unsigned 64-bit decimal seed or `0x` hexadecimal seed. Select original
TriFlow or Chain v2 preprocessing. Chain mode accepts a generation written as
exactly 16 lowercase hex digits without `0x`, and a stage mask from 0 through 7.
The original seed is preserved in the report alongside the effective seed.
The raw inspector
starts paused after 64 draws. Next draw advances once, +128 draws advances a
chunk, and Play stream reveals 16 draws at a time, capped at 30 updates per
second and 4,096 raw draws. Replay applied seed starts the same sequence again.
Edited settings only take effect when Apply seed succeeds. Invalid input pauses
work while preserving the current valid session.

The trace shows the latest actual raw draw. `nextTrace()` calls the original
`next()` exactly once, records the before/after state, and reconstructs the
intermediate values from the advanced lanes using the same private arithmetic.
The normal `next()` path adds no tracing or allocation. The frozen C++ engine,
TypeScript engine and saved output vectors are preserved.

The histogram covers all inspected words. Scatter uses overlapping adjacent
pairs from the most recent 256 words, scaled by high32 / 2^32. The bit raster
shows the latest 64 words, most significant bit at left. One-bit share counts
all output bits. Seed-flip difference compares matched draw positions against
another instance with one bit of the original seed toggled before applying
the same selected preprocessing. In Chain mode, both use identical generation
and stage settings. An average near 32
changed bits is an observation, not an established quality guarantee.

## Inspect reel mapping

The reel simulator has its own position in a copy of the same seeded stream.
It starts at draw one, independently of raw-inspector playback. These are two
positioned copies for diagnosis, not a claim of independent random streams.
Animation and report export consume no reel draws.

Each spin selects one of six stops for each reel, in reel order. The local
diagnostic adapter uses the same rejection arithmetic as the C++ example helper.
For bound 6, the threshold is 4. Values below 4 are discarded; accepted values
are reduced modulo 6. This avoids adding modulo bias when mapping a uniform
source. It does not establish TriFlow's uniformity.

The mapping table records each accepted word, threshold, rejected values and
stop/symbol. Rejection processing has no retry cutoff. To bound report memory,
only the first eight rejected words per reel are retained, with an explicit
count for any omitted values. Rejections will almost never occur naturally
in a sample this small. Deterministic tests exercise that path deliberately.

The reels and paytable match the approved research example in
[the roadmap](rng-kit-roadmap.md). Exhaustively enumerating 216 equally likely
stop combinations gives 180 losses, 27 AAA outcomes paying 4, eight BBB
outcomes paying 8, and one CCC outcome paying 32. Total gross payout is 204,
so theoretical gross return is 204/216 and hit frequency is 36/216 under
independent uniform stops.

The simulator measures hypothetical one-credit stakes, gross payout, net
payout, frequencies, and raw draw consumption. It maintains no wallet or
persisted game. Run 10,000 spins works in chunks of at most 128 spins per
animation update. Pause simulation stops the remaining work. Each session
is capped at 100,000 spins. Hidden tabs pause both activities. A change to
reduced-motion preference pauses active work; explicit playback is available.

The uncertainty panel derives payout variance from the exact enumeration,
then displays an approximate mean ±1.96 standard-error reference band for
the observed number of spins. That calculation assumes independent uniform
stops. Small-sample payouts are skewed, and the range is not a certification
threshold or a verified confidence interval for TriFlow.

## Export and replay

Export report downloads `clank-bench-report-v2` JSON with the engine ID,
canonical seed, flip bit, preprocessing mode, generation, mask and both effective
seeds,
raw counts and aggregates, latest lane trace, last 256 raw words, reel totals,
latest spin mapping, limits and exact theoretical counts. BigInts are written
as fixed-width hexadecimal text. The preprocessing generation is 16 lowercase
hex digits without `0x`, ready to paste into the generation input. Seed and
effective-seed display fields retain their accepted `0x` prefix. Exporting does not advance either stream.

Reports are diagnostic evidence, not the planned public RNG snapshot format.
There is no report-import or save-state-restore feature. To reproduce locally,
apply the recorded original seed, bit and preprocessing configuration, then
advance to the recorded counts. Version 1 reports predate Chain selection and
describe original TriFlow mode. Reloading
starts a fresh session. The page makes no network requests or persistent writes.

## Verification

```powershell
node --test .\tests\clank_bench_test.cjs .\tests\clank_bench_controller_test.cjs
```

Model tests cover golden outputs, exact lane tracing, paytable enumeration,
rejection thresholds, draw consumption, large bounds, retained-trace limits,
replay, invalid inputs, snapshot isolation and session caps. Controller tests
run the real page scripts against a small DOM/canvas/clock model. They cover
initialization, invalid settings, stepping, pauses, bounded batching, hidden
tabs, motion preferences, exact report export and finite drawing coordinates.
These tests do not verify actual browser rendering or keyboard focus.

This workbench is experimental research for play-credit simulations. It does
not establish suitability for cryptographic keys or real-money machines.
