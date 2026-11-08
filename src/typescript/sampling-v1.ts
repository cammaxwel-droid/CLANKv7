import { ENGINE_ID, type RawRng } from "./triflow-v1.js";

export const SAMPLING_ID = "clank-sampling-v1" as const;

const MAX_BOUND = 0x1_0000_0000;
const UINT64_RANGE = 1n << 64n;

export interface WeightedItem<T> {
    readonly value: T;
    readonly weight: number;
}

export interface Sampler {
    readonly samplingId: typeof SAMPLING_ID;
    intBelow(bound: number): number;
    intBetween(minInclusive: number, maxExclusive: number): number;
    float53(): number;
    chance(numerator: number, denominator: number): boolean;
    pick<T>(items: readonly T[]): T;
    pickWeighted<T>(items: readonly WeightedItem<T>[]): T;
    shuffle<T>(items: readonly T[]): T[];
}

function safeInteger(value: number, name: string): void {
    if (typeof value !== "number") {
        throw new TypeError(`${name} must be a number`);
    }
    if (!Number.isSafeInteger(value)) {
        throw new RangeError(`${name} must be a safe integer`);
    }
}

function positiveBound(value: number, name: string): bigint {
    safeInteger(value, name);
    if (value < 1 || value > MAX_BOUND) {
        throw new RangeError(`${name} must be between 1 and 2^32 inclusive`);
    }
    return BigInt(value);
}

/** Add versioned game-sampling helpers around an unchanged raw RNG. */
export function createSampler(rng: RawRng): Sampler {
    if (rng === null || typeof rng !== "object") {
        throw new TypeError("rng must be a triflow-v1 raw RNG");
    }
    if (rng.engineId !== ENGINE_ID || typeof rng.nextUint64 !== "function") {
        throw new TypeError("rng must be a triflow-v1 raw RNG");
    }

    function drawWord(): bigint {
        const word = rng.nextUint64();
        if (typeof word !== "bigint") {
            throw new TypeError("raw RNG must return a bigint");
        }
        if (word < 0n || word >= UINT64_RANGE) {
            throw new RangeError("raw RNG output must be an unsigned 64-bit word");
        }
        return word;
    }

    function intBelow(bound: number): number {
        const divisor = positiveBound(bound, "bound");
        if (divisor === 1n) return 0;

        const threshold = UINT64_RANGE % divisor;
        let word: bigint;
        do {
            word = drawWord();
        } while (word < threshold);
        return Number(word % divisor);
    }

    return Object.freeze({
        samplingId: SAMPLING_ID,
        intBelow,
        intBetween(minInclusive: number, maxExclusive: number): number {
            safeInteger(minInclusive, "minInclusive");
            safeInteger(maxExclusive, "maxExclusive");
            const width = BigInt(maxExclusive) - BigInt(minInclusive);
            if (width < 1n || width > BigInt(MAX_BOUND)) {
                throw new RangeError("interval width must be between 1 and 2^32 inclusive");
            }
            return minInclusive + intBelow(Number(width));
        },
        float53(): number {
            return Number(drawWord() >> 11n) / 0x20_0000_0000_0000;
        },
        chance(numerator: number, denominator: number): boolean {
            const divisor = positiveBound(denominator, "denominator");
            safeInteger(numerator, "numerator");
            if (numerator < 0 || BigInt(numerator) > divisor) {
                throw new RangeError("numerator must be between 0 and denominator inclusive");
            }
            if (numerator === 0) return false;
            if (BigInt(numerator) === divisor) return true;
            return intBelow(denominator) < numerator;
        },
        pick<T>(items: readonly T[]): T {
            if (!Array.isArray(items)) {
                throw new TypeError("items must be an array");
            }
            const values: readonly T[] = items.slice();
            if (values.length === 0) {
                throw new RangeError("cannot pick from an empty array");
            }
            if (values.length === 1) return values[0]!;
            return values[intBelow(values.length)]!;
        },
        pickWeighted<T>(items: readonly WeightedItem<T>[]): T {
            if (!Array.isArray(items)) {
                throw new TypeError("items must be an array");
            }
            if (items.length === 0) {
                throw new RangeError("cannot pick from an empty weighted array");
            }

            const entries: { readonly value: T; readonly weight: number }[] = [];
            let total = 0;
            let soleValue: T | undefined;
            let positiveCount = 0;
            for (const item of items) {
                if (item === null || typeof item !== "object") {
                    throw new TypeError("each weighted item must be an object");
                }
                safeInteger(item.weight, "weight");
                if (item.weight < 0) {
                    throw new RangeError("weight must not be negative");
                }
                total += item.weight;
                if (total > MAX_BOUND) {
                    throw new RangeError("total weight must not exceed 2^32");
                }
                entries.push({ value: item.value, weight: item.weight });
                if (item.weight > 0) {
                    soleValue = item.value;
                    ++positiveCount;
                }
            }
            if (total === 0) {
                throw new RangeError("total weight must be greater than zero");
            }
            if (positiveCount === 1) return soleValue!;

            let target = intBelow(total);
            for (const entry of entries) {
                if (target < entry.weight) return entry.value;
                target -= entry.weight;
            }
            throw new Error("weighted selection invariant failed");
        },
        shuffle<T>(items: readonly T[]): T[] {
            if (!Array.isArray(items)) {
                throw new TypeError("items must be an array");
            }
            const result = items.slice() as T[];
            for (let index = result.length - 1; index > 0; --index) {
                const other = intBelow(index + 1);
                [result[index], result[other]] = [result[other]!, result[index]!];
            }
            return result;
        }
    });
}
