import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createRng, createSampler, ENGINE_ID, SAMPLING_ID } from "@clankv7/rng";
import { averageThree, rotateLeft, uint64 } from "../../dist/arithmetic.js";

const load = (name) => JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8"));
const golden = load("triflow-v1.json");
const checkpoints = load("triflow-v1-checkpoints.json");
const hex = (word) => word.toString(16).padStart(16, "0");
const maximum = (1n << 64n) - 1n;

test("all 28 pre-existing golden words stay exact", () => {
    assert.equal(ENGINE_ID, "triflow-v1");
    assert.equal(golden.engine, ENGINE_ID);
    let words = 0;
    for (const item of golden.cases) {
        const rng = createRng(item.seed_hex);
        for (const [index, expected] of item.outputs_hex.entries()) {
            assert.equal(hex(rng.nextUint64()), expected, `seed ${item.seed_hex}, draw ${index + 1}`);
            ++words;
        }
    }
    assert.equal(words, 28);
});

test("saved checkpoints agree across the defined seed corpus", () => {
    assert.equal(checkpoints.engine, ENGINE_ID);
    for (const item of checkpoints.cases) {
        const rng = createRng(item.seed_hex);
        for (let draw = 1; draw <= checkpoints.draws_per_seed; ++draw) {
            const word = rng.nextUint64();
            const expected = item.outputs_hex[String(draw)];
            if (expected !== undefined) {
                assert.equal(hex(word), expected, `seed ${item.seed_hex}, draw ${draw}`);
            }
        }
    }
});

test("raw outputs remain unsigned 64-bit bigints", () => {
    const rng = createRng("ffffffffffffffff");
    for (let draw = 0; draw < 10000; ++draw) {
        const word = rng.nextUint64();
        assert.equal(typeof word, "bigint");
        assert.ok(word >= 0n && word <= maximum);
    }
});

test("seed types are checked without coercing objects or rounding numbers", () => {
    let coerced = false;
    const object = { toString() { coerced = true; return "0000000000000000"; } };
    for (const seed of [0, 1, Number.MAX_SAFE_INTEGER, 0n, null, undefined, true,
                        [], object, Symbol("seed"), new String("0000000000000000")]) {
        assert.throws(() => createRng(seed), TypeError);
    }
    assert.equal(coerced, false);
});

test("only canonical lowercase 16-digit hexadecimal seeds are accepted", () => {
    for (const seed of ["", "0", "0123456789abcde", "00123456789abcdef",
                        "0123456789ABCDEF", "0x0123456789abcdef", "-123456789abcdef",
                        "g123456789abcdef", " 0000000000000000", "0000000000000000 ",
                        "0000000000000000\n", "0000000000000000\r", "0000000000000000\r\n",
                        "000000000000000\u0000", "００００００００００００００００"]) {
        assert.throws(() => createRng(seed), RangeError, JSON.stringify(seed));
    }
    for (const seed of ["0000000000000000", "ffffffffffffffff", "8000000000000000"]) {
        assert.equal(typeof createRng(seed).nextUint64(), "bigint");
    }
});

test("instances and detached draw functions retain their own stream positions", () => {
    const first = createRng("0123456789abcdef");
    const replay = createRng("0123456789abcdef");
    const unrelated = createRng("ffffffffffffffff");
    const { nextUint64 } = first;
    for (let draw = 0; draw < 10000; ++draw) {
        if (draw % 3 === 0) unrelated.nextUint64();
        assert.throws(() => createRng("bad seed"), RangeError);
        assert.equal(nextUint64(), replay.nextUint64());
    }
});

test("public identity and methods cannot be replaced", () => {
    const rng = createRng("0000000000000000");
    assert.deepEqual(Object.keys(rng).sort(), ["engineId", "nextUint64"]);
    assert.equal(rng.engineId, "triflow-v1");
    assert.ok(Object.isFrozen(rng));
    assert.throws(() => { rng.engineId = "changed"; }, TypeError);
    assert.throws(() => { rng.nextUint64 = () => 0n; }, TypeError);
});

test("unsigned wrapping and rotations preserve bits at the 64-bit boundaries", () => {
    assert.equal(uint64(1n << 64n), 0n);
    assert.equal(uint64(-1n), maximum);
    assert.equal(uint64(maximum + 2n), 1n);
    assert.equal(rotateLeft(1n, 63n), 1n << 63n);
    assert.equal(rotateLeft(1n << 63n, 1n), 1n);
    assert.equal(rotateLeft(maximum, 17n), maximum);
});

test("the three-value average uses a wide sum near numerical limits", () => {
    assert.equal(averageThree(maximum, maximum, maximum), maximum);
    assert.equal(averageThree(maximum, maximum, 0n), 12297829382473034410n);
    assert.equal(averageThree(maximum, 0n, 0n), 6148914691236517205n);
    assert.equal(averageThree(0n, 1n, 1n), 0n);
    assert.equal(averageThree(0n, 1n, 2n), 1n);
});

function source(...words) {
    let calls = 0;
    return {
        rng: {
            engineId: ENGINE_ID,
            nextUint64() {
                if (calls >= words.length) throw new Error("test source exhausted");
                return words[calls++];
            }
        },
        get calls() { return calls; }
    };
}

test("bounded integers reject the biased low tail and skip the bound-one draw", () => {
    const raw = source(0n, 8n, maximum);
    const sampler = createSampler(raw.rng);
    assert.equal(sampler.samplingId, SAMPLING_ID);
    assert.equal(sampler.intBelow(1), 0);
    assert.equal(raw.calls, 0);
    assert.equal(sampler.intBelow(3), 2);
    assert.equal(raw.calls, 2);
    assert.equal(sampler.intBelow(0x1_0000_0000), 0xffff_ffff);
    assert.equal(raw.calls, 3);
});

test("bounded integer validation consumes no draws", () => {
    const raw = source();
    const sampler = createSampler(raw.rng);
    for (const bound of [0, -1, 1.5, Number.MAX_SAFE_INTEGER, Infinity, NaN, "2", 2n]) {
        assert.throws(() => sampler.intBelow(bound), bound === "2" || bound === 2n
            ? TypeError : RangeError);
    }
    assert.equal(raw.calls, 0);
});

test("intervals are inclusive at the start, exclusive at the end, and support negatives", () => {
    const raw = source(3n, 2n);
    const sampler = createSampler(raw.rng);
    assert.equal(sampler.intBetween(-8, -5), -8);
    assert.equal(sampler.intBetween(10, 13), 12);
    assert.equal(raw.calls, 2);
    for (const interval of [[1, 1], [2, 1], [0, 0x1_0000_0001], [1.5, 3], [0, Infinity]]) {
        assert.throws(() => sampler.intBetween(...interval), RangeError);
    }
    assert.equal(raw.calls, 2);
});

test("float53 uses one draw and stays in the half-open unit interval", () => {
    const raw = source(0n, maximum);
    const sampler = createSampler(raw.rng);
    assert.equal(sampler.float53(), 0);
    assert.equal(sampler.float53(), 1 - 2 ** -53);
    assert.equal(raw.calls, 2);
});

test("integer probabilities validate first and avoid draws for certainty", () => {
    const raw = source(3n, 0n);
    const sampler = createSampler(raw.rng);
    assert.equal(sampler.chance(0, 4), false);
    assert.equal(sampler.chance(4, 4), true);
    assert.equal(raw.calls, 0);
    assert.equal(sampler.chance(1, 2), false);
    assert.equal(sampler.chance(1, 2), true);
    assert.equal(raw.calls, 2);
    for (const probability of [[-1, 2], [3, 2], [1, 0], [1.1, 2], [1, 1.5]]) {
        assert.throws(() => sampler.chance(...probability), RangeError);
    }
    assert.equal(raw.calls, 2);
});

test("pick validates and snapshots inputs before drawing", () => {
    const raw = source(5n);
    const sampler = createSampler(raw.rng);
    assert.equal(sampler.pick(["only"]), "only");
    assert.equal(raw.calls, 0);
    assert.equal(sampler.pick(["a", "b", "c"]), "c");
    assert.equal(raw.calls, 1);
    assert.throws(() => sampler.pick([]), RangeError);
    assert.throws(() => sampler.pick("not an array"), TypeError);
    assert.equal(raw.calls, 1);
});

test("weighted picks validate every weight, handle zero entries, and skip deterministic draws", () => {
    const raw = source(4n);
    const sampler = createSampler(raw.rng);
    assert.equal(sampler.pickWeighted([{ value: "zero", weight: 0 }, { value: "only", weight: 8 }]), "only");
    assert.equal(raw.calls, 0);
    assert.equal(sampler.pickWeighted([
        { value: "first", weight: 2 },
        { value: "middle", weight: 0 },
        { value: "last", weight: 3 }
    ]), "last");
    assert.equal(raw.calls, 1);
    const invalid = [
        [],
        [{ value: "negative", weight: -1 }],
        [{ value: "fraction", weight: 0.5 }],
        [{ value: "large", weight: 0x1_0000_0001 }],
        [{ value: "too much", weight: 0x1_0000_0000 }, { value: "more", weight: 1 }],
        [{ value: "zero", weight: 0 }]
    ];
    for (const weights of invalid) assert.throws(() => sampler.pickWeighted(weights), RangeError);
    assert.throws(() => sampler.pickWeighted([null]), TypeError);
    assert.equal(raw.calls, 1);
});

test("shuffle uses Fisher-Yates on a copy and skips zero/one-item draws", () => {
    const raw = source(2n, 0n);
    const sampler = createSampler(raw.rng);
    const original = ["a", "b", "c"];
    assert.deepEqual(sampler.shuffle([]), []);
    assert.deepEqual(sampler.shuffle(["one"]), ["one"]);
    assert.equal(raw.calls, 0);
    assert.deepEqual(sampler.shuffle(original), ["b", "a", "c"]);
    assert.deepEqual(original, ["a", "b", "c"]);
    assert.equal(raw.calls, 2);
    assert.throws(() => sampler.shuffle(null), TypeError);
    assert.equal(raw.calls, 2);
});

test("sampler requires the versioned raw engine and validates raw words", () => {
    assert.throws(() => createSampler(null), TypeError);
    assert.throws(() => createSampler({ engineId: "other", nextUint64() { return 0n; } }), TypeError);
    for (const word of [-1n, 1n << 64n, "0"]) {
        const sampler = createSampler({ engineId: ENGINE_ID, nextUint64() { return word; } });
        assert.throws(() => sampler.intBelow(2), typeof word === "string" ? TypeError : RangeError);
    }
});
