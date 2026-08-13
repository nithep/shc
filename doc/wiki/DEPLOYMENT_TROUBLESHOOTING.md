# Hotel-ECS Deployment Troubleshooting Guide

## 🚨 Common Issues and Solutions

### Issue 1: CLOUDFLARE_TUNNEL_TOKEN Not Set

**Error Message:**
```
WARN: "CLOUDFLARE_TUNNEL_TOKEN" variable is not set
```

**Root Cause:**
The `.env` file was not included in the deployment package or not properly transferred to the Raspberry Pi.

**Solution:**

#### Option A: Redeploy with Fixed Script (Recommended)
The `deploy-to-pi.ps1` script has been updated to include the `.env` file automatically.

```powershell
# On Windows
cd "C:\Users\Nithep\ไดรฟ์ของฉัน (cnithep@gmail.com)\Hotel-ECS"

# Verify .env exists and has token
Get-Content .env | Select-String "CLOUDFLARE_TUNNEL_TOKEN"

# Clean old files
Remove-Item deploy-*.zip -Force -ErrorAction SilentlyContinue

# Deploy with fixed script
.\deploy-to-pi.ps1
```

#### Option B: Manual Fix on Pi
```bash
# SSH to Pi
ssh ecs-agent@192.168.1.94

# Navigate to app directory
cd /opt/hotel-ecs/app

# Check if .env exists
ls -la .env

# If missing, copy from Windows using SCP
# On Windows PowerShell:
scp .env ecs-agent@192.168.1.94:/opt/hotel-ecs/app/.env

# Verify token is present
grep '^CLOUDFLARE_TUNNEL_TOKEN=' /opt/hotel-ecs/app/.env

# Restart tunnel service
docker compose -f docker-compose.prod.yml restart hotel-tunnel
```

#### Option C: Quick Fix Script
```bash
# Run the automated fix script
ssh ecs-agent@192.168.1.94 'bash -s' < quick-fix-deployment.sh
```

---

### Issue 2: Container Name Conflict

**Error Message:**
```
Error response from daemon: Conflict. The container name "/hotel-app" is already in use
```

**Root Cause:**
Previous container instances were not properly removed before creating new ones.

**Solution:**

#### Quick Fix (On Pi)
```bash
ssh ecs-agent@192.168.1.94

# Force remove conflicting containers
docker rm -f hotel-app 2>/dev/null || true
docker rm -f hotel-tunnel 2>/dev/null || true

# Stop all related services
cd /opt/hotel-ecs/app
docker compose -f docker-compose.prod.yml down

# Start fresh
docker compose -f docker-compose.prod.yml up -d --build
```

#### Automated Fix
The updated `deploy-to-pi.ps1` now includes automatic container cleanup:
```bash
docker rm -f hotel-app 2>/dev/null || true
docker rm -f hotel-tunnel 2>/dev/null || true
```

---

### Issue 3: Frontend Service Not Found

**Error Message:**
```
no such service: frontend
```

**Root Cause:**
The production Docker Compose file (`docker-compose.prod.yml`) only defines `hotel-app` and `cloudflare-tunnel` services. There is no separate `frontend` service.

**Solution:**
Do NOT try to build or start a `frontend` service. The frontend is served by the `hotel-app` service on port 5173.

**Correct Commands:**
```bash
# ✅ Correct - Start all services defined in prod file
docker compose -f docker-compose.prod.yml up -d

# ❌ Wrong - Don't specify non-existent service
docker compose -f docker-compose.prod.yml up -d frontend
```

---

### Issue 4: Deployment Script Syntax Error

**Error Message:**
```
Missing closing '}' in statement block or type definition
```

**Root Cause:**
The `try {` block was missing at the beginning of Step 1 in the deployment script.

**Solution:**
The script has been fixed. To ensure you have the latest version:

```powershell
# Pull latest changes if using Git
git pull origin main

# Or manually verify the script structure
notepad deploy-to-pi.ps1
```

Look for this structure at line ~18:
```powershell
$TempDir = Join-Path $ProjectRoot ("temp_deploy_" + [guid]::NewGuid().ToString())
try {
    if (Test-Path $TempDir) { Remove-Item $TempDir -Recurse -Force -ErrorAction SilentlyContinue }
    New-Item -ItemType Directory -Path $TempDir -Force | Out-Null
    # ... rest of packaging logic
} catch {
    Write-Host "Failed to create package: $_" -ForegroundColor Red
    exit 1
}
```

---

### Issue 5: Tunnel Not Connecting After Deployment

**Symptoms:**
- Tunnel logs show authentication errors
- Cloudflare dashboard shows tunnel as offline

**Diagnosis:**
```bash
ssh ecs-agent@192.168.1.94
cd /opt/hotel-ecs/app

# Check tunnel logs
docker compose -f docker-compose.prod.yml logs hotel-tunnel

# Verify .env file
cat .env | grep TUNNEL_TOKEN

# Check if environment variable is loaded
docker compose -f docker-compose.prod.yml config | grep TUNNEL
```

**Solutions:**

1. **Verify Token in .env:**
   ```bash
   # Should show the full token
   grep '^CLOUDFLARE_TUNNEL_TOKEN=' /opt/hotel-ecs/app/.env
   ```

2. **Restart Tunnel Service:**
   ```bash
   docker compose -f docker-compose.prod.yml restart hotel-tunnel
   docker compose -f docker-compose.prod.yml logs -f hotel-tunnel
   ```

3. **Rebuild with Fresh Environment:**
   ```bash
   docker compose -f docker-compose.prod.yml down
   docker compose -f docker-compose.prod.yml up -d --build
   ```

4. **Check Token Validity:**
   - Log into Cloudflare Dashboard
   - Go to Zero Trust → Access → Tunnels
   - Verify the tunnel exists and token hasn't expired
   - Regenerate token if needed and update `.env`

---

### Issue 6: Package Creation Takes Too Long

**Symptoms:**
Script hangs at "[1/5] Creating deployment package..." for more than 30 seconds.

**Solution:**

1. **Check what's being packaged:**
   ```powershell
   # Manually inspect temp directory
   $TempDir = "$PSScriptRoot\temp_deploy_test"
   New-Item -ItemType Directory -Path $TempDir -Force
   
   # Copy folders manually to see size
   Copy-Item -Path "backend\*" -Destination "$TempDir\backend" -Recurse -Exclude "node_modules"
   Copy-Item -Path "frontend\*" -Destination "$TempDir\frontend" -Recurse -Exclude "node_modules"
   
   # Check total size
   Get-ChildItem $TempDir -Recurse | Measure-Object -Property Length -Sum | 
       Select-Object @{Name="SizeMB";Expression={[math]::Round($_.Sum/1MB,2)}}
   
   # Cleanup
   Remove-Item $TempDir -Recurse -Force
   ```

2. **Expected Size:**
   - With node_modules excluded: **5-15 MB**
   - Without exclusion: **100-150 MB** (too large!)

3. **Verify Exclusions Work:**
   The script should exclude:
   - `node_modules/` directories
   - `*.zip`, `*.exe`, `*.log` files
   - `cf_output.txt`, `cf_stderr.txt`, `cf_stdout.txt`

---

### Issue 7: SCP Transfer Fails

**Error Message:**
```
Transfer failed: scp: command not found
or
Connection timed out
```

**Solutions:**

1. **Install OpenSSH Client on Windows:**
   ```powershell
   # Check if SSH client is installed
   Get-WindowsCapability -Online | Where-Object Name -like 'OpenSSH.Client*'
   
   # Install if missing (requires admin)
   Add-WindowsCapability -Online -Name OpenSSH.Client~~~~0.0.1.0
   ```

2. **Test SSH Connectivity:**
   ```powershell
   ssh ecs-agent@192.168.1.94 "echo 'SSH_OK'"
   ```

3. **Setup SSH Key Authentication (Optional but Recommended):**
   ```powershell
   # Generate key pair
   ssh-keygen -t ed25519 -C "deployment-key"
   
   # Copy public key to Pi
   type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh ecs-agent@192.168.1.94 "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
   
   # Test passwordless login
   ssh ecs-agent@192.168.1.94 "echo 'Key auth works!'"
   ```

4. **Use Verbose Mode for Debugging:**
   ```powershell
   scp -v deploy-*.zip ecs-agent@192.168.1.94:/opt/hotel-ecs/
   ```

---

### Issue 8: Containers Start But App Not Responding

**Symptoms:**
- `docker ps` shows containers as "Up"
- Browser shows connection refused or timeout

**Diagnosis:**
```bash
ssh ecs-agent@192.168.1.94
cd /opt/hotel-ecs/app

# Check if ports are listening
ss -tlnp | grep -E ":(3000|5173)"

# Check app logs for errors
docker compose -f docker-compose.prod.yml logs hotel-app

# Check if npm install completed
docker exec hotel-app ls -la /app/backend/node_modules
```

**Solutions:**

1. **Wait for Initialization:**
   The app may still be installing dependencies. Wait 2-3 minutes and retry.

2. **Check Build Logs:**
   ```bash
   docker compose -f docker-compose.prod.yml logs hotel-app | grep -i error
   ```

3. **Manual Rebuild:**
   ```bash
   cd /opt/hotel-ecs/app
   docker compose -f docker-compose.prod.yml down
   docker compose -f docker-compose.prod.yml up -d --build --no-cache
   ```

4. **Check Database File:**
   ```bash
   # Ensure database file exists and is writable
   ls -la /opt/hotel-ecs/data/hotel.db
   chmod 666 /opt/hotel-ecs/data/hotel.db
   ```

---

## 🔧 Emergency Recovery Procedures

### Complete System Reset

If everything is broken and you need to start fresh:

```bash
ssh ecs-agent@192.168.1.94

# 1. Stop everything
cd /opt/hotel-ecs
docker compose -f app/docker-compose.prod.yml down 2>/dev/null || true

# 2. Remove all containers
docker rm -f $(docker ps -aq) 2>/dev/null || true

# 3. Remove all images (optional, saves space)
docker rmi $(docker images -q) 2>/dev/null || true

# 4. Backup data
mv /opt/hotel-ecs/data /opt/hotel-ecs/data_backup_$(date +%Y%m%d)
mv /opt/hotel-ecs/app /opt/hotel-ecs/app_backup_$(date +%Y%m%d)

# 5. Redeploy from Windows
# On Windows PowerShell:
.\deploy-to-pi.ps1
```

### Rollback to Previous Version

```bash
ssh ecs-agent@192.168.1.94
cd /opt/hotel-ecs

# List backups
ls -lt app_backup_*

# Restore most recent backup
LATEST_BACKUP=$(ls -t app_backup_* | head -n1)
rm -rf app
mv "$LATEST_BACKUP" app

# Restart
cd app
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d
```

---

## 📊 Diagnostic Commands Reference

### On Windows (PowerShell)

```powershell
# Check deployment package size
Get-ChildItem deploy-*.zip | Sort-Object LastWriteTime -Descending | 
    Select-Object -First 1 | Format-Table Name, @{Name="SizeMB";Expression={[math]::Round($_.Length/1MB,2)}}, LastWriteTime

# Verify .env file
Get-Content .env | Select-String "CLOUDFLARE_TUNNEL_TOKEN"

# Test network connectivity
Test-Connection 192.168.1.94 -Count 4

# Test endpoints
Invoke-WebRequest http://192.168.1.94:3000/api/health
Invoke-WebRequest http://192.168.1.94:5173
```

### On Raspberry Pi (SSH)

```bash
# Container status
docker compose -f /opt/hotel-ecs/app/docker-compose.prod.yml ps

# Resource usage
docker stats --no-stream

# Disk space
df -h /opt/hotel-ecs

# Memory usage
free -h

# Network ports
ss -tlnp | grep -E ":(3000|5173)"

# View all logs
docker compose -f /opt/hotel-ecs/app/docker-compose.prod.yml logs -f

# View specific service logs
docker compose -f /opt/hotel-ecs/app/docker-compose.prod.yml logs -f hotel-app
docker compose -f /opt/hotel-ecs/app/docker-compose.prod.yml logs -f hotel-tunnel

# Execute commands in container
docker exec -it hotel-app sh
docker exec -it hotel-tunnel sh

# Check environment variables
docker exec hotel-app env | grep TUNNEL
```

---

## ✅ Pre-Deployment Checklist

Before running `.\deploy-to-pi.ps1`, verify:

- [ ] `.env` file exists in project root
- [ ] `CLOUDFLARE_TUNNEL_TOKEN` is set in `.env`
- [ ] Old ZIP files cleaned: `Remove-Item deploy-*.zip -Force`
- [ ] Pi is reachable: `Test-Connection 192.168.1.94`
- [ ] SSH access works: `ssh ecs-agent@192.168.1.94 "echo OK"`
- [ ] No critical processes running on Pi that would be disrupted
- [ ] You have backup of important data

---

## 🆘 Getting Help

If issues persist after trying all solutions above:

1. **Collect Diagnostic Information:**
   ```powershell
   # On Windows
   .\validate-deployment-status.ps1 > C:\temp\validation-output.txt
   
   # On Pi
   ssh ecs-agent@192.168.1.94 '/opt/hotel-ecs/check-pi-status.sh > /tmp/status-output.txt'
   scp ecs-agent@192.168.1.94:/tmp/status-output.txt C:\temp\
   ```

2. **Gather Logs:**
   ```bash
   ssh ecs-agent@192.168.1.94
   cd /opt/hotel-ecs/app
   docker compose -f docker-compose.prod.yml logs --tail=100 > /tmp/full-logs.txt
   ```

3. **Document:**
   - Full error messages (copy/paste exact text)
   - Timestamp of occurrence
   - Steps already attempted
   - Current system state (container status, disk space, etc.)

4. **Review Documentation:**
   - `DEPLOYMENT_TESTING_GUIDE.md` - Comprehensive deployment guide
   - `QUICK_DEPLOY_REFERENCE.md` - Quick command reference
   - `HOTFIX_DEPLOYMENT_GUIDE.md` - Hotfix procedures

---

**Last Updated:** 2026-07-21  
**Version:** 2.1 (With Container Conflict Resolution)  
**Maintainer:** Hotel-ECS Engineering Team
