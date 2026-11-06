import { createRng, ENGINE_ID, type RawRng } from "@clankv7/rng";

const rng: RawRng = createRng("0123456789abcdef");
const word: bigint = rng.nextUint64();
const engine: "triflow-v1" = rng.engineId;
const constant: "triflow-v1" = ENGINE_ID;
const bounded: bigint = rng.intBelow(6n);
const interval: bigint = rng.intBetween(-2n, 5n);
const fraction: number = rng.float53();
const event: boolean = rng.chance(1n, 6n);
const chosen: string = rng.pickWeighted(["a", "b"], [2n, 1n]);
const shuffled: readonly string[] = rng.shuffle(["a", "b"]);
void [word, engine, constant, bounded, interval, fraction, event, chosen, shuffled];

// Full seeds and outputs must never be JavaScript numbers.
// @ts-expect-error Seed requires hexadecimal text.
createRng(1);
// @ts-expect-error BigInt seeds also need canonical text at the public boundary.
createRng(1n);
// @ts-expect-error A raw word cannot silently lose precision as a number.
const rounded: number = rng.nextUint64();
void rounded;
// @ts-expect-error Engine identity is readonly.
rng.engineId = "triflow-v1";
// @ts-expect-error Sampling bounds must remain exact integers.
rng.intBelow(6);
