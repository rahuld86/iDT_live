# Login setup and troubleshooting

User credentials are in backend/.env, not start.sh. start.sh sources that trusted
file, so keep AUTH_USERS single-quoted on one line to preserve dollar signs:

```env
AUTH_USERS='user1:scrypt:...$salt$hash user2:scrypt:...$salt$hash'
```

Use the helper instead of copying hashes manually:

```bash
cd ~/project_iDT_2/backend
./setup_user_password.sh idfcuser
./setup_user_password.sh seconduser
./setup_user_password.sh idfcuser --reset
sudo systemctl restart decision-tree-api
```

Run the first command only when creating that user; --reset is required for an
existing username. The helper uses scrypt, preserves other users and valid JWT
secrets, and never takes passwords as arguments or prints hashes. The old bcrypt
placeholder does not match the Werkzeug verifier used by this application.
JWT_ACCESS_TOKEN_EXPIRES=86400 means 24 hours. Password reset does not revoke
already issued stateless JWTs.

Diagnose without printing credentials:

```bash
venv/bin/python scripts/check_login.py
```

| .env match / direct API status | Meaning |
| --- | --- |
| False / 401 | Username/password or stored hash incorrect; reset the intended user. |
| True / 401 | Running service loaded different/altered settings; fix loader and restart. |
| True / 200 | API login works; inspect frontend API URL and nginx. |
| Connection error / 5xx | Diagnose service configuration rather than resetting passwords. |

Do not run interactive input() diagnostics inside python <<EOF: the heredoc uses
standard input for source code and input() reaches EOF. Use the script above.
If needed, use python -c with hidden getpass input rather than putting a password
in command history. Do not share raw auth logs: the application may log fragments
of invalid hashes.

See [the deployment guide](../DEPLOYMENT.md) for the corrected service and loader.
