(function (root) {
    "use strict";

    const MASK = (1n << 64n) - 1n;
    const HALF_MASK = (1n << 32n) - 1n;
    const wrap = value => BigInt.asUintN(64, value);
    const rotate = (value, distance) => wrap((value << distance) | (value >> (64n - distance)));

    function checkWord(value) {
        if (typeof value !== "bigint" || value < 0n || value > MASK) {
            throw new RangeError("Chain seed and generation must be unsigned 64-bit BigInts.");
        }
    }

    function checkMask(mask) {
        if (!Number.isInteger(mask) || mask < 0 || mask > 7) {
            throw new RangeError("Choose a Chain stage mask from 0 through 7.");
        }
    }

    function parseGeneration(text) {
        if (typeof text !== "string" || text.length !== 16 || !/^[0-9a-f]{16}$/.test(text)) {
            throw new RangeError("Generation must have exactly 16 lowercase hexadecimal digits without 0x.");
        }
        return BigInt("0x" + text);
    }

    function halfMix(value, multiplier, distance) {
        const rotated = ((value << distance) | (value >> (32n - distance))) & HALF_MASK;
        return (value * multiplier + rotated) & HALF_MASK;
    }

    function crossFeed(value, inverse) {
        let left = value >> 32n;
        let right = value & HALF_MASK;
        if (inverse) {
            right ^= halfMix(left, 0xd42e90f5n, 13n);
            left ^= halfMix(right, 0xa6c5928bn, 7n);
        } else {
            left ^= halfMix(right, 0xa6c5928bn, 7n);
            right ^= halfMix(left, 0xd42e90f5n, 13n);
        }
        return (left << 32n) | right;
    }

    function prepare(seed, mask = 0) {
        checkWord(seed);
        checkMask(mask);
        if (mask & 1) seed = wrap(seed + 2n * seed * seed + 0x434c414e4b5f5131n);
        if (mask & 2) seed ^= rotate(seed, 17n) ^ rotate(seed, 41n);
        if (mask & 4) seed = crossFeed(seed, false);
        return seed;
    }

    function invert(seed, mask = 0) {
        checkWord(seed);
        checkMask(mask);
        if (mask & 4) seed = crossFeed(seed, true);
        if (mask & 2) {
            for (let power = 1n; power <= 4n; power <<= 1n) {
                seed ^= rotate(seed, (17n * power) % 64n) ^ rotate(seed, (41n * power) % 64n);
            }
        }
        if (mask & 1) {
            const target = wrap(seed - 0x434c414e4b5f5131n);
            let candidate = target;
            for (let round = 0; round < 32; ++round) candidate = wrap(target - 2n * candidate * candidate);
            seed = candidate;
        }
        return seed;
    }

    function generationTail(generation) {
        checkWord(generation);
        let value = 0x9e3779b97f4a7c15n ^ wrap(generation + 1n);
        value ^= rotate(value, 13n) ^ rotate(value, 37n);
        value ^= value >> 31n;
        value = wrap(value * 0xd1b54a35c8a8a0d1n);
        return value ^ (value >> 27n);
    }

    function repair(seed, generation, mask = 0) {
        let value = prepare(seed, mask) ^ generationTail(generation);
        value ^= rotate(value, 31n) ^ rotate(value, 17n);
        return value;
    }

    const api = Object.freeze({ engineId: "chain-seed-v2", parseGeneration, prepare, invert, repair });
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else root.ClankChainSeed = api;
})(globalThis);
