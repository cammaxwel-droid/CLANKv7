import {
    createRng, createSampler, ENGINE_ID, SAMPLING_ID, type RawRng, type Sampler
} from "@clankv7/rng";

const rng: RawRng = createRng("0123456789abcdef");
const word: bigint = rng.nextUint64();
const engine: "triflow-v1" = rng.engineId;
const constant: "triflow-v1" = ENGINE_ID;
const sampler: Sampler = createSampler(rng);
const sampling: "clank-sampling-v1" = sampler.samplingId;
const roll: number = sampler.intBelow(6);
void [word, engine, constant, sampling, roll, SAMPLING_ID];

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
// @ts-expect-error Sampling helpers are a separately versioned wrapper.
rng.intBelow(6);
// @ts-expect-error Sampling bounds are numbers, not bigint words.
sampler.intBelow(6n);
