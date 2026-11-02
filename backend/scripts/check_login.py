"""Interactive deployment diagnostic; never prints a token, password or hash."""

import contextlib
from getpass import getpass
import io
import os
from pathlib import Path
import sys

from dotenv import load_dotenv
import requests


def main():
    backend_dir = Path(__file__).resolve().parents[1]
    load_dotenv(backend_dir / ".env", override=True)
    sys.path.insert(0, str(backend_dir))
    from auth import verify_user

    username = input("Login username: ").strip()
    password = getpass("Login password: ")
    with contextlib.redirect_stdout(io.StringIO()):
        matches = verify_user(username, password)
    print("Password matches .env:", matches)
    port = os.getenv("PORT", "5000")
    try:
        response = requests.post(
            f"http://127.0.0.1:{port}/api/login",
            json={"username": username, "password": password},
            timeout=15,
        )
        print("Running API login status:", response.status_code)
    except requests.RequestException as error:
        print("API connection error:", type(error).__name__)


if __name__ == "__main__":
    main()
