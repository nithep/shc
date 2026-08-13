# Hotel-ECS Raspberry Pi Deployment Guide

## Overview
The Raspberry Pi deployment uses **zip packages** instead of git clone. This guide shows both automated and manual deployment methods.

---

## Method 1: Automated Deployment (Recommended)

### Prerequisites
- PowerShell on Windows
- SSH access to Raspberry Pi
- OpenSSH client installed (`Get-WindowsCapability -Online | Where-Object Name -like 'OpenSSH.Client*'`)

### Steps

1. **Run the deployment script:**
```powershell
cd "c:\Users\Nithep\ไดรฟ์ของฉัน (cnithep@gmail.com)\Hotel-ECS"
.\deploy-to-pi.ps1
```

The script will automatically:
- Create a zip package of your latest code
- Transfer it to the Pi via SCP
- Stop current containers
- Backup the old version
- Extract and deploy the new version
- Start all services
- Verify the deployment

---

## Method 2: Manual Deployment

### Step 1: Create Deployment Package (Windows)

```powershell
# Navigate to project root
cd "c:\Users\Nithep\ไดรฟ์ของฉัน (cnithep@gmail.com)\Hotel-ECS"

# Create zip package
Compress-Archive -Path .\* -DestinationPath .\deploy.zip -Force
```

### Step 2: Transfer to Raspberry Pi

```powershell
# Copy zip file to Pi
scp .\deploy.zip ecs-agent@192.168.1.94:/opt/hotel-ecs/
```

### Step 3: Deploy on Raspberry Pi (via SSH)

```bash
# SSH into the Pi
ssh ecs-agent@192.168.1.94

# Navigate to project directory
cd /opt/hotel-ecs

# Stop current containers
cd app && docker compose -f docker-compose.prod.yml down

# Go back and backup current version
cd ..
mv app app_backup_$(date +%Y%m%d_%H%M%S)

# Create new app directory and extract
mkdir -p app
cd app
unzip -o ../deploy.zip

# Set correct permissions
sudo chown -R ecs-agent:ecs-agent /opt/hotel-ecs/app

# Start containers with new code
docker compose -f docker-compose.prod.yml up -d --build

# Check status
docker compose -f docker-compose.prod.yml ps

# View logs (optional)
docker compose -f docker-compose.prod.yml logs -f
```

---

## Method 3: Quick Update (If Git is Available)

If you want to use git in the future, first initialize git on the Pi:

```bash
# On Raspberry Pi
cd /opt/hotel-ecs/app
git init
git remote add origin <your-git-repo-url>
git pull origin main
```

Then you can use:
```bash
cd /opt/hotel-ecs/app
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

---

## Troubleshooting

### Issue: `docker-compose: command not found`
**Solution:** Use `docker compose` (with space) instead of `docker-compose` (with hyphen). Docker Compose v2 changed the syntax.

```bash
# Wrong (v1 syntax)
docker-compose up -d

# Correct (v2 syntax)
docker compose up -d
```

### Issue: `fatal: not a git repository`
**Cause:** The project was deployed via zip, not git clone.
**Solution:** Use the zip deployment method described above, or initialize git as shown in Method 3.

### Issue: Permission denied
**Solution:** Ensure correct ownership:
```bash
sudo chown -R ecs-agent:ecs-agent /opt/hotel-ecs/app
```

### Issue: Containers won't start
**Solution:** Check logs and rebuild:
```bash
cd /opt/hotel-ecs/app
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml logs -f
```

### Issue: Port already in use
**Solution:** Stop old containers first:
```bash
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d --build
```

---

## Verification Checklist

After deployment, verify:

- [ ] All containers are running: `docker compose -f docker-compose.prod.yml ps`
- [ ] Frontend accessible: `http://192.168.1.94:5173`
- [ ] Backend API healthy: `curl http://192.168.1.94:3000/api/health`
- [ ] No errors in logs: `docker compose -f docker-compose.prod.yml logs --tail=50`
- [ ] PBX connection stable (check backend logs)

---

## Rollback Procedure

If something goes wrong:

```bash
# SSH into Pi
ssh ecs-agent@192.168.1.94

# Stop current (broken) deployment
cd /opt/hotel-ecs/app
docker compose -f docker-compose.prod.yml down

# Restore backup (replace timestamp with actual backup folder name)
cd /opt/hotel-ecs
rm -rf app
mv app_backup_20260721_045000 app

# Start old version
cd app
docker compose -f docker-compose.prod.yml up -d
```

---

## Environment Variables

Make sure `.env.production` is properly configured on the Pi:

```bash
# Check if .env file exists
ls -la /opt/hotel-ecs/app/.env*

# If missing, create from template
cp /opt/hotel-ecs/app/.env.production.template /opt/hotel-ecs/app/.env
nano /opt/hotel-ecs/app/.env
```

Required variables:
- `CLOUDFLARE_TUNNEL_TOKEN` (if using Cloudflare)
- Database credentials
- API keys
- PBX connection settings

---

## Notes

- **Docker Compose Version:** The Pi uses Docker Compose v2, which requires `docker compose` (space) syntax
- **No Git Repository:** Current deployment uses zip packages, so `git pull` won't work unless you initialize git
- **Automatic Backups:** Each deployment creates a timestamped backup for easy rollback
- **Permissions:** Always ensure `ecs-agent` user owns the `/opt/hotel-ecs/app` directory
