"""Keep failed tool invocations useful in the verification evidence report."""

from contextlib import redirect_stderr, redirect_stdout
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location(
    "verify_driver", Path(__file__).resolve().parents[2] / "scripts" / "verify.py")
driver = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(driver)


class DriverEvidenceChecks(unittest.TestCase):
    def setUp(self):
        forwarded = patch.dict(os.environ, {"CLANK_VERIFY_ARGS_JSON": "[]"})
        forwarded.start()
        self.addCleanup(forwarded.stop)

    def run_failed_tool(self, *, result=None, error=None):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            with patch.object(driver, "ROOT", root), \
                    patch.object(sys, "argv", ["verify.py"]), \
                    patch.object(driver.shutil, "which", return_value=None), \
                    patch.multiple(driver.platform, platform=lambda: "test-platform",
                                   machine=lambda: "test-machine", processor=lambda: "test-processor"), \
                    patch.object(driver, "compiler_for", return_value=(sys.executable, {}, "gnu")), \
                    patch.object(driver.subprocess, "run", return_value=result,
                                 side_effect=error) as run, \
                    redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
                self.assertEqual(driver.main(), 1)
            run.assert_called_once()
            reports = list((root / "build" / "milestone-1").glob("*/report.json"))
            self.assertEqual(len(reports), 1)
            report = json.loads(reports[0].read_text(encoding="utf-8"))
            self.assertEqual(report["status"], "failed")
            self.assertIn("error", report)
            self.assertEqual(len(report["commands"]), 1)
            command = report["commands"][0]
            self.assertEqual(command["argv"], [sys.executable, "--version"])
            self.assertEqual(command["expected_exit_code"], 0)
            self.assertGreaterEqual(command["seconds"], 0)
            return command

    def test_timeout_preserves_partial_output(self):
        for output, error_output in ((b"partial stdout\n", b"partial stderr\n"),
                                     ("partial stdout\n", "partial stderr\n")):
            with self.subTest(output_type=type(output).__name__):
                error = subprocess.TimeoutExpired(
                    [sys.executable, "--version"], 180,
                    output=output, stderr=error_output)
                command = self.run_failed_tool(error=error)
                self.assertIsNone(command["exit_code"])
                self.assertEqual(command["timeout_seconds"], 180)
                self.assertEqual(command["stdout"], "partial stdout\n")
                self.assertEqual(command["stderr"], "partial stderr\n")
                self.assertIn("error", command)

    def test_timeout_without_output_is_serializable(self):
        error = subprocess.TimeoutExpired([sys.executable, "--version"], 180)
        command = self.run_failed_tool(error=error)
        self.assertIsNone(command["exit_code"])
        self.assertEqual(command["stdout"], "")
        self.assertEqual(command["stderr"], "")

    def test_launch_error_keeps_attempted_command(self):
        command = self.run_failed_tool(error=OSError("compiler launch failed"))
        self.assertIsNone(command["exit_code"])
        self.assertEqual(command["error"], "compiler launch failed")
        self.assertEqual(command["stdout"], "")
        self.assertEqual(command["stderr"], "")

    def test_nonzero_exit_keeps_existing_diagnostics(self):
        result = subprocess.CompletedProcess(
            [sys.executable, "--version"], 3,
            stdout="compiler stdout\n", stderr="compiler stderr\n")
        command = self.run_failed_tool(result=result)
        self.assertEqual(command["exit_code"], 3)
        self.assertEqual(command["stdout"], "compiler stdout\n")
        self.assertEqual(command["stderr"], "compiler stderr\n")
        self.assertNotIn("timeout_seconds", command)

    def test_source_archive_hashes_files_without_probing_an_unrelated_git_checkout(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "README.md").write_text("archive source\n", encoding="utf-8")
            failure = subprocess.CompletedProcess([sys.executable, "--version"], 3,
                                                  stdout="", stderr="stop after source inspection")
            with patch.object(driver, "ROOT", root), \
                    patch.object(sys, "argv", ["verify.py"]), \
                    patch.dict(os.environ, {"CLANK_VERIFY_ARGS_JSON": "[]"}), \
                    patch.object(driver.shutil, "which", return_value="git"), \
                    patch.object(driver, "compiler_for", return_value=(sys.executable, {}, "gnu")), \
                    patch.object(driver.subprocess, "run", return_value=failure) as run, \
                    redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
                self.assertEqual(driver.main(), 1)
            run.assert_called_once()
            self.assertEqual(run.call_args.args[0], [sys.executable, "--version"])
            report_path = next((root / "build/milestone-1").glob("*/report.json"))
            report = json.loads(report_path.read_text(encoding="utf-8"))
            self.assertEqual(report["source_origin"], "source directory without checkout metadata")
            self.assertEqual(report["source_sha256"], {"README.md": driver.sha256(root / "README.md")})
            self.assertNotIn("head", report)

    def test_forwarded_arguments_preserve_compiler_paths_without_shell_parsing(self):
        chosen = []
        def compiler(args):
            chosen.append(args.cxx)
            raise ValueError("stop after argument parsing")
        with tempfile.TemporaryDirectory() as folder, \
                patch.object(driver, "ROOT", Path(folder)), \
                patch.object(sys, "argv", ["verify.py"]), \
                patch.dict(os.environ, {"CLANK_VERIFY_ARGS_JSON": json.dumps(["--cxx", "path with & spaces/g++"])}), \
                patch.object(driver.shutil, "which", return_value=None), \
                patch.object(driver, "compiler_for", side_effect=compiler), \
                redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            self.assertEqual(driver.main(), 1)
        self.assertEqual(chosen, ["path with & spaces/g++"])


if __name__ == "__main__":
    unittest.main()
