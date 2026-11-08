# Build and verification

The native source uses C++11 and the portable kit targets ES2020. Development
uses an installed C++ compiler, Python 3 and Node. The recorded unified-candidate
run uses GCC 14.2.0, Python 3.12.14 and Node 24.22.1 on Linux x64. Historical
Windows checks are recorded in the journals; this candidate still needs its
own Windows acceptance run.

## Windows

From the extracted source directory or checkout:

```powershell
.\scripts\verify.cmd
```

The wrapper discovers an existing Python launcher, `CLANK_PYTHON`, or Blender's
bundled Python. The driver discovers installed Microsoft C++ Build Tools through
`vswhere.exe` and prepares only its child process environment. GCC/Clang can be
selected explicitly with `--cxx`. A specific Visual Studio installation can be
chosen with `--vs-installation`.

To choose Python explicitly:

```powershell
$env:CLANK_PYTHON = 'C:\path\to\python.exe'
.\scripts\verify.cmd
```

## GCC or Clang

```sh
python3 -I -B scripts/verify.py --cxx g++
```

Native verification uses warnings as errors and optimization. GCC/Clang use
`-std=c++11`; MSVC uses its earliest explicit language mode, `/std:c++14`, with
`/W4 /WX /permissive- /O2`. These commands perform no tool installation or
machine-wide configuration changes.

## TypeScript and complete checks

```powershell
npm.cmd ci --ignore-scripts --no-audit --no-fund
npm.cmd test
npm.cmd run verify
```

Use `npm` outside Windows. The compiler and development type declarations are
pinned by `package-lock.json`. The built package has no runtime dependencies.
`npm test` builds JavaScript/declarations and runs TypeScript, backend and all
browser-model tests. Its native/browser parity test skips explicitly if no
native adapter is supplied. `npm run verify` builds that adapter and enables
the native parity comparison, then performs complete three-language conformance.

Additional driver arguments are forwarded without putting them in shell command
text. For example:

```sh
npm run verify -- --cxx g++
```

The direct Python driver also accepts `--javascript` to require Node. Without
that flag, a native-only machine can complete native verification; the report
explicitly records that JavaScript was not run. When Node is installed, the
browser-model tests run automatically even without the TypeScript flag.

## What is checked

- Original frozen header identity and all 28 original golden words.
- Native RNG, bounded example helpers, Chain and original seed-experiment tests.
- Compilation and execution of all four native demonstrations.
- Independent Python reference and verifier failure-evidence tests.
- 60,000 original native/Python word comparisons.
- Chain v2 native/Python fixtures, inversion and generation/replay checks.
- Browser models/controllers, including native parity on 36,864 words.
- With `--typescript`, strict public declarations, sampling and actual loopback
  backend tests, plus 870,000 words per engine across C++, Python and TypeScript.

The browser tests model DOM, Canvas and clocks. They do not establish real
browser layout, keyboard focus or native Windows behavior. HTTP backend tests
make real local requests and require a host permitting loopback sockets.

## Source archives and evidence

A downloaded source ZIP works without `.git`. The verifier hashes source files
and records that checkout metadata is unavailable. It never borrows the parent
folder's Git identity. A real checkout also records its HEAD and working state.

Every run creates a new `build/milestone-1/` or `build/milestone-2/` evidence
directory. Reports retain exact source hashes, command arguments, elapsed times,
exit statuses, stdout/stderr and every compiled binary's hash. Failures retain
partial evidence. Timeouts and launch failures have a null exit status with the
actual error. Golden fixtures are read-only during normal verification.

Chain fixture creation requires explicit `--write-fixture --cpp <adapter>`,
checks native/Python agreement first, and refuses to replace an existing file.
A Python-only run cannot manufacture accepted native evidence.

## Local package check

Run `npm.cmd pack` to create a local archive. The prepack step rebuilds dist,
so a clean checkout produces JavaScript and declarations. The package remains
private and `UNLICENSED`. No public npm publication is part of verification.
