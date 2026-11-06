import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createRng, ENGINE_ID } from "@clankv7/rng";
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
    assert.deepEqual(Object.keys(rng).sort(), [
        "chance", "engineId", "float53", "intBelow", "intBetween", "nextUint64",
        "pickWeighted", "shuffle"
    ]);
    assert.equal(rng.engineId, "triflow-v1");
    assert.ok(Object.isFrozen(rng));
    assert.throws(() => { rng.engineId = "changed"; }, TypeError);
    assert.throws(() => { rng.nextUint64 = () => 0n; }, TypeError);
});

test("bounded integers validate first, stay in range, and skip deterministic draws", () => {
    const rng = createRng("0123456789abcdef");
    const replay = createRng("0123456789abcdef");
    assert.equal(rng.intBelow(1n), 0n);
    assert.equal(rng.intBetween(-9n, -8n), -9n);
    assert.equal(rng.nextUint64(), replay.nextUint64());
    for (const [min, max] of [[-10n, 0n], [0n, 1n << 32n]]) {
        const value = rng.intBetween(min, max);
        assert.ok(value >= min && value < max);
    }
    for (const bound of [0n, -1n, (1n << 32n) + 1n]) {
        assert.throws(() => rng.intBelow(bound), RangeError);
    }
    assert.throws(() => rng.intBelow(6), TypeError);
});

test("float, probability, weighted choice, and shuffle obey their contracts", () => {
    const rng = createRng("fedcba9876543210");
    const float = rng.float53();
    assert.ok(float >= 0 && float < 1);
    assert.equal(rng.chance(0n, 7n), false);
    assert.equal(rng.chance(9n, 9n), true);

    const noDraw = createRng("0123456789abcdef");
    const replay = createRng("0123456789abcdef");
    assert.equal(noDraw.chance(0n, 10n), false);
    assert.equal(noDraw.pickWeighted(["only"], [3n]), "only");
    assert.equal(noDraw.nextUint64(), replay.nextUint64());

    assert.throws(() => rng.chance(2n, 1n), RangeError);
    assert.throws(() => rng.pickWeighted(["a"], [0n]), RangeError);
    assert.throws(() => rng.pickWeighted(["a", "b"], [1n]), RangeError);
    const original = [1, 2, 3, 4, 5];
    const shuffled = rng.shuffle(original);
    assert.deepEqual([...shuffled].sort(), original);
    assert.deepEqual(original, [1, 2, 3, 4, 5]);
    assert.deepEqual(rng.shuffle([]), []);
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
