(function (root) {
    "use strict";

    const MASK = (1n << 64n) - 1n;
    const wrap = value => value & MASK;
    const rotate = (value, bits) => wrap((value << bits) | (value >> (64n - bits)));
    const EXPERIMENTS = Object.freeze([
        Object.freeze({
            flag: 1,
            name: "Quadratic bend",
            formula: "s ← s + 2s² + 0x434c414e4b5f5131",
            description: "Square the seed, double it, and add a fixed tag. Carries move changes toward higher bits."
        }),
        Object.freeze({
            flag: 2,
            name: "Rotate fold",
            formula: "s ← s XOR R(s, 17) XOR R(s, 41)",
            description: "Turn two copies of the bits, then combine them with XOR. Bits wrap around, rather than falling off."
        }),
        Object.freeze({
            flag: 4,
            name: "Cross-feed",
            formula: "s ← s + R(s, 23) × (R(s, 47) OR 1)",
            description: "Feed a rotated product back into the seed. This is lossy: used alone, seeds 0 and 2⁶⁴−1 both become 0."
        })
    ]);

    function checkSeed(seed) {
        if (typeof seed !== "bigint" || seed < 0n || seed > MASK) {
            throw new RangeError("Seed must be an unsigned 64-bit BigInt.");
        }
        return seed;
    }

    function parseSeed(text) {
        const input = String(text).trim();
        if (!/^(?:[0-9]{1,20}|0x[0-9a-f]{1,16})$/i.test(input)) {
            throw new RangeError("Enter 0–18446744073709551615 in decimal, or 0x followed by 1–16 hex digits.");
        }
        return checkSeed(BigInt(input));
    }

    function hex64(value) {
        return "0x" + checkSeed(value).toString(16).padStart(16, "0");
    }

    function popcount(value) {
        let count = 0;
        while (value !== 0n) {
            value &= value - 1n;
            ++count;
        }
        return count;
    }

    function deriveSeed(seed, mask = 0) {
        checkSeed(seed);
        if (!Number.isInteger(mask) || mask < 0 || mask > 7) {
            throw new RangeError("Choose a seed experiment mask from 0 to 7.");
        }
        let value = seed;
        const stages = EXPERIMENTS.map(experiment => {
            const before = value;
            const enabled = (mask & experiment.flag) !== 0;
            if (enabled) {
                if (experiment.flag === 1) {
                    value = wrap(value + 2n * value * value + 0x434c414e4b5f5131n);
                } else if (experiment.flag === 2) {
                    value = value ^ rotate(value, 17n) ^ rotate(value, 41n);
                } else {
                    value = wrap(value + rotate(value, 23n) * (rotate(value, 47n) | 1n));
                }
            }
            return {
                name: experiment.name, formula: experiment.formula,
                enabled, before, after: value, bitChanges: popcount(before ^ value)
            };
        });
        return { effectiveSeed: value, stages };
    }

    function mix(value) {
        value ^= value >> 30n;
        value = wrap(value * 0xe6d7102b5c9a3f17n);
        value ^= value >> 27n;
        value = wrap(value * 0xb3e4f1d7a6c5928bn);
        return value ^ (value >> 31n);
    }

    class TriFlowRng {
        constructor(seed) {
            this.seed(seed);
        }

        seed(value) {
            checkSeed(value);
            this.a = value ^ 0x434c414e4b5f4131n;
            this.b = rotate(wrap(value + 0x434c414e4b5f4232n), 21n);
            this.c = rotate(value ^ 0x434c414e4b5f4333n, 43n);
            this.calls = 0n;
        }

        next() {
            this.a = wrap(this.a + 0xe6d7102b5c9a3f17n);
            this.b = wrap(this.b + 0xb3e4f1d7a6c5928bn);
            this.c = wrap(this.c + 0xc8a35167d42e90f5n);
            this.calls = wrap(this.calls + 1n);
            const a = mix(this.a ^ rotate(this.c, 11n));
            const b = mix(this.b ^ rotate(this.a, 27n));
            const c = mix(this.c ^ rotate(this.b, 45n));
            // BigInt holds the full sum, so this equals the C++ overflow-safe mean.
            const mean = (a + b + c) / 3n;
            const braid = a ^ rotate(b, 17n) ^ rotate(c, 39n);
            return mix(mean ^ braid ^ this.calls);
        }

        // Inspect a real draw without adding work to the normal next() path.
        nextTrace() {
            const before = { a: this.a, b: this.b, c: this.c, calls: this.calls };
            const output = this.next();
            const after = { a: this.a, b: this.b, c: this.c, calls: this.calls };
            const a = mix(this.a ^ rotate(this.c, 11n));
            const b = mix(this.b ^ rotate(this.a, 27n));
            const c = mix(this.c ^ rotate(this.b, 45n));
            return {
                before, after, mixed: { a, b, c },
                mean: (a + b + c) / 3n,
                braid: a ^ rotate(b, 17n) ^ rotate(c, 39n),
                output
            };
        }
    }

    const scale = value => Number(value >> 32n) / 4294967296;

    function generate(seed, mask = 0, count = 4096) {
        if (!Number.isInteger(count) || count < 0 || count > 65536) {
            throw new RangeError("Sample count must be an integer from 0 to 65536.");
        }
        const derived = deriveSeed(seed, mask);
        const rng = new TriFlowRng(derived.effectiveSeed);
        const values = Array.from({ length: count }, () => rng.next());
        return { seed, ...derived, values, scaled: values.map(scale) };
    }

    function summarize(values) {
        const count = values.length;
        const histogram = Array(32).fill(0);
        const bitCounts = Array(64).fill(0);
        let sum = 0;
        let ones = 0;
        let meanX = 0;
        let meanY = 0;
        let squareX = 0;
        let squareY = 0;
        let covariance = 0;
        let previous = 0;
        const seen = new Set();
        for (let index = 0; index < count; ++index) {
            const value = checkSeed(values[index]);
            const x = scale(value);
            histogram[Number(value >> 59n)]++;
            sum += x;
            seen.add(value);
            // Each 32-bit half is exactly representable as a Number; keep full words as BigInt.
            for (let offset = 0; offset < 64; offset += 32) {
                const half = Number((value >> BigInt(offset)) & 0xffffffffn);
                for (let bit = 0; bit < 32; ++bit) {
                    const on = (half >>> bit) & 1;
                    bitCounts[offset + bit] += on;
                    ones += on;
                }
            }
            if (index > 0) {
                const dx = previous - meanX;
                const dy = x - meanY;
                meanX += dx / index;
                meanY += dy / index;
                squareX += dx * (previous - meanX);
                squareY += dy * (x - meanY);
                covariance += dx * (x - meanY);
            }
            previous = x;
        }
        const denominator = Math.sqrt(squareX * squareY);
        return {
            count, histogram, bitCounts,
            mean: count ? sum / count : null,
            onesFraction: count ? ones / (count * 64) : null,
            correlation: count >= 3 && denominator > 0
                ? Math.max(-1, Math.min(1, covariance / denominator)) : null,
            repeatedValues: count - seen.size
        };
    }

    const api = Object.freeze({ EXPERIMENTS, parseSeed, hex64, deriveSeed, TriFlowRng, generate, summarize });
    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    } else {
        root.ClankSeedLab = api;
    }
})(globalThis);
