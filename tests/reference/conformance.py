"""Compare the frozen C++, Python and compiled TypeScript engines exactly.

Normal checks only read saved fixtures. --write-new-fixture creates a NEW
fixture from C++/Python agreement and refuses to overwrite any existing file.
It never uses TypeScript to calculate expected values.
"""

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys

SPEC = importlib.util.spec_from_file_location("triflow_v1", Path(__file__).with_name("triflow_v1.py"))
ref = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ref)
ROOT = ref.ROOT
FIXTURE = ROOT / "tests/fixtures/triflow-v1-checkpoints.json"
CHECKPOINTS = [1, 2, 3, 4, 8, 16, 64, 137, 256, 1024, 4096, 10000]
DRAWS = 10000


def corpus(golden):
    seeds = {}

    def add(seed, family):
        text = f"{seed & ref.MASK:016x}"
        seeds.setdefault(text, set()).add(family)

    for item in golden["cases"]:
        add(int(item["seed_hex"], 16), "existing-vector")
    for seed in (0xAAAAAAAAAAAAAAAA, 0x5555555555555555):
        add(seed, "alternating-bits")
    for bit in range(64):
        add(1 << bit, "single-bit")
    for offset in range(-4, 5):
        add(0x0123456789ABCDEF + offset, "adjacent-original")
    for offset in range(5):
        add(offset, "adjacent-zero")
        add(ref.MASK - offset, "adjacent-maximum")
    # Around the seed where initial lane B's addition wraps to zero.
    for offset in (-1, 0, 1):
        add(-0x434C414E4B5F4232 + offset, "seed-addition-wrap")
    add(0x434C414E4B5F4333, "zero-initial-lane-c")
    return {seed: sorted(labels) for seed, labels in sorted(seeds.items())}


def read_stream(command):
    result = subprocess.run([str(part) for part in command], capture_output=True,
                            text=True, check=True, timeout=60)
    lines = result.stdout.splitlines()
    if len(lines) != DRAWS:
        raise ValueError(f"stream returned {len(lines)} words, expected {DRAWS}")
    return lines


def load_checkpoints(golden, seeds):
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    if (fixture.get("schema") != "clank-conformance-v1" or fixture.get("engine") != ref.ENGINE or
            fixture.get("source_sha256_lf") != golden["source_sha256_lf"] or
            fixture.get("draws_per_seed") != DRAWS or fixture.get("checkpoints") != CHECKPOINTS):
        raise ValueError("checkpoint fixture metadata changed")
    cases = fixture.get("cases", [])
    if len(cases) != len(seeds) or [case["seed_hex"] for case in cases] != list(seeds):
        raise ValueError("checkpoint fixture must cover the entire ordered seed corpus")
    expected_keys = {str(position) for position in CHECKPOINTS}
    for case in cases:
        if case["families"] != seeds[case["seed_hex"]]:
            raise ValueError("checkpoint seed family metadata changed")
        if set(case["outputs_hex"]) != expected_keys:
            raise ValueError("checkpoint fixture has missing or extra positions")
        for word in case["outputs_hex"].values():
            if not isinstance(word, str) or ref.HEX64.fullmatch(word) is None:
                raise ValueError("checkpoint word is not canonical uint64 hex")
    return fixture


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cpp", type=Path, required=True)
    parser.add_argument("--node", type=Path)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--write-new-fixture", type=Path)
    args = parser.parse_args()
    try:
        if args.write_new_fixture and args.write_new_fixture.exists():
            raise ValueError("refusing to overwrite an existing fixture")
        if bool(args.write_new_fixture) == bool(args.node):
            raise ValueError("choose C++/Python fixture creation OR C++/Python/TypeScript checking")
        golden = ref.load_fixture(ref.FIXTURE)
        ref.verify_source(golden, ROOT / "src/triflow_rng.hpp")
        ref.verify_vectors(golden)
        seeds = corpus(golden)
        saved = None if args.write_new_fixture else load_checkpoints(golden, seeds)
        checkpoint_cases = []
        fingerprints = {}
        for index, (seed, families) in enumerate(seeds.items()):
            cpp = read_stream([args.cpp.resolve(), seed, DRAWS])
            ts = None if args.node is None else read_stream([
                args.node.resolve(), ROOT / "tests/typescript/stream.mjs", seed, DRAWS])
            expected = None if saved is None else saved["cases"][index]["outputs_hex"]
            rng = ref.TriFlowV1(int(seed, 16))
            outputs = {}
            for draw in range(1, DRAWS + 1):
                word = f"{rng.next():016x}"
                if cpp[draw - 1] != word:
                    raise ValueError(f"C++/Python mismatch: seed {seed}, draw {draw}")
                if ts is not None and ts[draw - 1] != word:
                    raise ValueError(f"TypeScript/Python mismatch: seed {seed}, draw {draw}")
                if draw in CHECKPOINTS:
                    outputs[str(draw)] = word
                    if expected is not None and expected[str(draw)] != word:
                        raise ValueError(f"saved checkpoint mismatch: seed {seed}, draw {draw}")
            checkpoint_cases.append({"seed_hex": seed, "families": families, "outputs_hex": outputs})
            fingerprints[seed] = hashlib.sha256(("\n".join(cpp) + "\n").encode("ascii")).hexdigest()
            if (index + 1) % 16 == 0:
                print(f"Conformance: {index + 1}/{len(seeds)} seeds checked.", flush=True)
        if args.write_new_fixture:
            fixture = {"schema": "clank-conformance-v1", "engine": ref.ENGINE,
                       "source_sha256_lf": golden["source_sha256_lf"], "draws_per_seed": DRAWS,
                       "checkpoints": CHECKPOINTS,
                       "provenance": "New checkpoints saved only after unchanged C++/Python agreement; no TypeScript-derived expected values.",
                       "cases": checkpoint_cases}
            with args.write_new_fixture.open("x", encoding="utf-8", newline="\n") as target:
                target.write(json.dumps(fixture, indent=2) + "\n")
            print(f"Created new fixture: {args.write_new_fixture}", flush=True)
        summary = {"engine": ref.ENGINE, "engines_checked": ["C++", "Python"] +
                   ([] if args.node is None else ["TypeScript"]), "seed_count": len(seeds),
                   "draws_per_seed": DRAWS, "words_per_engine": len(seeds) * DRAWS,
                   "checkpoint_count": len(seeds) * len(CHECKPOINTS),
                   "canonical_text_stream_sha256": fingerprints, "status": "passed"}
        if args.report:
            args.report.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
        print(f"Conformance passed: {len(seeds)} seeds, {len(seeds) * DRAWS} words per engine, "
              f"{summary['checkpoint_count']} saved checkpoints.", flush=True)
        return 0
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError) as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
