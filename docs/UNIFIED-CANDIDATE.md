# Unified CLANK candidate

This review branch consolidates the useful work from the existing engine,
Chain, Bench and sampling/backend branches. Existing main and release tags
remain reference snapshots. The candidate preserves the frozen `triflow-v1`
header and both existing raw-vector fixtures byte for byte.

## Scope and changes

| Area | Candidate behavior |
| --- | --- |
| Native TriFlow | Frozen original recurrence and output sequence |
| Chain v2 | Correct reversible preprocessing, explicit unsigned half-word arithmetic, independent inverse evidence |
| Original seed experiments | Preserved, including the deliberately visible lossy Cross-feed |
| CLANK Bench | Raw or Chain mode, generation/stage selection, real draw traces, sampling/reel inspection and report export |
| TypeScript sampling | Versioned bounds, intervals, floats, chance, picks, weighted picks and shuffle |
| Optional backend | Authenticated loopback diagnostics and bounded raw-word requests |
| Verification | Source ZIP support, all native examples, browser/native parity, TypeScript/backend coverage and complete binary hashes |
| Local npm package | Build-before-pack and clean-consumer runtime/type checks |

Concrete defects corrected during this audit include:

- Extracted source archives failed verification when Git was installed but
  the source folder had no checkout metadata. The driver now hashes source
  archives without assuming a checkout or borrowing a parent repository's HEAD.
- The common verifier omitted original seed-experiment and visualizer suites,
  allowing browser parity checks to be skipped. It now builds the adapter and
  runs every browser model when Node is available.
- Chain binaries were omitted from evidence hashing. All eleven compiled native
  test/demo/adapter binaries now have recorded hashes.
- The npm verifier discarded extra command arguments. It forwards them as JSON
  data, keeping compiler paths out of shell command text on Windows.
- Mutable weighted-item getters could change values between validation and
  selection. The sampler snapshots accepted values and weights before drawing.
- Backend uploads and socket reuse needed tighter resource bounds. Limits cover
  bodies, output counts, open sockets, per-socket requests and timeouts.
- Pausing Bench could leave a pending resize callback. Stop/hidden-tab handling
  now cancels that work too.
- Chain preprocessing was absent from the visual workbench. A shared browser
  Chain module now matches all native fixture records and supports every stage
  combination without rounding seeds or generations.
- Chain fixture creation could write expected data before checking native
  agreement. Native agreement is now required before creating a new fixture.
- Two vector emitters could report success after an output-write failure. They
  now flush and check their output streams.

The sampling branch's deletions of existing workbenches and Chain assets were
not brought into the candidate. Historical journals and release notes are
retained as records of their own snapshots. Licensing remains undecided;
package metadata stays private and `UNLICENSED`.

## Reference branches and tags

These were the remote identities observed at the start of the audit.

| Ref | Commit | Meaning |
| --- | --- | --- |
| `main`, `Clankv7` | `9fe757f` | Original frozen main snapshot |
| `tag-chain-release` | `c7f2f36` | Earlier broken Chain repair snapshot |
| `2_step-hoe` | `ae94350` | Corrected Chain candidate |
| `chain-release` | `2cff82e` | Corrected Chain merged, plus an empty instruction placeholder |
| `codex/clank-bench` | `e440d8b` | Workbench and statistics improvements |
| `granule-spec-machine` | `b9ab570` | Sampling/backend additions and incompatible deletions |

The unified branch starts from Chain release history and incorporates Bench
history. Sampling/backend code is selectively restored and audited. This makes
the integrated source usable without merging anything into main.

## Verification evidence

The full entry point `npm run verify -- --cxx g++` passed on Linux x64 with
GCC 14.2.0, Python 3.12.14, Node 24.22.1, TypeScript 7.0.2 and the existing
locked development dependencies. It ran 47 recorded commands and covered:

- 65 Node tests with zero skips: 34 browser-model/controller tests, 23 raw
  engine/sampling tests and eight backend tests with real loopback requests.
- 16 Python tests, including changed-evidence, source-archive and command-
  forwarding regressions.
- Eleven native test/demo/adapter builds with warnings as errors.
- All 28 original golden words and 60,000 original native/Python comparisons.
- 870,000 words per engine across 87 seeds in C++, Python and TypeScript,
  including all 1,044 fixed checkpoints.
- 36,864 native/browser seed-experiment words across 576 profiles.
- Chain bidirectional round trips across 10,392 seed cases, generation/replay
  checks, and 64 native/Python/browser records with 512 downstream words.
- Native undefined-behavior sanitizer and failed-output-sink checks.
- A locally packed npm archive imported and type-checked by a fresh consumer.

Every verifier run writes its own report with command output and source/binary
hashes under `build/`. Those generated directories are deliberately excluded
from source archives and version control. The source archive is also checked
through the native/browser verifier without Git metadata.

## Remaining limits

Actual browser rendering and keyboard focus remain unverified. Chromium could
not launch in this execution environment. The controller/Canvas tests exercise
the real scripts against a simulated DOM and clock, which does not establish
visual acceptance. Windows acceptance also needs its own run on the user's
machine. Historical Windows evidence does not certify this combined candidate.

There is no cryptographic claim, true-random source or real-money gaming
certification. Established statistical suites, versioned persisted RNG state,
durable game settlement, independent review and public licensing remain
separate work on the roadmap.
