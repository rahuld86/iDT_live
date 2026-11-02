# Production setup reference

Follow [DEPLOYMENT.md](DEPLOYMENT.md) for fresh installation and updates.

Deployment files:

- backend/deploy.sh: Python 3.10-3.12 validation (3.12 recommended), wheel-based
  dependency installation, runtime directories, non-overwriting .env setup.
- backend/start.sh: trusted .env loading, authentication preflight, explicit venv
  interpreter, localhost Gunicorn, PID file, configurable request timeout.
- backend/stop.sh: systemd stop without disabling boot startup; verified manual
  master PID and graceful TERM; no broad process killing.
- backend/env.example: secret-free starter, quoted auth values, CORS origin,
  Redis/DataFrame/cache settings and IAM-role-first S3 configuration.
- backend/setup_user_password.sh and scripts/configure_auth.py: hidden password
  prompts, scrypt hashes, first-user JWT setup, preserving existing users/secrets.
- backend/scripts/check_login.py: password/config versus live API diagnosis
  without printing tokens, hashes, or secrets.
- backend/systemd.service.example: starts start.sh; no self-stopping pre-start hooks.
- backend/nginx.conf.example: static frontend from /var/www/decision-tree and
  localhost /api proxy, 600 MB upload cap and 300-second proxy timeouts.

The application Python is separate from Ubuntu's system Python. Recreating venv
does not require replacing .env or deleting datasets. S3 import/export supports
EC2 IAM-role credentials; DF_STORE_BACKEND=s3 is not implemented.
