"""Verify native engines, available browser models, and optionally the TypeScript kit."""

import argparse
from datetime import datetime, timezone
import hashlib
import json
import locale
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def msvc_environment(installation):
    if installation is None:
        vswhere = (Path(os.environ.get("ProgramFiles(x86)", "C:/Program Files (x86)")) /
                   "Microsoft Visual Studio/Installer/vswhere.exe")
        if not vswhere.is_file():
            raise ValueError("No C++ compiler found. Supply --cxx g++ or install C++ Build Tools.")
        result = subprocess.run([str(vswhere), "-latest", "-products", "*", "-requires",
                                 "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
                                 "-property", "installationPath"],
                                capture_output=True, text=True, check=True, timeout=60)
        if not result.stdout.strip():
            raise ValueError("Visual Studio has no installed x64 C++ toolset.")
        installation = Path(result.stdout.strip())
    vcvars = Path(installation).resolve() / "VC/Auxiliary/Build/vcvars64.bat"
    if not vcvars.is_file() or '"' in str(vcvars):
        raise ValueError(f"Cannot use MSVC environment: {vcvars}")
    comspec = os.environ.get("COMSPEC", "C:/Windows/System32/cmd.exe")
    # The installer-owned batch file prepares this child process's environment.
    # No source text or user game data is interpolated into this command.
    command = f'"{comspec}" /d /s /c ""{vcvars}" >nul && set"'
    result = subprocess.run(command, capture_output=True, text=True, check=True, timeout=120)
    env = os.environ.copy()
    for line in result.stdout.splitlines():
        name, separator, value = line.partition("=")
        if separator and name:
            # Windows names are case-insensitive; keep one PATH entry.
            env[name.upper()] = value
    compiler = shutil.which("cl.exe", path=env.get("PATH"))
    if compiler is None:
        raise ValueError("MSVC setup completed without exposing cl.exe.")
    return compiler, env, "msvc"


def compiler_for(args):
    if args.vs_installation:
        if os.name != "nt":
            raise ValueError("--vs-installation requires Windows")
        return msvc_environment(args.vs_installation)
    if args.cxx:
        compiler = shutil.which(args.cxx)
        if compiler is None:
            raise ValueError(f"C++ compiler not found: {args.cxx}")
        if Path(compiler).name.lower() in ("cl", "cl.exe"):
            raise ValueError("Use --vs-installation for MSVC, or omit --cxx for discovery.")
        return compiler, os.environ.copy(), "gnu"
    if os.name == "nt":
        return msvc_environment(None)
    compiler = shutil.which("g++") or shutil.which("clang++")
    if compiler is None:
        raise ValueError("Install a C++11 compiler or supply --cxx.")
    return compiler, os.environ.copy(), "gnu"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cxx", help="GCC/Clang executable; defaults to installed MSVC on Windows")
    parser.add_argument("--vs-installation", type=Path, help="specific Visual Studio Build Tools root")
    parser.add_argument("--typescript", action="store_true", help="include milestone 2 build/types/conformance")
    parser.add_argument("--javascript", action="store_true", help="require Node and browser-model checks")
    try:
        # Wrapper arguments belong to this invocation, not its child test runs.
        forwarded = json.loads(os.environ.pop("CLANK_VERIFY_ARGS_JSON", "[]"))
    except json.JSONDecodeError:
        parser.error("CLANK_VERIFY_ARGS_JSON must be a JSON array of command arguments")
    if not isinstance(forwarded, list) or any(not isinstance(part, str) for part in forwarded):
        parser.error("CLANK_VERIFY_ARGS_JSON must contain only strings")
    args = parser.parse_args([*sys.argv[1:], *forwarded])
    milestone = 2 if args.typescript else 1
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    output = ROOT / "build" / f"milestone-{milestone}" / f"{stamp}-{os.getpid()}"
    output.mkdir(parents=True, exist_ok=False)
    report = {"milestone": milestone, "engine": "triflow-v1", "started_utc": stamp,
              "platform": platform.platform(), "machine": platform.machine(),
              "processor": os.environ.get("PROCESSOR_IDENTIFIER", platform.processor()),
              "python": sys.version, "python_executable": sys.executable,
              "python_sha256": sha256(sys.executable), "commands": [], "status": "failed"}

    def run(command, env=None, expected=0):
        command = [str(part) for part in command]
        print("Running: " + subprocess.list2cmdline(command), flush=True)
        start = time.perf_counter()
        entry = {"argv": command, "exit_code": None, "expected_exit_code": expected,
                 "stdout": "", "stderr": ""}
        try:
            result = subprocess.run(command, cwd=ROOT, env=env, capture_output=True,
                                    text=True, errors="replace", timeout=180)
            entry.update(exit_code=result.returncode, stdout=result.stdout, stderr=result.stderr)
        except subprocess.TimeoutExpired as error:
            entry.update(timeout_seconds=error.timeout, error=str(error))
            # TimeoutExpired can contain bytes even when text=True was requested.
            for name in ("stdout", "stderr"):
                value = getattr(error, name)
                entry[name] = (value.decode(locale.getpreferredencoding(False), errors="replace")
                               if isinstance(value, bytes) else value or "")
            raise
        except OSError as error:
            entry["error"] = str(error)
            raise
        finally:
            entry["seconds"] = time.perf_counter() - start
            report["commands"].append(entry)
            print(entry["stdout"], end="", flush=True)
            print(entry["stderr"], end="", file=sys.stderr, flush=True)
        if expected is not None and result.returncode != expected:
            raise ValueError(f"Command exited {result.returncode}, expected {expected}: {command[0]}")
        return result

    try:
        # Record the working source identity, including uncommitted user work.
        git = shutil.which("git")
        source_paths = []
        if git and (ROOT / ".git").exists():
            location = run([git, "rev-parse", "--show-toplevel"], expected=None)
            checkout = location.returncode == 0 and Path(location.stdout.strip()).resolve() == ROOT.resolve()
        else:
            checkout = False
        if checkout:
            head = run([git, "rev-parse", "HEAD"]).stdout.strip()
            status = run([git, "status", "--porcelain=v1", "--untracked-files=all"]).stdout
            paths = [path for path in run([git, "ls-files", "-z", "--cached", "--others",
                                          "--exclude-standard"]).stdout.split("\0") if path]
            report.update(head=head, working_tree_status=status, source_origin="git checkout")
            source_paths = paths
        else:
            report["source_origin"] = "source directory without checkout metadata"
            excluded = {".git", ".local", "node_modules", "build", "dist", "__pycache__", ".venv"}
            for folder, directories, filenames in os.walk(ROOT):
                directories[:] = [name for name in directories if name not in excluded]
                source_paths.extend(str((Path(folder) / name).relative_to(ROOT)) for name in filenames)
        report["source_sha256"] = {path: sha256(ROOT / path) for path in sorted(set(source_paths))
                                   if (ROOT / path).is_file()}
        compiler, env, style = compiler_for(args)
        report.update(compiler=compiler, compiler_sha256=sha256(compiler), compiler_style=style)
        print(f"Python: {sys.version.splitlines()[0]}\nCompiler: {compiler}", flush=True)
        if style == "gnu":
            run([compiler, "--version"], env)
        suffix = ".exe" if os.name == "nt" else ""
        for name, source in (("triflow_rng_test", "tests/triflow_rng_test.cpp"),
                             ("example_utils_edge_test", "tests/example_utils_edge_test.cpp"),
                             ("example_utils_test", "tests/example_utils_test.cpp"),
                             ("triflow_statistics_test", "tests/triflow_statistics_test.cpp"),
                             ("chain_seed_test", "tests/chain_seed_test.cpp"),
                             ("seed_experiments_test", "tests/seed_experiments_test.cpp"),
                             ("triflow_stream", "tests/triflow_stream.cpp"),
                             ("triflow_demo", "examples/triflow_demo.cpp"),
                             ("chain_demo", "examples/chain_demo.cpp"),
                             ("dice_demo", "examples/dice_demo.cpp"),
                             ("pokie_demo", "examples/pokie_demo.cpp")):
            exe = output / (name + suffix)
            if style == "msvc":
                command = [compiler, "/nologo", "/Bv", "/std:c++14", "/EHsc", "/W4", "/WX",
                           "/permissive-", "/O2", str(ROOT / source), f"/Fe:{exe}",
                           f"/Fo:{output / (name + '.obj')}"]
            else:
                command = [compiler, "-std=c++11", "-Wall", "-Wextra", "-Wpedantic", "-Werror",
                           "-O2", str(ROOT / source), "-o", exe]
            run(command, env)
            report.setdefault("binary_sha256", {})[exe.name] = sha256(exe)
            if name != "triflow_stream":
                run([exe], env)
        python = [sys.executable, "-I", "-B"]
        run(python + ["-m", "unittest", "discover", "-s", ROOT / "tests/reference",
                      "-p", "test_*.py"], env)
        stream = output / ("triflow_stream" + suffix)
        run(python + [ROOT / "tests/reference/triflow_v1.py", "--cpp", stream], env)
        run(python + [ROOT / "tests/reference/chain_seed_v2.py", "--cpp",
                      output / ("chain_seed_test" + suffix)], env)
        # Adapter input errors must fail before emitting any random words.
        for seed, count in (("0", "1"), ("gggggggggggggggg", "1"),
                            ("0000000000000000", "0"), ("0000000000000000", "-1"),
                            ("0000000000000000", "1000001")):
            result = run([stream, seed, count], env, expected=2)
            if result.stdout:
                raise ValueError("Invalid adapter input emitted random words")
        node = shutil.which("node")
        report["javascript"] = {"status": "not run", "reason": "Node was not found"}
        if node is not None:
            javascript_env = env.copy()
            javascript_env["CLANK_VECTOR_EXE"] = str(output / ("seed_experiments_test" + suffix))
            browser_tests = sorted((ROOT / "tests").glob("*.cjs"))
            run([node, "--version"], env)
            run([node, "--test", *browser_tests], javascript_env)
            report["javascript"] = {"status": "passed", "node": node,
                                    "node_sha256": sha256(node),
                                    "test_files": [str(path.relative_to(ROOT)) for path in browser_tests]}
        elif args.javascript or args.typescript:
            raise ValueError("Node is required for the requested JavaScript/TypeScript checks.")
        if args.typescript:
            tsc = ROOT / "node_modules/typescript/bin/tsc"
            if node is None or not tsc.is_file():
                raise ValueError("Node and local TypeScript are required; run npm.cmd ci --ignore-scripts first.")
            report["typescript"] = {"node": node, "node_sha256": sha256(node),
                                    "compiler_version": json.loads((tsc.parent.parent / "package.json")
                                                                   .read_text(encoding="utf-8"))["version"],
                                    "compiler_launcher_sha256": sha256(tsc)}
            run([node, tsc, "--version"], env)
            run([node, tsc, "-p", ROOT / "tsconfig.json"], env)
            run([node, tsc, "-p", ROOT / "tsconfig.tests.json"], env)
            run([node, "--test", ROOT / "tests/typescript/engine.test.mjs"], env)
            run([node, "--test", ROOT / "tests/backend.test.mjs"], env)
            run(python + [ROOT / "tests/reference/conformance.py", "--cpp", stream,
                          "--node", node, "--report", output / "conformance.json"], env)
            ts_stream = ROOT / "tests/typescript/stream.mjs"
            for seed, count in (("0", "1"), ("0000000000000000\n", "1"),
                                ("0000000000000000", "0"), ("0000000000000000", "1\n"),
                                ("0000000000000000", "1000001")):
                result = run([node, ts_stream, seed, count], env, expected=2)
                if result.stdout:
                    raise ValueError("Invalid TypeScript adapter input emitted random words")
            report["typescript"]["output_sha256"] = {
                str(path.relative_to(ROOT)): sha256(path) for path in sorted((ROOT / "dist").rglob("*"))
                if path.is_file()}
        report["status"] = "passed"
        print(f"Milestone {milestone} verification passed. Statistical strength is not established.", flush=True)
        return 0
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        report["error"] = str(error)
        print(f"FAIL: {error}", file=sys.stderr, flush=True)
        return 1
    finally:
        (output / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(f"Evidence: {output / 'report.json'}", flush=True)


if __name__ == "__main__":
    sys.exit(main())
