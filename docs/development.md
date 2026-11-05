# Reproducing the milestone 1 baseline

The checks use a C++ compiler and Python 3's standard library. Nothing is
downloaded or installed by the scripts. Generated files go into a new
`build/milestone-1/<UTC timestamp>-<process id>/` directory on every run.
Existing run directories and source files are never overwritten.

## Windows

From the repository root, in PowerShell or Command Prompt:

```powershell
.\scripts\verify.cmd
```

This avoids the blocked PowerShell npm shim and requires no execution-policy
change. The wrapper first uses `CLANK_PYTHON` if set, then an installed Python
3 launcher, then CPython bundled with an installed Blender. To choose that
known interpreter explicitly in PowerShell:

```powershell
$env:CLANK_PYTHON = 'C:\Program Files\Blender Foundation\Blender 5.2\5.2\python\bin\python.exe'
.\scripts\verify.cmd
```

The Python driver discovers Microsoft C++ Build Tools through its installed
`vswhere.exe` and loads `vcvars64.bat` only into its child build environment.
It does not edit the system PATH or open any application window. A specific
installed MSVC toolchain can be selected with:

```powershell
.\scripts\verify.cmd --vs-installation 'C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools'
```

MSVC is invoked with `/std:c++14 /EHsc /W4 /WX /permissive- /O2`.
MSVC's earliest explicit language switch is C++14; the unchanged source uses
C++11 features. GCC/Clang builds request actual C++11 with warnings as errors.

## GCC or Clang

```sh
python3 -I -B scripts/verify.py --cxx g++
# Or: python3 -I -B scripts/verify.py --cxx clang++
```

These commands are provided for repeatability. Current platform acceptance
is limited to the Windows toolchains actually recorded in the journal;
unrun platforms are not certified by these instructions.

## What verify does

1. Records HEAD, working-tree status, source file hashes, interpreter and
   compiler identity, platform and command output in `report.json`.
2. Builds/runs the unchanged generator regression, example-helper edge and
   six-way sampling suites, the fixed-seed statistical smoke suite, and the
   fixed-seed demo. This includes the existing checks integrated from main.
3. Builds `tests/triflow_stream.cpp`, a text adapter over the existing engine.
4. Runs six Python reference tests, including deliberately changed vectors,
   changed source, malformed fixtures and incomplete/incorrect stream data,
   plus four driver tests covering timeout, launch-failure and nonzero-exit
   evidence.
5. Checks the frozen header hash and all 28 pre-existing golden outputs.
6. Compares 10,000 consecutive words per seed for all six fixture seeds:
   60,000 exact C++/Python comparisons, starting at draw 1.
7. Checks adapter argument failures and that they emit no random words.

A failed compile/check exits nonzero and keeps its evidence. Recorded commands
that time out or fail to launch retain their arguments, elapsed time, error,
and partial output in `report.json`; their `exit_code` is `null` rather than
an invented process status. Timeouts also record `timeout_seconds`.
The verifier never regenerates golden data. Run the reference alone with an
existing Python interpreter if only the frozen source and saved vectors need checking:

```sh
python3 -I -B tests/reference/triflow_v1.py
```

Full verification also supplies `--cpp <built triflow_stream executable>`.
The standalone reference states explicitly when C++ comparison was omitted.
Its optional `--draws` is bounded at one million words per seed; the default
is 10,000. This is deterministic checking, not the extended statistical suite.

## Local tool provenance

Milestone 1 reused pre-existing vendor-installed tools. Microsoft `cl.exe`
19.51.36260.0 (toolset directory `14.51.36231`) and Blender's CPython 3.13.13
were inspected with valid Microsoft Corporation and Blender Foundation
Authenticode signatures, respectively. Their executable SHA-256 values were:

```text
cl.exe:     b0a1818ebae6da7f18230a84e76ce839212584ac4c2ab55b97a0d5268085da57
python.exe: 7e1ee2b9d35128f9296443a576dc02686f913ac01b8672bd301fa464c90b5271
```

These identify the inspected executables, not every file in either toolchain.
Each run records the interpreter/compiler it actually uses; launcher discovery
may select a different installed Python. There were no downloaded archives to
authenticate and no tool provisioning or machine configuration changes.
Node 26.13.0 and `npm.cmd` 11.20.0 were also found, but are unnecessary for
milestone 1. Future Windows npm instructions must use `npm.cmd`.

The TypeScript package, npm aliases, browser/Electron acceptance, statistical
adapters and reference game's maths checks belong to later milestones.
Passing this baseline proves no claim about security or statistical quality.

## Milestone 2: include the TypeScript engine

The original `.\scripts\verify.cmd` command continues to run the C++/Python
baseline. For the complete TypeScript build, declarations and three-way checks:

```powershell
npm.cmd ci --ignore-scripts --no-audit --no-fund
npm.cmd run verify
```

Use `npm` instead of `npm.cmd` on non-Windows hosts. The npm entry point runs
the same Python driver with `--typescript`; it selects the existing Windows
wrapper or `CLANK_PYTHON`/`python3` on other hosts. Reports are kept in new
`build/milestone-2/` directories and include compiled-output hashes.
`conformance.json` records all seed-stream fingerprints and exact counts.

The pinned development tools, raw API, 87-seed corpus, 1,044 checkpoints,
870,000-word comparisons and platform limits are described in the
[TypeScript guide](typescript-engine.md). `npm.cmd test` provides the compiler,
declaration and nine Node checks without invoking Python or C++.
Verification performs no installation and never regenerates expected outputs.
