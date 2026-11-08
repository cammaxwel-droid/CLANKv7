"""Independent Python arithmetic and fixed evidence for chain-seed-v2."""

import argparse
import importlib.util
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
REFERENCE = importlib.util.spec_from_file_location("triflow_v1", Path(__file__).with_name("triflow_v1.py"))
TRIFLOW = importlib.util.module_from_spec(REFERENCE)
REFERENCE.loader.exec_module(TRIFLOW)
FIXTURE = ROOT / "tests/fixtures/chain-seed-v2.json"
MODULUS = 1 << 64
MASK = MODULUS - 1
HALF_MASK = (1 << 32) - 1
SEEDS = [0, 1, MASK, 1 << 63, 0x0123456789ABCDEF, (1 << 53) + 1,
         0xAAAAAAAAAAAAAAAA, 0x5555555555555555]
GENERATIONS = [0, MASK, 1, 1 << 63, 2, (1 << 53) + 1, 17, 0x0123456789ABCDEF]


def rotate(word, distance, bits=64):
    return ((word << distance) | (word >> (bits - distance))) & ((1 << bits) - 1)


def fold(word):
    return word ^ rotate(word, 17) ^ rotate(word, 41)


def half_mix(word, multiplier, distance):
    return (word * multiplier + rotate(word, distance, 32)) & HALF_MASK


def prepare(seed, mode):
    if mode & 1:
        seed = (seed + 2 * seed * seed + 0x434C414E4B5F5131) & MASK
    if mode & 2:
        seed = fold(seed)
    if mode & 4:
        left, right = seed >> 32, seed & HALF_MASK
        left ^= half_mix(right, 0xA6C5928B, 7)
        right ^= half_mix(left, 0xD42E90F5, 13)
        seed = (left << 32) | right
    return seed


def invert(seed, mode):
    if mode & 4:
        left, right = seed >> 32, seed & HALF_MASK
        right ^= half_mix(left, 0xD42E90F5, 13)
        left ^= half_mix(right, 0xA6C5928B, 7)
        seed = (left << 32) | right
    if mode & 2:
        # Seven applications independently reproduce the C++ powered inverse.
        for _ in range(7):
            seed = fold(seed)
    if mode & 1:
        target = (seed - 0x434C414E4B5F5131) & MASK
        candidate = target
        # Modular Newton iteration differs from the native fixed-point method.
        for _ in range(6):
            derivative_inverse = pow(1 + 4 * candidate, -1, MODULUS)
            candidate = (candidate - (candidate + 2 * candidate * candidate - target)
                         * derivative_inverse) & MASK
        seed = candidate
    return seed


def repaired(seed, generation, mode):
    tail = 0x9E3779B97F4A7C15 ^ ((generation + 1) & MASK)
    tail ^= rotate(tail, 13) ^ rotate(tail, 37)
    tail ^= tail >> 31
    tail = (tail * 0xD1B54A35C8A8A0D1) & MASK
    tail ^= tail >> 27
    word = prepare(seed, mode) ^ tail
    return word ^ rotate(word, 31) ^ rotate(word, 17)


def expected_lines():
    records = []
    for seed, generation in zip(SEEDS, GENERATIONS):
        for mode in range(8):
            prepared = prepare(seed, mode)
            recovered = invert(prepared, mode)
            if recovered != seed or prepare(invert(seed, mode), mode) != seed:
                raise ValueError("Python inverse failed")
            effective = repaired(seed, generation, mode)
            rng = TRIFLOW.TriFlowV1(effective)
            words = [seed, generation, mode, prepared, recovered, effective]
            words.extend(rng.next() for _ in range(8))
            records.append(" ".join(str(word) if index == 2 else f"{word:016x}"
                                    for index, word in enumerate(words)))
    return records


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cpp", type=Path)
    parser.add_argument("--write-fixture", action="store_true")
    args = parser.parse_args()
    lines = expected_lines()
    evidence = {"engine": "chain-seed-v2", "records": lines}
    if args.write_fixture:
        with FIXTURE.open("x", encoding="utf-8") as output:
            json.dump(evidence, output, indent=2)
            output.write("\n")
    saved = json.loads(FIXTURE.read_text(encoding="utf-8"))
    if saved != evidence:
        raise ValueError("Chain v2 frozen fixture does not match independent Python arithmetic")
    print("chain-seed-v2: 64 fixed records and 512 seeded TriFlow outputs match Python.")
    if args.cpp:
        result = subprocess.run([str(args.cpp.resolve()), "--vectors"], check=True,
                                capture_output=True, text=True, timeout=30)
        if result.stdout.splitlines() != lines:
            raise ValueError("Native Chain v2 output differs from independent Python arithmetic")
        print("C++/Python agree on every prepared seed, inverse, generation wrapper and output.")
    else:
        print("Native comparison omitted; pass --cpp with the compiled chain_seed_test.")


if __name__ == "__main__":
    main()
