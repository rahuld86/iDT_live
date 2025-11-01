# Production Deployment Guide for EC2

This guide explains how to deploy the Decision Tree application on an EC2 instance.

## Quick Start

### Backend

1. **Deploy backend:**
   ```bash
   cd backend
   ./deploy.sh
   ```

2. **Configure environment:**
   ```bash
   cp env.example .env
   nano .env  # Edit with your configuration
   ```

3. **Start with systemd:**
   ```bash
   sudo systemctl start decision-tree-api
   ```

### Frontend

1. **Build frontend:**
   ```bash
   cd frontend/tree-forge-ui
   npm install
   VITE_API_BASE_URL=/api npm run build
   ```

2. **Configure nginx** to serve `dist/` and proxy `/api` to backend

See `backend/DEPLOYMENT.md` for detailed instructions.

