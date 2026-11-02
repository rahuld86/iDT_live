# EC2 deployment checklist

Use [DEPLOYMENT.md](../DEPLOYMENT.md) for commands and configuration.

- [ ] Application interpreter is Python 3.10-3.12, preferably 3.12; system Python untouched.
- [ ] deploy.sh completes, scientific packages install from wheels, pip check passes.
- [ ] Existing .env and data retained on updates; new .env is not committed.
- [ ] JWT secret and first user configured with setup_user_password.sh.
- [ ] AUTH_USERS is single-quoted; second user login tested if configured.
- [ ] CORS_ORIGINS matches the browser origin, with scheme and no trailing slash.
- [ ] Redis responds; metadata and dataset directories writable by service user.
- [ ] Worker/cache budgets fit RAM; Gunicorn/nginx timeouts match the workload.
- [ ] Manual health check returns HTTP 200; manual process stopped before systemd.
- [ ] Corrected service template installed, verified, daemon-reloaded and active (running).
- [ ] stop.sh preserves service boot enablement and does not kill unrelated processes.
- [ ] Frontend built with supported Node LTS and /api base, assets copied to /var/www.
- [ ] nginx configuration passes nginx -t; direct and proxied API health return 200.
- [ ] Ports 5000/6379 remain closed externally; HTTP/HTTPS allowed as required.
- [ ] Login, CSV setup, tree build and import/export exercised in browser.
- [ ] Optional S3 role attached with bucket/prefix permissions; credential placeholders removed.
- [ ] Optional KMS permissions configured for SSE-KMS objects.
- [ ] Domain/HTTPS and updated CORS configured if used.
