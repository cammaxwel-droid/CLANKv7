"""Check that the verifier detects broken evidence, rather than silently passing."""

import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location("triflow_v1", Path(__file__).with_name("triflow_v1.py"))
ref = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ref)


class ReferenceChecks(unittest.TestCase):
    def setUp(self):
        self.fixture = ref.load_fixture(ref.FIXTURE)

    def test_existing_vectors(self):
        self.assertEqual(len(self.fixture["cases"]), 6)
        self.assertEqual(ref.verify_vectors(self.fixture), 28)
        ref.verify_source(self.fixture, ref.ROOT / "src" / "triflow_rng.hpp")

    def test_changed_golden_fails(self):
        self.fixture["cases"][0]["outputs_hex"][0] = "0000000000000000"
        with self.assertRaisesRegex(ValueError, "golden mismatch.*draw 1"):
            ref.verify_vectors(self.fixture)

    def test_changed_source_fails_but_line_endings_do_not(self):
        original = (ref.ROOT / "src" / "triflow_rng.hpp").read_bytes().replace(b"\r\n", b"\n")
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / "reference.hpp"
            source.write_bytes(original.replace(b"\n", b"\r\n"))
            ref.verify_source(self.fixture, source)
            source.write_bytes(original + b"// changed\n")
            with self.assertRaisesRegex(ValueError, "source hash changed"):
                ref.verify_source(self.fixture, source)

    def test_invalid_fixture_fails(self):
        bad_cases = []
        wrong_engine = copy.deepcopy(self.fixture)
        wrong_engine["engine"] = "triflow-v2"
        bad_cases.append(wrong_engine)
        duplicate = copy.deepcopy(self.fixture)
        duplicate["cases"].append(duplicate["cases"][0])
        bad_cases.append(duplicate)
        bad_word = copy.deepcopy(self.fixture)
        bad_word["cases"][0]["outputs_hex"][0] = "xyz"
        bad_cases.append(bad_word)
        with tempfile.TemporaryDirectory() as folder:
            fixture = Path(folder) / "bad.json"
            for bad in bad_cases:
                with self.subTest(bad=bad):
                    fixture.write_text(json.dumps(bad), encoding="utf-8")
                    with self.assertRaises(ValueError):
                        ref.load_fixture(fixture)

    def test_missing_extra_malformed_and_wrong_cpp_outputs_fail(self):
        case = self.fixture["cases"][0]
        words = case["outputs_hex"]
        ref.check_stream(words, case["seed_hex"], len(words))
        for changed in (words[:-1], words + [words[0]], ["garbage"] + words[1:],
                        ["0000000000000000"] + words[1:]):
            with self.subTest(changed=changed):
                with self.assertRaises(ValueError):
                    ref.check_stream(changed, case["seed_hex"], len(words))

    def test_invalid_seed_fails(self):
        for seed in (-1, 1 << 64, True, 1.5, "0"):
            with self.subTest(seed=seed):
                with self.assertRaises(ValueError):
                    ref.TriFlowV1(seed)


if __name__ == "__main__":
    unittest.main()
