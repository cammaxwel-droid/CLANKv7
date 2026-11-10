import { mix64, rotateLeft, uint64 } from "./arithmetic.js";
import type { RawRng } from "./triflow-v1.js";

export const NOVA_ENGINE_ID = "nova-v1" as const;

/** Deterministic alternative engine namespace for future independent evolution. */
export function createNovaRng(seed: bigint): RawRng<typeof NOVA_ENGINE_ID> {
    let laneX = uint64(seed ^ 0x4e4f56415f4c414en);
    let laneY = uint64(rotateLeft(seed ^ 0x4e4f56415f4c424en, 29n) + 0x9e3779b97f4a7c15n);
    let calls = 0n;

    return Object.freeze({
        engineId: NOVA_ENGINE_ID,
        nextUint64(): bigint {
            calls = uint64(calls + 1n);
            laneX = uint64(laneX + 0xd1b54a32d192ed03n);
            laneY = uint64((laneY ^ rotateLeft(laneX, 23n)) * 0x94d049bb133111ebn + calls);
            const braid = laneX ^ rotateLeft(laneY, 41n) ^ uint64(calls * 0xbf58476d1ce4e5b9n);
            const word = mix64(braid);
            laneX = uint64(laneX ^ rotateLeft(word, 17n));
            return word;
        }
    });
}
