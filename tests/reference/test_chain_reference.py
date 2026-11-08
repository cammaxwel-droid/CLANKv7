"""Protect Chain reference evidence from incomplete or mismatched creation."""

import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("chain_seed_v2", Path(__file__).with_name("chain_seed_v2.py"))
ref = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ref)


class ChainReferenceChecks(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.fixture = Path(self.folder.name) / "fixture.json"
        self.lines = ref.expected_lines()

    def invoke(self, *arguments):
        with patch.object(ref, "FIXTURE", self.fixture), patch("sys.argv", ["chain_seed_v2.py", *arguments]):
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                ref.main()

    def test_creation_requires_native_comparison(self):
        with self.assertRaises(SystemExit) as failure:
            self.invoke("--write-fixture")
        self.assertEqual(failure.exception.code, 2)
        self.assertFalse(self.fixture.exists())

    def test_mismatched_or_failed_native_check_does_not_save_evidence(self):
        with patch.object(ref.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, "wrong\n", "")):
            with self.assertRaisesRegex(ValueError, "differs from independent"):
                self.invoke("--write-fixture", "--cpp", "unused")
        self.assertFalse(self.fixture.exists())
        with patch.object(ref.subprocess, "run", side_effect=subprocess.CalledProcessError(1, ["unused"])):
            with self.assertRaises(subprocess.CalledProcessError):
                self.invoke("--write-fixture", "--cpp", "unused")
        self.assertFalse(self.fixture.exists())

    def test_validated_creation_is_exact_and_never_overwrites(self):
        result = subprocess.CompletedProcess([], 0, "\n".join(self.lines) + "\n", "")
        with patch.object(ref.subprocess, "run", return_value=result):
            self.invoke("--write-fixture", "--cpp", "unused")
            self.assertEqual(json.loads(self.fixture.read_text()), {"engine": "chain-seed-v2", "records": self.lines})
            original = self.fixture.read_bytes()
            with self.assertRaises(FileExistsError):
                self.invoke("--write-fixture", "--cpp", "unused")
            self.assertEqual(self.fixture.read_bytes(), original)

    def test_changed_frozen_evidence_fails_without_rewriting(self):
        self.fixture.write_text(json.dumps({"engine": "chain-seed-v2", "records": self.lines[:-1]}))
        original = self.fixture.read_bytes()
        with self.assertRaisesRegex(ValueError, "frozen fixture"):
            self.invoke()
        self.assertEqual(self.fixture.read_bytes(), original)


if __name__ == "__main__":
    unittest.main()
