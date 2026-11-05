"""Independent arithmetic reference and conformance checker, standard library only.

Fixtures are transcribed from the pre-existing C++ tests, never generated here.
Python's wide integer sum deliberately differs from the C++ average method.
This is a verification tool, not a new game-facing generator or snapshot API.
"""

import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

ENGINE = "triflow-v1"
MASK = (1 << 64) - 1
ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "tests" / "fixtures" / "triflow-v1.json"
HEX64 = re.compile(r"[0-9a-f]{16}")


def rotate(value, distance):
    return ((value << distance) | (value >> (64 - distance))) & MASK


def mix(value):
    value ^= value >> 30
    value = (value * 0xE6D7102B5C9A3F17) & MASK
    value ^= value >> 27
    value = (value * 0xB3E4F1D7A6C5928B) & MASK
    return value ^ (value >> 31)


class TriFlowV1:
    def __init__(self, seed):
        if type(seed) is not int or not 0 <= seed <= MASK:
            raise ValueError("seed must be an unsigned 64-bit integer")
        self.a = seed ^ 0x434C414E4B5F4131
        self.b = rotate((seed + 0x434C414E4B5F4232) & MASK, 21)
        self.c = rotate(seed ^ 0x434C414E4B5F4333, 43)
        self.calls = 0

    def next(self):
        self.a = (self.a + 0xE6D7102B5C9A3F17) & MASK
        self.b = (self.b + 0xB3E4F1D7A6C5928B) & MASK
        self.c = (self.c + 0xC8A35167D42E90F5) & MASK
        self.calls = (self.calls + 1) & MASK
        a = mix(self.a ^ rotate(self.c, 11))
        b = mix(self.b ^ rotate(self.a, 27))
        c = mix(self.c ^ rotate(self.b, 45))
        mean = (a + b + c) // 3  # Do not truncate this sum to 64 bits.
        braid = a ^ rotate(b, 17) ^ rotate(c, 39)
        return mix(mean ^ braid ^ self.calls)


def load_fixture(path):
    fixture = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(fixture, dict) or fixture.get("engine") != ENGINE:
        raise ValueError("fixture engine must be triflow-v1")
    digest = fixture.get("source_sha256_lf")
    if not isinstance(digest, str) or re.fullmatch(r"[0-9a-f]{64}", digest) is None:
        raise ValueError("fixture must pin the frozen source SHA-256")
    cases = fixture.get("cases")
    if not isinstance(cases, list) or not cases:
        raise ValueError("fixture must contain seed cases")
    seen = set()
    for case in cases:
        if not isinstance(case, dict):
            raise ValueError("fixture case must be an object")
        seed = case.get("seed_hex")
        if not isinstance(seed, str) or HEX64.fullmatch(seed) is None or seed in seen:
            raise ValueError("fixture seeds must be unique canonical 16-digit hex")
        seen.add(seed)
        words = case.get("outputs_hex")
        if not isinstance(words, list) or not words:
            raise ValueError("fixture case must have outputs")
        if any(not isinstance(word, str) or HEX64.fullmatch(word) is None for word in words):
            raise ValueError("fixture outputs must be canonical 16-digit hex")
    return fixture


def verify_source(fixture, source):
    # Line endings can change on checkout without changing the algorithm.
    actual = hashlib.sha256(Path(source).read_bytes().replace(b"\r\n", b"\n")).hexdigest()
    if actual != fixture["source_sha256_lf"]:
        raise ValueError("frozen C++ source hash changed; preserve triflow-v1")


def verify_vectors(fixture):
    count = 0
    for case in fixture["cases"]:
        rng = TriFlowV1(int(case["seed_hex"], 16))
        for index, expected in enumerate(case["outputs_hex"], 1):
            actual = f"{rng.next():016x}"
            if actual != expected:
                raise ValueError(f"golden mismatch: seed {case['seed_hex']}, draw {index}: "
                                 f"expected {expected}, got {actual}")
            count += 1
    return count


def check_stream(lines, seed, count):
    if len(lines) != count:
        raise ValueError(f"C++ returned {len(lines)} words, expected {count}")
    rng = TriFlowV1(int(seed, 16))
    for index, actual in enumerate(lines, 1):
        expected = f"{rng.next():016x}"
        if HEX64.fullmatch(actual) is None or actual != expected:
            raise ValueError(f"C++/Python mismatch: seed {seed}, draw {index}: "
                             f"expected {expected}, got {actual}")


def verify_cpp(executable, fixture, count):
    for case in fixture["cases"]:
        seed = case["seed_hex"]
        result = subprocess.run([str(Path(executable).resolve()), seed, str(count)],
                                capture_output=True, text=True, timeout=60, check=True)
        check_stream(result.stdout.splitlines(), seed, count)
    return len(fixture["cases"]) * count


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fixture", type=Path, default=FIXTURE)
    parser.add_argument("--cpp", type=Path, help="compiled triflow_stream executable")
    parser.add_argument("--draws", type=int, default=10000, help="per seed, 1..1000000")
    args = parser.parse_args()
    try:
        fixture = load_fixture(args.fixture)
        if not 1 <= args.draws <= 1000000:
            raise ValueError("draw count must be between 1 and 1000000")
        if args.draws < max(len(case["outputs_hex"]) for case in fixture["cases"]):
            raise ValueError("draw count must cover every golden output")
        verify_source(fixture, ROOT / "src" / "triflow_rng.hpp")
        vectors = verify_vectors(fixture)
        print(f"{ENGINE}: frozen source and {vectors} existing golden outputs verified.", flush=True)
        if args.cpp is not None:
            total = verify_cpp(args.cpp, fixture, args.draws)
            print(f"C++/Python agree on {total} outputs ({len(fixture['cases'])} seeds "
                  f"x {args.draws} draws).", flush=True)
        else:
            print("C++ comparison not requested; use --cpp after compiling the adapter.")
        return 0
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
