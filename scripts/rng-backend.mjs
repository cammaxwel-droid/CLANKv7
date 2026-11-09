import { createHash, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { createRng, ENGINE_ID } from "../dist/index.js";

const root = new URL("../", import.meta.url);
const MAX_BODY_BYTES = 4096;
const MAX_WORDS = 1024;
const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

export function runDiagnostics() {
    const fixture = JSON.parse(readFileSync(new URL("tests/fixtures/triflow-v1.json", root), "utf8"));
    const source = readFileSync(new URL("src/triflow_rng.hpp", root), "utf8");
    return evaluateDiagnostics(fixture, source);
}

export function evaluateDiagnostics(fixture, source) {
    if (fixture.engine !== ENGINE_ID || typeof fixture.source_sha256_lf !== "string" ||
        fixture.source_sha256_lf.length !== 64 ||
        !/^[0-9a-f]{64}$/.test(fixture.source_sha256_lf) ||
        !Array.isArray(fixture.cases) || fixture.cases.length === 0) {
        throw new Error("Invalid TriFlow fixture");
    }
    const actualHash = createHash("sha256").update(source.replace(/\r\n/g, "\n")).digest("hex");
    let wordsChecked = 0;
    let mismatch = null;
    for (const item of fixture.cases) {
        if (!Array.isArray(item.outputs_hex) || item.outputs_hex.length === 0 ||
            item.outputs_hex.some((word) => typeof word !== "string" || !/^[0-9a-f]{16}$/.test(word))) {
            throw new Error("Invalid TriFlow fixture outputs");
        }
        const rng = createRng(item.seed_hex);
        for (const [index, expected] of item.outputs_hex.entries()) {
            const actual = rng.nextUint64().toString(16).padStart(16, "0");
            wordsChecked++;
            if (actual !== expected && mismatch === null) {
                mismatch = { seed: item.seed_hex, draw: index + 1, expected, actual };
            }
        }
    }
    return {
        ok: actualHash === fixture.source_sha256_lf && mismatch === null,
        engine: ENGINE_ID,
        sourceHashMatches: actualHash === fixture.source_sha256_lf,
        wordsChecked,
        mismatch
    };
}

function respond(res, status, body) {
    const json = JSON.stringify(body);
    res.writeHead(status, {
        "content-type": "application/json; charset=utf-8",
        "content-length": Buffer.byteLength(json),
        "cache-control": "no-store",
        "x-content-type-options": "nosniff"
    });
    res.end(json);
}

function errorResponse(res, status, message) {
    respond(res, status, { error: message });
}

function rejectBody(req, res, status, message) {
    // Finish the error response before closing a potentially endless upload.
    res.setHeader("connection", "close");
    res.once("finish", () => req.destroy());
    errorResponse(res, status, message);
}

function authorize(req, token) {
    const value = req.headers.authorization;
    if (typeof value !== "string" || value.length !== 71 || !/^Bearer [0-9a-f]{64}$/.test(value)) return false;
    return timingSafeEqual(Buffer.from(value.slice(7), "hex"), Buffer.from(token, "hex"));
}

export function createBackend({ token }) {
    if (typeof token !== "string" || token.length !== 64 || !TOKEN_PATTERN.test(token)) {
        throw new Error("CLANK_API_TOKEN must be 64 lowercase hexadecimal characters from a secure random source");
    }
    const server = createServer((req, res) => {
        if (!/^127\.0\.0\.1(?::[0-9]{1,5})?$/.test(req.headers.host ?? "") ||
            req.headers.origin !== undefined || req.headers["sec-fetch-site"] !== undefined) {
            return errorResponse(res, 403, "Only non-browser requests to 127.0.0.1 are allowed");
        }
        if (!authorize(req, token)) return errorResponse(res, 401, "Unauthorized");
        if (req.method === "GET" && req.url === "/health") {
            return respond(res, 200, { ok: true, service: "clank-rng-backend", engine: ENGINE_ID });
        }
        if (req.method === "GET" && req.url === "/v1/diagnostics") {
            try {
                const result = runDiagnostics();
                return respond(res, result.ok ? 200 : 503, result);
            } catch (error) {
                console.error("RNG diagnostics failed:", error);
                return errorResponse(res, 500, "RNG diagnostics failed; see server logs");
            }
        }
        if (req.method !== "POST" || req.url !== "/v1/words") {
            return errorResponse(res, 404, "Unknown operation");
        }
        if (typeof req.headers["content-type"] !== "string" ||
            !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers["content-type"])) {
            return errorResponse(res, 415, "Content-Type must be application/json");
        }
        if (Number(req.headers["content-length"]) > MAX_BODY_BYTES) {
            return rejectBody(req, res, 413, "Request body is too large");
        }
        const chunks = [];
        let size = 0;
        let tooLarge = false;
        req.on("data", (chunk) => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                if (!tooLarge) rejectBody(req, res, 413, "Request body is too large");
                tooLarge = true;
                chunks.length = 0;
                return;
            }
            chunks.push(chunk);
        });
        req.on("end", () => {
            if (tooLarge) return;
            let input;
            try {
                input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            } catch (error) {
                if (!(error instanceof SyntaxError)) throw error;
                return errorResponse(res, 400, "Invalid JSON");
            }
            if (input === null || typeof input !== "object" || Array.isArray(input) ||
                Object.keys(input).some((key) => key !== "seed" && key !== "count") ||
                typeof input.seed !== "string" || input.seed.length !== 16 || !/^[0-9a-f]{16}$/.test(input.seed) ||
                !Number.isInteger(input.count) || input.count < 1 || input.count > MAX_WORDS) {
                return errorResponse(res, 400, "Provide seed as 16 lowercase hex digits and count from 1 to 1024");
            }
            try {
                const rng = createRng(input.seed);
                const words = Array.from({ length: input.count }, () =>
                    rng.nextUint64().toString(16).padStart(16, "0"));
                return respond(res, 200, { engine: ENGINE_ID, seed: input.seed, words });
            } catch (error) {
                console.error("RNG operation failed:", error);
                return errorResponse(res, 500, "RNG operation failed; see server logs");
            }
        });
        req.on("error", (error) => console.error("Request stream failed:", error.message));
    });
    server.requestTimeout = 10_000;
    server.headersTimeout = 10_000;
    server.timeout = 10_000;
    server.maxConnections = 64;
    server.maxRequestsPerSocket = 100;
    return server;
}

function main(args) {
    if (args.length === 1 && args[0] === "diagnostics") {
        const result = runDiagnostics();
        console.log(JSON.stringify(result, null, 2));
        if (!result.ok) process.exitCode = 1;
        return;
    }
    if (args[0] !== "serve" || args.length > 2 ||
        (args[1] !== undefined && !/^[0-9]{1,5}$/.test(args[1]))) {
        throw new Error("Usage: node scripts/rng-backend.mjs diagnostics | serve [port]");
    }
    const port = args[1] === undefined ? 8787 : Number(args[1]);
    if (port < 1 || port > 65535) throw new RangeError("Port must be from 1 to 65535");
    const server = createBackend({ token: process.env.CLANK_API_TOKEN });
    server.on("error", (error) => {
        console.error("Backend server error:", error.message);
        process.exitCode = 1;
    });
    server.listen(port, "127.0.0.1", () => {
        console.log(`CLANK RNG backend listening on http://127.0.0.1:${port}`);
    });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    try {
        main(process.argv.slice(2));
    } catch (error) {
        console.error("Backend startup failed:", error.message);
        process.exitCode = 1;
    }
}
