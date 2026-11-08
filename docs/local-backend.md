# Local RNG backend and diagnostics

This development-only backend exposes a small allowlist of RNG operations over
HTTP on `127.0.0.1`. It never accepts commands, script paths or code from a
request. It is not part of the portable RNG core or the published package.
The API uses JSON, so a separate local tool or MCP adapter can call it; this
project does not yet implement an MCP server or protocol.

## Start it

First install the pinned development tools and build the engine:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build
```

In a Unix shell, generate a fresh token with the operating system's
cryptographic random source and start the backend:

```sh
export CLANK_API_TOKEN="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))")"
npm run backend -- serve
```

On Windows PowerShell:

```powershell
$env:CLANK_API_TOKEN = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
npm.cmd run backend -- serve
```

The token is required and must be 64 lowercase hexadecimal characters. Never
use TriFlow to generate it. Keep it private, and restart the backend with a
new token if it may have leaked. Another local process running as the same
user may be able to access the environment; this is not protection against
an already-compromised account.

The default port is 8787; pass a port as `npm run backend -- serve 8788`.
The server always binds IPv4 loopback. Stop it with Ctrl+C. Do not expose it
through a proxy, port forwarding or a public network.

## Operations

Send `Authorization: Bearer <token>` with each request to
`http://127.0.0.1:8787`. Browser-origin requests and non-loopback Host headers
are rejected. There are no CORS headers. JSON responses are not cached.

| Method and path | Purpose |
|---|---|
| `GET /health` | Reports that the service is responding; it does not run diagnostics. |
| `GET /v1/diagnostics` | Checks the frozen C++ source hash and 28 TypeScript golden outputs. Returns HTTP 503 on a mismatch and 500 on a diagnostic error. |
| `POST /v1/words` | Accepts `{"seed":"0123456789abcdef","count":2}` with `Content-Type: application/json`. Returns the seed, engine ID and 16-digit lowercase hexadecimal words. Count must be 1 through 1024. Each request starts a fresh seeded stream. |

Requests are limited to 4096 body bytes. Unsupported operations and additional
word-request fields are rejected. The backend does not execute test scripts
over HTTP; use the CLI for local diagnostics and the existing full test suite:

For example, with the server running and the same token in your shell:

```sh
node --input-type=module <<'NODE'
const response = await fetch("http://127.0.0.1:8787/v1/words", {
  method: "POST",
  headers: {
    authorization: `Bearer ${process.env.CLANK_API_TOKEN}`,
    "content-type": "application/json"
  },
  body: JSON.stringify({ seed: "0123456789abcdef", count: 2 })
});
console.log(response.status, await response.json());
NODE
```

```sh
npm run backend -- diagnostics
npm test
npm run verify
```

CLI diagnostics exit nonzero on a mismatch or error. `npm test` includes the
backend tests; `npm run verify` runs the existing full cross-language verifier.

## What this does and does not protect

Loopback binding, a secret token, strict routes and size limits reduce the
exposed surface. They are **not a system firewall**, intrusion detector,
security audit or proof that the service has no vulnerabilities. Keep the
operating system and Node updated, use an appropriate host firewall and do not
give the token to untrusted processes.

Diagnostics check known fixtures and a source hash only when requested. They
cannot find every incorrect equation, statistical weakness, malicious change
or security hole. The fixture is stored locally, so an attacker who can edit
both source and fixtures may evade these checks. They report failures; they do not automatically repair,
restart, rewrite, or execute modified source code. TriFlow remains an
experimental deterministic PRNG, not a cryptographic or real-money generator.
