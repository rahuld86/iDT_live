"""Focused deployment regressions; never launch the API or change real services.

Run: python -m unittest discover -s backend/scripts/tests -v
Optional: BASH_FOR_TESTS=/path/to/bash to exercise shell scripts on Windows.
"""

import contextlib
import importlib.util
import io
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from dotenv import dotenv_values
from werkzeug.security import check_password_hash

BACKEND = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("configure_auth", BACKEND / "scripts/configure_auth.py")
auth_setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(auth_setup)


class UserSetupTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.env_path = Path(self.directory.name) / ".env"
        self.env_path.write_text("JWT_SECRET_KEY=''\nAUTH_USERS=''\nPORT=5123 # keep comment\n", encoding="utf-8")

    def configure(self, username, password, **kwargs):
        with contextlib.redirect_stdout(io.StringIO()) as output:
            auth_setup.configure_user(self.env_path, username, password, **kwargs)
        self.assertNotIn(password, output.getvalue())
        self.assertNotIn("scrypt:", output.getvalue())
        return dotenv_values(self.env_path)

    def test_first_user_has_working_hash_and_random_secret(self):
        values = self.configure("first", "a password with $ and ' quotes")
        username, _, password_hash = values["AUTH_USERS"].partition(":")
        self.assertEqual(username, "first")
        self.assertTrue(check_password_hash(password_hash, "a password with $ and ' quotes"))
        self.assertGreaterEqual(len(values["JWT_SECRET_KEY"]), 48)
        self.assertIn("PORT=5123 # keep comment", self.env_path.read_text())
        self.assertIn("AUTH_USERS='first:scrypt:", self.env_path.read_text())

    def test_second_user_preserves_first_hash_and_jwt(self):
        before = self.configure("first", "first password")
        after = self.configure("second", "second password")
        self.assertEqual(after["AUTH_USERS"].split()[0], before["AUTH_USERS"])
        self.assertEqual(after["JWT_SECRET_KEY"], before["JWT_SECRET_KEY"])
        self.assertEqual(len(after["AUTH_USERS"].split()), 2)

    def test_reset_preserves_other_user_and_secret(self):
        self.configure("first", "old password")
        before = self.configure("second", "second password")
        after = self.configure("first", "new password", reset=True)
        entries = dict(entry.split(":", 1) for entry in after["AUTH_USERS"].split())
        self.assertTrue(check_password_hash(entries["first"], "new password"))
        self.assertFalse(check_password_hash(entries["first"], "old password"))
        self.assertTrue(check_password_hash(entries["second"], "second password"))
        self.assertEqual(before["JWT_SECRET_KEY"], after["JWT_SECRET_KEY"])

    def test_duplicate_requires_explicit_reset(self):
        self.configure("first", "first password")
        original = self.env_path.read_bytes()
        with self.assertRaisesRegex(ValueError, "already exists"):
            self.configure("first", "replacement")
        self.assertEqual(original, self.env_path.read_bytes())

    def test_invalid_username_or_empty_password_cannot_change_file(self):
        original = self.env_path.read_bytes()
        for username in ("", "a b", "a:b", "a'$(touch file)", "${USER}"):
            with self.subTest(username=username), self.assertRaises(ValueError):
                self.configure(username, "password")
        with self.assertRaises(ValueError):
            self.configure("valid", "")
        with self.assertRaises(ValueError):
            self.configure("missing", "password", reset=True)
        self.assertEqual(original, self.env_path.read_bytes())


BASH = os.getenv("BASH_FOR_TESTS") or (shutil.which("bash") if os.name != "nt" else None)


class StartupPreflightTests(unittest.TestCase):
    def run_preflight(self, **overrides):
        source = (BACKEND / "start.sh").read_text(encoding="utf-8")
        code = source.split("<<'PY'\n", 1)[1].split("\nPY\n", 1)[0]
        values = {
            "JWT_SECRET_KEY": "a-valid-existing-secret-that-must-be-preserved",
            "AUTH_USERS": "one:scrypt:32768:8:1$salt$hash two:scrypt:32768:8:1$salt$hash",
        }
        values.update(overrides)
        with patch.dict(os.environ, values, clear=True), patch("sys.version_info", (3, 12, 0)):
            exec(compile(code, "start.sh preflight", "exec"), {})

    def test_accepts_multiple_quoted_scrypt_users(self):
        self.run_preflight()

    def test_rejects_missing_secret_and_placeholder(self):
        for secret in ("", "change-this-secret-key", "your-super-secret-key-change-in-production"):
            with self.subTest(secret=secret), self.assertRaisesRegex(SystemExit, "JWT_SECRET_KEY"):
                self.run_preflight(JWT_SECRET_KEY=secret)

    def test_rejects_missing_bcrypt_or_shell_damaged_auth(self):
        for users in ("", "one:$2b$12$placeholder", "one:scrypt:32768:8:1"):
            with self.subTest(users=users), self.assertRaises(SystemExit):
                self.run_preflight(AUTH_USERS=users)


@unittest.skipUnless(BASH, "Bash not configured; set BASH_FOR_TESTS to enable shell regressions")
class ShellDeploymentTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.backend = self.root / "backend"
        self.backend.mkdir()
        for name in ("start.sh", "stop.sh", "deploy.sh", "setup_user_password.sh", "env.example"):
            shutil.copyfile(BACKEND / name, self.backend / name)
        self.capture = self.root / "capture.txt"
        self.environment = os.environ.copy()
        self.environment["CAPTURE"] = self.capture.as_posix()
        self.environment["PYTHONDONTWRITEBYTECODE"] = "1"
        # No actual systemctl invocation in tests, including on Linux hosts.
        mock_bin = self.root / "mock-bin"
        mock_bin.mkdir()
        systemctl = mock_bin / "systemctl"
        systemctl.write_text("#!/usr/bin/env bash\nif [[ \"$1\" == show ]]; then echo inactive; else exit 99; fi\n")
        systemctl.chmod(0o755)
        self.environment["PATH"] = str(mock_bin) + os.pathsep + self.environment["PATH"]

    def python_stub(self, body):
        target = self.backend / "venv/bin/python"
        target.parent.mkdir(parents=True)
        target.write_text("#!/usr/bin/env bash\n" + body, encoding="utf-8")
        target.chmod(0o755)

    def run_script(self, name):
        return subprocess.run([BASH, "--noprofile", "--norc", str(self.backend / name)],
                              cwd=self.root, env=self.environment, text=True, capture_output=True, timeout=15)

    def test_start_loads_quoted_hashes_comments_and_caller_independent_paths(self):
        self.python_stub('if [[ "$1" == "-" ]]; then cat >/dev/null; exit 0; fi\n'
                         'printf "%s\\n" "$AUTH_USERS" "$SESSION_TTL_SECONDS" "$PORT" "$@" > "$CAPTURE"\n')
        (self.backend / ".env").write_text(
            "AUTH_USERS='one:scrypt:32768:8:1$salt$hash two:scrypt:32768:8:1$salt$hash'\n"
            "SESSION_TTL_SECONDS=86400 # inline comment\nPORT=5123\n", encoding="utf-8")
        result = self.run_script("start.sh")
        self.assertEqual(result.returncode, 0, result.stderr)
        output = self.capture.read_text()
        self.assertIn("one:scrypt:32768:8:1$salt$hash two:scrypt:32768:8:1$salt$hash", output)
        self.assertIn("\n86400\n5123\n", output)
        self.assertIn("127.0.0.1:5123", output)
        self.assertIn("--pid\n", output)
        self.assertIn("--timeout\n300\n", output)

    def test_start_missing_venv_fails_before_launch(self):
        result = self.run_script("start.sh")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("venv is missing", result.stderr)

    def test_deploy_preserves_existing_env_and_requests_scientific_wheels(self):
        self.python_stub('printf "%s\\n" "$*" >> "$CAPTURE"\n')
        original = "AUTH_USERS='existing:stored-value'\n"
        (self.backend / ".env").write_text(original, encoding="utf-8")
        result = self.run_script("deploy.sh")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.backend / ".env").read_text(), original)
        self.assertIn("--only-binary=pandas,numpy,pyarrow", self.capture.read_text())
        self.assertIn("-m pip check", self.capture.read_text())

    def test_deploy_rejects_incompatible_existing_venv(self):
        self.python_stub("exit 1\n")
        result = self.run_script("deploy.sh")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("existing venv needs Python 3.10-3.12", result.stderr)
        self.assertTrue((self.backend / "venv/bin/python").exists())

    def test_stop_without_manual_pid_does_not_search_or_kill(self):
        result = self.run_script("stop.sh")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("nothing else to stop", result.stdout)

    def test_stop_refuses_invalid_pid(self):
        (self.backend / "run").mkdir()
        (self.backend / "run/gunicorn.pid").write_text("1\n")
        result = self.run_script("stop.sh")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("refusing", result.stderr)


if __name__ == "__main__":
    unittest.main()
