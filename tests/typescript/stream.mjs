// Conformance adapter, not the future binary statistics adapter.
import { createRng } from "../../dist/index.js";

try {
    const [seed, text, ...extra] = process.argv.slice(2);
    if (extra.length || typeof text !== "string" || text.length < 1 ||
        text.length > 7 || /[^0-9]/.test(text)) {
        throw new Error("Usage: stream.mjs <16 lowercase hex seed> <1..1000000 draws>");
    }
    const count = Number(text); // A bounded draw count, never seed/state/output.
    if (count < 1 || count > 1000000) {
        throw new Error("Draw count must be between 1 and 1000000");
    }
    const rng = createRng(seed);
    // Keep stdout small writes ordered; no promises or cosmetic random draws.
    for (let start = 0; start < count; start += 1024) {
        let chunk = "";
        for (let i = start; i < Math.min(start + 1024, count); ++i) {
            chunk += rng.nextUint64().toString(16).padStart(16, "0") + "\n";
        }
        process.stdout.write(chunk);
    }
} catch (error) {
    console.error(error.message);
    process.exitCode = 2;
}
