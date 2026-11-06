import { averageThree, mix64, rotateLeft, uint64 } from "./arithmetic.js";

export const ENGINE_ID = "triflow-v1" as const;
export const SAMPLING_ID = "clank-sampling-v1" as const;

export interface RawRng {
    readonly engineId: typeof ENGINE_ID;
    nextUint64(): bigint;
    intBelow(bound: bigint): bigint;
    intBetween(minInclusive: bigint, maxExclusive: bigint): bigint;
    float53(): number;
    chance(numerator: bigint, denominator: bigint): boolean;
    pickWeighted<T>(items: readonly T[], weights: readonly bigint[]): T;
    shuffle<T>(items: readonly T[]): T[];
}

/** Reproduce the frozen C++ raw stream from a canonical 16-digit hex seed. */
export function createRng(seedHex: string): RawRng {
    if (typeof seedHex !== "string") {
        throw new TypeError("seed must be a canonical 16-digit hexadecimal string");
    }
    if (seedHex.length !== 16 || !/^[0-9a-f]{16}$/.test(seedHex)) {
        throw new RangeError("seed must have exactly 16 lowercase hexadecimal digits without 0x");
    }

    const seed = BigInt("0x" + seedHex);
    let laneA = seed ^ 0x434c414e4b5f4131n;
    let laneB = rotateLeft(uint64(seed + 0x434c414e4b5f4232n), 21n);
    let laneC = rotateLeft(seed ^ 0x434c414e4b5f4333n, 43n);
    let calls = 0n;

    function nextUint64(): bigint {
        laneA = uint64(laneA + 0xe6d7102b5c9a3f17n);
        laneB = uint64(laneB + 0xb3e4f1d7a6c5928bn);
        laneC = uint64(laneC + 0xc8a35167d42e90f5n);
        calls = uint64(calls + 1n);

        const a = mix64(laneA ^ rotateLeft(laneC, 11n));
        const b = mix64(laneB ^ rotateLeft(laneA, 27n));
        const c = mix64(laneC ^ rotateLeft(laneB, 45n));
        const mean = averageThree(a, b, c);
        const braid = a ^ rotateLeft(b, 17n) ^ rotateLeft(c, 39n);
        return mix64(mean ^ braid ^ calls);
    }

    function intBelow(bound: bigint): bigint {
        const limit = 1n << 32n;
        if (typeof bound !== "bigint") throw new TypeError("bound must be a bigint");
        if (bound < 1n || bound > limit) throw new RangeError("bound must be in 1..2^32");
        if (bound === 1n) return 0n;
        const threshold = (1n << 64n) % bound;
        for (;;) {
            const word = nextUint64();
            if (word >= threshold) return word % bound;
        }
    }

    return Object.freeze({
        engineId: ENGINE_ID,
        nextUint64,
        intBelow,
        intBetween(minInclusive: bigint, maxExclusive: bigint): bigint {
            if (typeof minInclusive !== "bigint" || typeof maxExclusive !== "bigint") {
                throw new TypeError("interval endpoints must be bigints");
            }
            if (maxExclusive <= minInclusive || maxExclusive - minInclusive > (1n << 32n)) {
                throw new RangeError("interval must be nonempty and at most 2^32 wide");
            }
            return minInclusive + intBelow(maxExclusive - minInclusive);
        },
        float53(): number {
            return Number(nextUint64() >> 11n) / 9007199254740992;
        },
        chance(numerator: bigint, denominator: bigint): boolean {
            if (typeof numerator !== "bigint" || typeof denominator !== "bigint") {
                throw new TypeError("probability values must be bigints");
            }
            if (denominator < 1n || denominator > (1n << 32n)
                || numerator < 0n || numerator > denominator) {
                throw new RangeError("probability must satisfy 0 <= numerator <= denominator <= 2^32");
            }
            if (numerator === 0n) return false;
            if (numerator === denominator) return true;
            return intBelow(denominator) < numerator;
        },
        pickWeighted<T>(items: readonly T[], weights: readonly bigint[]): T {
            if (!Array.isArray(items) || !Array.isArray(weights)) {
                throw new TypeError("items and weights must be arrays");
            }
            if (items.length === 0 || items.length !== weights.length) {
                throw new RangeError("items and weights must have the same nonzero length");
            }
            let total = 0n;
            let onlyIndex = -1;
            for (let i = 0; i < weights.length; ++i) {
                const weight = weights[i];
                if (typeof weight !== "bigint") throw new TypeError("weights must be bigints");
                if (weight < 0n) throw new RangeError("weights cannot be negative");
                if (weight > 0n) onlyIndex = onlyIndex === -1 ? i : -2;
                total += weight;
                if (total > (1n << 32n)) throw new RangeError("total weight cannot exceed 2^32");
            }
            if (total === 0n) throw new RangeError("at least one weight must be positive");
            if (onlyIndex >= 0) return items[onlyIndex]!;
            let selected = intBelow(total);
            for (let i = 0; i < weights.length; ++i) {
                selected -= weights[i]!;
                if (selected < 0n) return items[i]!;
            }
            throw new Error("unreachable weighted selection state");
        },
        shuffle<T>(items: readonly T[]): T[] {
            if (!Array.isArray(items)) throw new TypeError("items must be an array");
            const result = items.slice();
            for (let i = result.length - 1; i > 0; --i) {
                const j = Number(intBelow(BigInt(i + 1)));
                [result[i], result[j]] = [result[j]!, result[i]!];
            }
            return result;
        }
    });
}
