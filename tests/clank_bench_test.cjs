"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const lab = require("../examples/seed_lab.js");
const bench = require("../examples/clank_bench_model.js");
const fixture = require("./fixtures/triflow-v1.json");
const MAX = (1n << 64n) - 1n;
const seed = 0x0123456789abcdefn;
const rotate = (word, bits) => BigInt.asUintN(64, (word << bits) | (word >> (64n - bits)));
function mix(word) {
    word ^= word >> 30n;
    word = BigInt.asUintN(64, word * 0xe6d7102b5c9a3f17n);
    word ^= word >> 27n;
    word = BigInt.asUintN(64, word * 0xb3e4f1d7a6c5928bn);
    return word ^ (word >> 31n);
}

test("tracing advances exactly once and preserves every original golden output", () => {
    for (const item of fixture.cases) {
        const rng = new lab.TriFlowRng(BigInt("0x" + item.seed_hex));
        const normal = new lab.TriFlowRng(BigInt("0x" + item.seed_hex));
        for (const expected of item.outputs_hex) {
            const trace = rng.nextTrace();
            assert.equal(trace.output, BigInt("0x" + expected));
            assert.equal(trace.output, normal.next());
            assert.equal(trace.after.calls, trace.before.calls + 1n);
            assert.equal(trace.after.a, BigInt.asUintN(64, trace.before.a + 0xe6d7102b5c9a3f17n));
            assert.equal(trace.after.b, BigInt.asUintN(64, trace.before.b + 0xb3e4f1d7a6c5928bn));
            assert.equal(trace.after.c, BigInt.asUintN(64, trace.before.c + 0xc8a35167d42e90f5n));
            assert.equal(trace.mixed.a, mix(trace.after.a ^ rotate(trace.after.c, 11n)));
            assert.equal(trace.mixed.b, mix(trace.after.b ^ rotate(trace.after.a, 27n)));
            assert.equal(trace.mixed.c, mix(trace.after.c ^ rotate(trace.after.b, 45n)));
            assert.equal(trace.mean, (trace.mixed.a + trace.mixed.b + trace.mixed.c) / 3n);
            assert.equal(trace.braid, trace.mixed.a ^ rotate(trace.mixed.b, 17n) ^ rotate(trace.mixed.c, 39n));
            assert.equal(trace.output, mix(trace.mean ^ trace.braid ^ trace.after.calls));
        }
        assert.equal(rng.next(), normal.next());
    }
});

test("the exact reel enumeration reproduces the approved 216-combination maths", () => {
    assert.deepEqual(bench.enumerate(), { combinations: 216, totalPayout: 204, paying: 36,
        payouts: { 0: 180, 4: 27, 8: 8, 32: 1 } });
    assert.equal(bench.payout(["A", "A", "B"]), 0);
    assert.equal(bench.payout(["C", "C", "C"]), 32);
});

test("rejection mapping records exact thresholds, words and consumption", () => {
    const words = [0n, 1n, 2n, 3n, 4n, MAX];
    let calls = 0;
    const source = { next() { return words[calls++]; } };
    const sample = bench.sampleBelow(source, 6n);
    assert.deepEqual(sample, { threshold: 4n, word: 4n, stop: 4n, rejected: 4,
        rejectedWords: [0n, 1n, 2n, 3n], omittedRejections: 0 });
    assert.equal(calls, 5);
    assert.equal(bench.sampleBelow(source, 6n).stop, MAX % 6n);
    assert.equal(calls, 6);
    for (const bound of [1n, 2n, 1n << 63n, 1n << 64n]) {
        assert.equal(bench.sampleBelow({ next: () => MAX }, bound).stop, MAX % bound);
    }
});

test("rejection trace storage is capped without truncating the sampling algorithm", () => {
    let calls = 0;
    const sample = bench.sampleBelow({ next: () => ++calls <= 20 ? 0n : 5n }, 6n);
    assert.equal(calls, 21);
    assert.equal(sample.rejected, 20);
    assert.equal(sample.rejectedWords.length, 8);
    assert.equal(sample.omittedRejections, 12);
    assert.equal(sample.stop, 5n);
});

test("invalid sampling input consumes no words and malformed sources fail", () => {
    let calls = 0;
    const source = { next() { ++calls; return 4n; } };
    for (const bound of [0n, -1n, (1n << 64n) + 1n, 6, "6", null]) {
        assert.throws(() => bench.sampleBelow(source, bound), RangeError);
    }
    assert.equal(calls, 0);
    for (const word of [-1n, 1n << 64n, 0, undefined]) {
        assert.throws(() => bench.sampleBelow({ next: () => word }, 6n), RangeError);
    }
});

test("raw inspection and seed-flip comparison preserve the original reel stream", () => {
    const first = bench.session(seed, 63);
    const second = bench.session(seed, 0);
    first.advance(512);
    first.spin(1000);
    for (let index = 0; index < 1000; ++index) second.spin();
    assert.deepEqual(first.snapshot().reels, second.snapshot().reels);
    const expected = new lab.TriFlowRng(seed);
    const last = first.snapshot().reels.last;
    let sample;
    for (let spin = 0; spin < 1000; ++spin) sample = [0, 1, 2].map(() => bench.sampleBelow(expected, 6n));
    assert.deepEqual(last.samples, sample);
    assert.equal(first.snapshot().reels.draws, 3000 + first.snapshot().reels.rejected);
});

test("chunked statistics and seed-flip measurements match an independent complete batch", () => {
    const experiment = bench.session(seed, 63);
    experiment.advance(1);
    experiment.advance(127);
    experiment.advance(128);
    const state = experiment.snapshot();
    const words = lab.generate(seed, 0, 256).values;
    const alternate = lab.generate(seed ^ (1n << 63n), 0, 256).values;
    const changes = words.reduce((sum, word, index) => sum +
        (word ^ alternate[index]).toString(2).replace(/0/g, "").length, 0);
    const summary = lab.summarize(words);
    assert.deepEqual(state.raw.tail, words);
    assert.deepEqual(state.raw.histogram, summary.histogram);
    assert.deepEqual(state.raw.bitCounts, summary.bitCounts);
    assert.equal(state.raw.meanChangedBits, changes / 256);
    assert.equal(state.raw.trace.output, words[255]);
});

test("replay is exact and exported snapshot mutation cannot change the session", () => {
    const first = bench.session(MAX, 31);
    const second = bench.session(MAX, 31);
    for (const experiment of [first, second]) { experiment.advance(128); experiment.spin(50); }
    assert.deepEqual(first.snapshot(), second.snapshot());
    const exported = first.snapshot();
    exported.raw.trace.after.a = 0n;
    exported.raw.tail[0] = 0n;
    exported.reels.last.samples[0].word = 0n;
    exported.reels.stops[0][0] = -1;
    assert.deepEqual(first.snapshot(), second.snapshot());
});

test("session limits bound retained data and invalid controls preserve state", () => {
    for (const bit of [-1, 64, 0.5, NaN, "0"]) assert.throws(() => bench.session(seed, bit), RangeError);
    const experiment = bench.session(seed);
    const before = experiment.snapshot();
    for (const count of [0, -1, 1.5, NaN, "1", Infinity]) {
        assert.throws(() => experiment.advance(count), RangeError);
        assert.throws(() => experiment.spin(count), RangeError);
    }
    assert.throws(() => experiment.advance(4097), RangeError);
    assert.throws(() => experiment.spin(1001), RangeError);
    assert.deepEqual(experiment.snapshot(), before);
    assert.equal(experiment.advance(4096), 4096);
    assert.equal(experiment.advance(1), 0);
    for (let chunk = 0; chunk < 100; ++chunk) assert.equal(experiment.spin(1000), 1000);
    assert.equal(experiment.spin(), 0);
    const state = experiment.snapshot();
    assert.equal(state.raw.count, 4096);
    assert.equal(state.raw.tail.length, 256);
    assert.equal(state.reels.spins, 100000);
    assert.equal(Object.values(state.reels.payouts).reduce((sum, count) => sum + count, 0), 100000);
    assert.equal(state.reels.payouts[4] * 4 + state.reels.payouts[8] * 8 + state.reels.payouts[32] * 32, state.reels.gross);
    for (const stops of state.reels.stops) assert.equal(stops.reduce((sum, count) => sum + count, 0), 100000);
});
