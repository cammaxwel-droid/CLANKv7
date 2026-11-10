import { averageThree, mix64, rotateLeft, uint64 } from "./arithmetic.js";
import { createNovaRng, NOVA_ENGINE_ID } from "./nova-v1.js";

export const ENGINE_ID = "triflow-v1" as const;
export type EngineId = typeof ENGINE_ID | typeof NOVA_ENGINE_ID;

export interface CreateRngOptions {
    readonly engine?: EngineId;
}

export interface RawRng<E extends EngineId = EngineId> {
    readonly engineId: E;
    nextUint64(): bigint;
}

function parseSeedHex(seedHex: string): bigint {
    if (typeof seedHex !== "string") {
        throw new TypeError("seed must be a canonical 16-digit hexadecimal string");
    }
    if (seedHex.length !== 16 || !/^[0-9a-f]{16}$/.test(seedHex)) {
        throw new RangeError("seed must have exactly 16 lowercase hexadecimal digits without 0x");
    }
    return BigInt("0x" + seedHex);
}

function createTriflowRng(seed: bigint): RawRng<typeof ENGINE_ID> {
    let laneA = seed ^ 0x434c414e4b5f4131n;
    let laneB = rotateLeft(uint64(seed + 0x434c414e4b5f4232n), 21n);
    let laneC = rotateLeft(seed ^ 0x434c414e4b5f4333n, 43n);
    let calls = 0n;

    return Object.freeze({
        engineId: ENGINE_ID,
        nextUint64(): bigint {
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
    });
}

/** Reproduce the frozen C++ raw stream from a canonical 16-digit hex seed. */
export function createRng(seedHex: string): RawRng<typeof ENGINE_ID>;
export function createRng(seedHex: string, options: { readonly engine: typeof ENGINE_ID }): RawRng<typeof ENGINE_ID>;
export function createRng(seedHex: string, options: { readonly engine: typeof NOVA_ENGINE_ID }): RawRng<typeof NOVA_ENGINE_ID>;
export function createRng(seedHex: string, options: CreateRngOptions = {}): RawRng {
    if (options === null || typeof options !== "object") {
        throw new TypeError("options must be an object when provided");
    }
    const engine = options.engine ?? ENGINE_ID;
    const seed = parseSeedHex(seedHex);
    if (engine === ENGINE_ID) {
        return createTriflowRng(seed);
    }
    if (engine === NOVA_ENGINE_ID) {
        return createNovaRng(seed);
    }
    throw new RangeError(`unsupported engine '${String(engine)}'`);
}
