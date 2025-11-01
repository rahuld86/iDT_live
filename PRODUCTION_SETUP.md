# Production Setup Summary

This document summarizes the production-ready changes made for EC2 deployment.

## Changes Made

### Backend (`backend/`)

1. **Production Configuration:**
   - ✅ Environment variable support (`.env` file)
   - ✅ CORS configuration via environment variables
   - ✅ Debug mode controlled by environment variable
   - ✅ Production-ready Gunicorn configuration

2. **New Files:**
   - `gunicorn_config.py` - Production WSGI server configuration
   - `wsgi.py` - WSGI entry point for production
   - `env.example` - Example environment variables
   - `start.sh` - Production startup script
   - `deploy.sh` - Deployment automation script
   - `systemd.service.example` - Systemd service configuration
   - `nginx.conf.example` - Nginx reverse proxy configuration
   - `DEPLOYMENT.md` - Detailed deployment guide

3. **Modified Files:**
   - `app.py`:
     - Environment variable loading
     - Configurable CORS origins
     - Production-safe debug mode
     - Environment-based port configuration

### Frontend (`frontend/tree-forge-ui/`)

1. **Production Configuration:**
   - ✅ API base URL via environment variable (`VITE_API_BASE_URL`)
   - ✅ Production build optimizations
   - ✅ Source map configuration

2. **New Files:**
   - `.env.example` - Example environment variables

3. **Modified Files:**
   - `src/services/api.ts` - Uses `VITE_API_BASE_URL` environment variable
   - `vite.config.ts` - Production build optimizations

## Quick Start for EC2

### 1. Backend Setup

```bash
cd backend
./deploy.sh
cp env.example .env
nano .env  # Configure your settings
./start.sh  # Or use systemd service
```

### 2. Frontend Build

```bash
cd frontend/tree-forge-ui
npm install
VITE_API_BASE_URL=/api npm run build
# Output in dist/
```

### 3. Nginx Configuration

- Use `backend/nginx.conf.example` as a template
- Update paths and domain name
- Restart nginx: `sudo systemctl restart nginx`

## Environment Variables

### Backend (`.env` in `backend/`)

```env
FLASK_ENV=production
FLASK_DEBUG=False
FLASK_PORT=5000
CORS_ORIGINS=http://your-ec2-ip,https://yourdomain.com
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=us-east-1
PORT=5000
WEB_CONCURRENCY=4
LOG_LEVEL=info
```

### Frontend (Build time)

```bash
VITE_API_BASE_URL=/api npm run build
# Or for different domain:
VITE_API_BASE_URL=http://api.yourdomain.com/api npm run build
```

## Next Steps

1. **Configure Security:**
   - Set up firewall rules (UFW)
   - Configure SSL/TLS (Let's Encrypt)
   - Secure AWS credentials (IAM roles)

2. **Set Up Monitoring:**
   - Configure log rotation
   - Set up health checks
   - Monitor system resources

3. **Backup Strategy:**
   - Regular backups of uploaded files
   - Export trees regularly
   - Backup configuration files

For detailed instructions, see `backend/DEPLOYMENT.md`.

