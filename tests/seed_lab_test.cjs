"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const lab = require("../examples/seed_lab.js");
const MAX = (1n << 64n) - 1n;
const SEED = 0x0123456789abcdefn;

test("seed input stays exact above JavaScript's Number precision", () => {
    for (const seed of [0n, 1n, SEED, 9007199254740993n, MAX]) {
        assert.equal(lab.parseSeed(seed.toString()), seed);
        assert.equal(lab.parseSeed(lab.hex64(seed)), seed);
    }
    assert.equal(lab.parseSeed(" 0XABCDEF "), 0xabcdefn);
    for (const bad of ["", " ", "-1", "+1", "1.5", "1e3", "0x", "0xgg", "NaN", "Infinity",
        "18446744073709551616", "0x10000000000000000", "5 6", "1".repeat(1000)]) {
        assert.throws(() => lab.parseSeed(bad), RangeError, bad);
    }
    assert.throws(() => lab.generate(Number(SEED)), RangeError);
});

test("JavaScript preserves the existing fixed TriFlow vector and reseeding", () => {
    const expected = [
        0x0ef50f516af9ed39n, 0x873896253787d290n, 0xde01cc510bdc225cn, 0xfc9dd86b363ff4d6n,
        0x8cc30e48e9d9dbcan, 0x9535f178c0b812d6n, 0x36f0f0a8c323d53bn, 0xca346ecdae6496b5n
    ];
    const rng = new lab.TriFlowRng(SEED);
    assert.deepEqual(expected.map(() => rng.next()), expected);
    rng.seed(SEED);
    assert.deepEqual(expected.map(() => rng.next()), expected);
    assert.deepEqual(lab.generate(SEED, 0, 8).values, expected);
});

test("all eight equation combinations match independent modular arithmetic vectors", () => {
    const expected = [SEED, 0xfdbb4ac6f6f06962n, 0xdc77883254ff00ban, 0x88e462dd52a01ff9n,
        0x88bdfbe23f6b01b9n, 0x37516352e034735fn, 0xa8d35be6aaa0cef6n, 0x06b5d9e06e389a7an];
    for (let mask = 0; mask < 8; ++mask) {
        const result = lab.deriveSeed(SEED, mask);
        assert.equal(result.effectiveSeed, expected[mask]);
        let before = SEED;
        result.stages.forEach((stage, index) => {
            assert.equal(stage.before, before);
            assert.equal(stage.enabled, Boolean(mask & (1 << index)));
            assert.equal(stage.bitChanges, (stage.before ^ stage.after).toString(2).replace(/0/g, "").length);
            if (!stage.enabled) assert.equal(stage.after, stage.before);
            before = stage.after;
        });
        assert.equal(before, expected[mask]);
        assert.deepEqual(lab.generate(SEED, mask, 128), lab.generate(SEED, mask, 128));
    }
    for (const mask of [-1, 8, 1.5, NaN]) assert.throws(() => lab.deriveSeed(SEED, mask), RangeError);
    assert.equal(lab.deriveSeed(0n, 4).effectiveSeed, lab.deriveSeed(MAX, 4).effectiveSeed);
    assert.equal(lab.deriveSeed(0n, 6).effectiveSeed, 0n);
});

test("plot measurements handle empty, constant, endpoint, and correlated samples", () => {
    const empty = lab.summarize([]);
    assert.equal(empty.count, 0);
    assert.equal(empty.mean, null);
    assert.equal(empty.onesFraction, null);
    assert.equal(empty.correlation, null);
    const constant = lab.summarize([MAX, MAX, MAX]);
    assert.equal(constant.correlation, null);
    assert.equal(constant.repeatedValues, 2);
    assert.equal(constant.onesFraction, 1);
    assert.ok(constant.mean < 1);
    assert.deepEqual(constant.bitCounts, Array(64).fill(3));
    const endpoints = lab.summarize([0n, MAX]);
    assert.equal(endpoints.histogram[0], 1);
    assert.equal(endpoints.histogram[31], 1);
    assert.equal(endpoints.onesFraction, 0.5);
    assert.equal(endpoints.correlation, null);
    assert.deepEqual(endpoints.bitCounts, Array(64).fill(1));
    assert.equal(lab.summarize([0n, 1n << 62n, 1n << 63n, 3n << 62n]).correlation, 1);
    assert.equal(lab.summarize([0n, MAX, 0n, MAX]).correlation, -1);
    assert.equal(lab.generate(0n, 0, 0).values.length, 0);
    for (const count of [-1, 65537, 1.5, Infinity]) assert.throws(() => lab.generate(0n, 0, count), RangeError);
});

test("statistics retain each bit across both unsigned 32-bit halves", () => {
    for (let bit = 0; bit < 64; ++bit) {
        const stats = lab.summarize([1n << BigInt(bit)]);
        assert.deepEqual(stats.bitCounts, Array.from({ length: 64 }, (_, index) => Number(index === bit)));
        assert.equal(stats.onesFraction, 1 / 64);
    }
});

test("fixed multi-seed smoke checks across all toggles (not certification)", () => {
    for (const seed of [0n, 1n, SEED, MAX, 0xaaaaaaaaaaaaaaaan, 9007199254740993n]) {
        for (let mask = 0; mask < 8; ++mask) {
            const batch = lab.generate(seed, mask, 4096);
            assert.ok(batch.scaled.every(value => value >= 0 && value < 1));
            const stats = lab.summarize(batch.values);
            const label = `${lab.hex64(seed)} / mask ${mask}`;
            assert.equal(stats.count, 4096);
            assert.equal(stats.histogram.reduce((a, b) => a + b, 0), 4096);
            assert.ok(stats.histogram.every(count => count >= 64 && count <= 208), label + " bins");
            assert.ok(stats.bitCounts.every(count => count >= 1720 && count <= 2376), label + " bits");
            assert.ok(Math.abs(stats.correlation) < 0.08, label + " correlation");
            assert.equal(stats.repeatedValues, 0, label + " repeated outputs");
        }
    }
});

test("native C++ and browser agree on 36,864 outputs across 576 profiles", {
    skip: !process.env.CLANK_VECTOR_EXE && "Set CLANK_VECTOR_EXE to the compiled seed_experiments_test executable."
}, () => {
    const result = spawnSync(path.resolve(process.env.CLANK_VECTOR_EXE), ["--vectors"], {
        encoding: "utf8", maxBuffer: 8 * 1024 * 1024
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    const lines = result.stdout.trim().split(/\r?\n/);
    assert.equal(lines.length, 576);
    for (const line of lines) {
        const [seed, mask, effective, ...expected] = line.trim().split(/\s+/);
        assert.equal(expected.length, 64);
        const actual = lab.generate(BigInt(seed), Number(mask), expected.length);
        assert.equal(actual.effectiveSeed, BigInt(effective), seed + " effective seed");
        assert.deepEqual(actual.values, expected.map(BigInt), `${seed} / mask ${mask}`);
    }
});
