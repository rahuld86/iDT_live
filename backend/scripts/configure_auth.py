"""Deployment-only interactive user setup; does not import or change the API."""

import argparse
from getpass import getpass
import os
from pathlib import Path
import re
import secrets

from dotenv import dotenv_values, set_key
from werkzeug.security import generate_password_hash


def configure_user(env_path, username, password, *, reset=False):
    """Preserve other users/settings and store a single-quoted scrypt hash."""
    if not re.fullmatch(r"[A-Za-z0-9_.@-]+", username):
        raise ValueError("Username must contain only letters, digits, underscores, dots, @ or hyphens.")
    if not password:
        raise ValueError("Password must not be empty.")
    if not env_path.is_file():
        raise ValueError(".env is missing. Run ./deploy.sh first.")
    values = dotenv_values(env_path, interpolate=False)
    entries = (values.get("AUTH_USERS") or "").replace("\\n", "\n").split()
    exists = any(entry.partition(":")[0] == username for entry in entries)
    if exists and not reset:
        raise ValueError("User already exists. Use --reset to replace that user's password.")
    if reset and not exists:
        raise ValueError("User does not exist. Omit --reset to add the user.")
    entries = [entry for entry in entries if entry.partition(":")[0] != username]
    entries.append(username + ":" + generate_password_hash(password, method="scrypt"))
    os.chmod(env_path, 0o600)
    set_key(env_path, "AUTH_USERS", " ".join(entries), quote_mode="always")
    secret = values.get("JWT_SECRET_KEY") or ""
    if len(secret) < 32 or secret in {"your-super-secret-key-change-in-production", "change-this-secret-key"}:
        set_key(env_path, "JWT_SECRET_KEY", secrets.token_urlsafe(48), quote_mode="always")
        print("Generated JWT_SECRET_KEY (existing tokens, if any, will need a new login).")
    os.chmod(env_path, 0o600)


def main():
    parser = argparse.ArgumentParser(description="Add a login user or reset their password without exposing credentials.")
    parser.add_argument("username", nargs="?", help="Login username; prompted if omitted")
    parser.add_argument("--reset", action="store_true", help="Replace an existing user's password; preserve other users")
    args = parser.parse_args()
    username = args.username if args.username is not None else input("Username: ").strip()
    password = getpass("Choose password: ")
    if password != getpass("Confirm password: "):
        parser.exit(1, "Passwords do not match. Nothing changed.\n")
    try:
        configure_user(Path(__file__).resolve().parents[1] / ".env", username, password, reset=args.reset)
    except ValueError as error:
        parser.exit(1, str(error) + "\n")
    print("Saved login for:", username)
    print("Restart the backend: sudo systemctl restart decision-tree-api")


if __name__ == "__main__":
    main()
