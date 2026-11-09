(function (root) {
    "use strict";

    const lab = typeof module !== "undefined" && module.exports
        ? require("./seed_lab.js") : root.ClankSeedLab;
    const chain = typeof module !== "undefined" && module.exports
        ? require("./chain_seed.js") : root.ClankChainSeed;
    const RANGE = 1n << 64n;
    const MAX_RAW = 4096;
    const MAX_SPINS = 100000;
    const REELS = Object.freeze([
        Object.freeze(["A", "A", "A", "B", "B", "C"]),
        Object.freeze(["A", "B", "A", "C", "A", "B"]),
        Object.freeze(["C", "B", "A", "B", "A", "A"])
    ]);

    function payout(symbols) {
        if (symbols.length !== 3 || !symbols.every(symbol => symbol === symbols[0])) return 0;
        return { A: 4, B: 8, C: 32 }[symbols[0]] || 0;
    }

    function enumerate() {
        const payouts = { 0: 0, 4: 0, 8: 0, 32: 0 };
        let totalPayout = 0;
        for (const a of REELS[0]) {
            for (const b of REELS[1]) {
                for (const c of REELS[2]) {
                    const award = payout([a, b, c]);
                    payouts[award]++;
                    totalPayout += award;
                }
            }
        }
        return Object.freeze({ combinations: 216, totalPayout, paying: 216 - payouts[0],
            payouts: Object.freeze(payouts) });
    }

    // This local diagnostic adapter is not the planned versioned sampling kit.
    function sampleBelow(rng, bound) {
        if (typeof bound !== "bigint" || bound < 1n || bound > RANGE) {
            throw new RangeError("Bound must be a BigInt from 1 through 2^64.");
        }
        const threshold = (RANGE - bound) % bound;
        let rejected = 0;
        const rejectedWords = [];
        for (;;) {
            const word = rng.next();
            if (typeof word !== "bigint" || word < 0n || word >= RANGE) {
                throw new RangeError("The source must return unsigned 64-bit BigInt words.");
            }
            if (word >= threshold) {
                return { threshold, word, stop: word % bound, rejected,
                    rejectedWords, omittedRejections: rejected - rejectedWords.length };
            }
            ++rejected;
            // Limit trace memory, not the rejection algorithm.
            if (rejectedWords.length < 8) rejectedWords.push(word);
        }
    }

    function changedBits(word) {
        let count = 0;
        while (word !== 0n) {
            word &= word - 1n;
            ++count;
        }
        return count;
    }

    function session(seed, flipBit = 0, settings = {}) {
        lab.hex64(seed);
        if (settings === null || typeof settings !== "object" || Array.isArray(settings)) {
            throw new TypeError("Bench settings must be an object.");
        }
        if (!Number.isInteger(flipBit) || flipBit < 0 || flipBit > 63) {
            throw new RangeError("Choose a seed bit from 0 through 63.");
        }
        const mode = settings.mode === undefined ? "raw" : settings.mode;
        if (mode !== "raw" && mode !== chain.engineId) {
            throw new RangeError("Choose original TriFlow or chain-seed-v2 preprocessing.");
        }
        const generation = settings.generation === undefined ? 0n : settings.generation;
        const mask = settings.mask === undefined ? 0 : settings.mask;
        // Validate all supplied settings even when original mode bypasses them.
        const repairedSeed = chain.repair(seed, generation, mask);
        const effectiveSeed = mode === "raw" ? seed : repairedSeed;
        const flippedSeed = seed ^ (1n << BigInt(flipBit));
        const effectiveFlippedSeed = mode === "raw" ? flippedSeed : chain.repair(flippedSeed, generation, mask);
        const raw = new lab.TriFlowRng(effectiveSeed);
        const alternate = new lab.TriFlowRng(effectiveFlippedSeed);
        const reelRng = new lab.TriFlowRng(effectiveSeed);
        const words = [];
        const histogram = Array(32).fill(0);
        const bitCounts = Array(64).fill(0);
        const seen = new Set();
        let repeated = 0;
        let bitChanges = 0;
        let trace = null;
        const reels = { spins: 0, gross: 0, hits: 0, draws: 0, rejected: 0,
            payouts: { 0: 0, 4: 0, 8: 0, 32: 0 },
            stops: REELS.map(() => Array(6).fill(0)), last: null };

        function advance(count) {
            if (!Number.isInteger(count) || count < 1 || count > MAX_RAW) {
                throw new RangeError("Advance by 1 through 4096 words.");
            }
            const remaining = Math.min(count, MAX_RAW - words.length);
            const chunk = [];
            for (let index = 0; index < remaining; ++index) {
                let word;
                if (index === remaining - 1) {
                    trace = raw.nextTrace();
                    word = trace.output;
                } else {
                    word = raw.next();
                }
                chunk.push(word);
                bitChanges += changedBits(word ^ alternate.next());
                if (seen.has(word)) ++repeated;
                seen.add(word);
            }
            const summary = lab.summarize(chunk);
            summary.histogram.forEach((count, index) => { histogram[index] += count; });
            summary.bitCounts.forEach((count, index) => { bitCounts[index] += count; });
            words.push(...chunk);
            return remaining;
        }

        function spin(count = 1) {
            if (!Number.isInteger(count) || count < 1 || count > 1000) {
                throw new RangeError("Simulate 1 through 1000 spins per chunk.");
            }
            const remaining = Math.min(count, MAX_SPINS - reels.spins);
            for (let index = 0; index < remaining; ++index) {
                const samples = REELS.map(() => sampleBelow(reelRng, 6n));
                const symbols = samples.map((sample, reel) => REELS[reel][Number(sample.stop)]);
                const gross = payout(symbols);
                samples.forEach((sample, reel) => {
                    reels.stops[reel][Number(sample.stop)]++;
                    reels.draws += sample.rejected + 1;
                    reels.rejected += sample.rejected;
                });
                ++reels.spins;
                reels.gross += gross;
                reels.hits += Number(gross > 0);
                reels.payouts[gross]++;
                reels.last = { round: reels.spins, samples, symbols, gross };
            }
            return remaining;
        }

        function snapshot() {
            return structuredClone({
                format: "clank-bench-report-v2", engine: "triflow-v1",
                seed: lab.hex64(seed), flipBit, flippedSeed: lab.hex64(flippedSeed),
                preprocessing: { mode, generation: generation.toString(16).padStart(16, "0"), mask,
                    effectiveSeed: lab.hex64(effectiveSeed), effectiveFlippedSeed: lab.hex64(effectiveFlippedSeed) },
                raw: { count: words.length, histogram: histogram.slice(), bitCounts: bitCounts.slice(),
                    repeated, meanChangedBits: words.length ? bitChanges / words.length : null,
                    trace, tail: words.slice(-256) },
                reels: { ...reels, payouts: { ...reels.payouts }, stops: reels.stops.map(stops => stops.slice()) },
                theoretical: enumerate(),
                limits: { raw: MAX_RAW, spins: MAX_SPINS },
                note: "Diagnostic simulation with hypothetical one-credit stakes. Two separately positioned copies of the same seeded stream. No persistent game or RNG snapshot import. Statistical observations do not certify randomness."
            });
        }

        return Object.freeze({ advance, spin, snapshot });
    }

    const api = Object.freeze({ REELS, MAX_RAW, MAX_SPINS, payout, enumerate, sampleBelow, session });
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else root.ClankBench = api;
})(globalThis);
