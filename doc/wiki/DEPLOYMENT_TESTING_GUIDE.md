# Hotel-ECS Deployment Testing Guide

## 📋 Overview

This guide provides step-by-step instructions for testing the optimized deployment process to Raspberry Pi. The deployment script has been enhanced to skip `node_modules` and large files, reducing package size from ~100 MB to just a few MB.

---

## ✅ Pre-Deployment Checklist

### 1. Verify Environment Configuration

```powershell
# Check if .env file exists and contains Cloudflare Tunnel Token
cd "C:\Users\Nithep\ไดรฟ์ของฉัน (cnithep@gmail.com)\Hotel-ECS"
Get-Content .env | Select-String "CLOUDFLARE_TUNNEL_TOKEN"
```

**Expected Output:**
```
CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoiOWMxNGI5NTE5OWU1YTM2YzZlOWNiYmZkNGRkNGYzOWQi...
```

If missing, add this line to `.env`:
```text
CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoiOWMxNGI5NTE5OWU1YTM2YzZlOWNiYmZkNGRkNGYzOWQiLCJ0IjoiNDVlMDQwYTEtNWI2Zi00ZGE2LWJiNjUtN2ExNmVmOGExNzYyIiwicyI6Ik1USXpaVFl5TldNdE16TTVZeTAwTldWaUxXRmpZMk10WlRnd05URTVPRGhqT1RZNE5HTmpPREV6WXpVdFlqQTVZaTAwTVdNeUxXRTFNek10TldNMFpXWTNNalprTnpVeSJ9
```

### 2. Clean Old Deployment Files

```powershell
# Remove old ZIP files
Remove-Item deploy-*.zip -Force -ErrorAction SilentlyContinue

# Verify cleanup
Get-ChildItem deploy-*.zip
```

### 3. Test Network Connectivity

```powershell
# Ping Raspberry Pi
Test-Connection -ComputerName 192.168.1.94 -Count 4

# Expected: All packets should return successfully
```

---

## 🚀 Deployment Execution

### Option A: Full Deployment with Timing

```powershell
cd "C:\Users\Nithep\ไดรฟ์ของฉัน (cnithep@gmail.com)\Hotel-ECS"

# Measure execution time
Measure-Command { .\deploy-to-pi.ps1 }
```

### Option B: Standard Deployment

```powershell
.\deploy-to-pi.ps1
```

**Expected Output:**
```
========================================
Hotel-ECS Deployment to Raspberry Pi
========================================

[1/5] Creating deployment package...
Package created: deploy-20260721-HHmmss.zip    ← Should complete in <10 seconds

[2/5] Transferring to Raspberry Pi (192.168.1.94)...
Transfer complete

[3/5] Deploying on Raspberry Pi...
Stopping containers...
Creating backup...
Extracting new version...
Starting containers...

[4/5] Verifying deployment...
NAME                STATUS
hotel-app           Up
hotel-tunnel        Up

[5/5] Cleaning up...
Cleanup complete

========================================
Deployment Complete!
========================================
```

---

## 🔍 Post-Deployment Verification

### Method 1: Automated Validation Script

```powershell
# Run comprehensive validation
.\validate-deployment-status.ps1
```

This script checks:
- ✅ Network connectivity
- ✅ SSH access
- ✅ Docker container status
- ✅ Cloudflare Tunnel logs
- ✅ Application endpoints (frontend/backend)
- ✅ Disk space usage

### Method 2: Manual Verification via SSH

```bash
# Connect to Raspberry Pi
ssh ecs-agent@192.168.1.94

# Navigate to application directory
cd /opt/hotel-ecs/app

# Check container status
docker compose -f docker-compose.prod.yml ps

# Expected output:
# NAME                STATUS          PORTS
# hotel-app           Up (healthy)    0.0.0.0:3000->3000/tcp, 0.0.0.0:5173->5173/tcp
# hotel-tunnel        Up              (Cloudflare tunnel ports)
```

### Method 3: Quick Status Check Script

```bash
# Run the quick status checker
ssh ecs-agent@192.168.1.94 'bash -s' < check-pi-status.sh
```

Or copy and run directly on Pi:
```bash
scp check-pi-status.sh ecs-agent@192.168.1.94:/tmp/
ssh ecs-agent@192.168.1.94
chmod +x /tmp/check-pi-status.sh
/tmp/check-pi-status.sh
```

---

## 🌐 Access Testing

### 1. Local Network Access

Open browser and navigate to:
- **Frontend**: http://192.168.1.94:5173
- **Backend API**: http://192.168.1.94:3000/api/health

**Expected Results:**
- Frontend: Dashboard loads with dark theme, no "black screen" errors
- Backend: Returns JSON health check response

### 2. Cloudflare Tunnel Access

Check tunnel status:
```bash
ssh ecs-agent@192.168.1.94
cd /opt/hotel-ecs/app
docker compose -f docker-compose.prod.yml logs hotel-tunnel | grep -i "connected"
```

If connected, access via your Cloudflare domain (check Cloudflare dashboard for URL).

---

## 🐛 Troubleshooting Guide

### Issue 1: Package Creation Takes Too Long (>30 seconds)

**Symptoms:** Script hangs at "[1/5] Creating deployment package..."

**Solutions:**
```powershell
# Check what's being packaged
$TempDir = "$PSScriptRoot\temp_deploy"
New-Item -ItemType Directory -Path $TempDir -Force

# Manually copy folders to inspect size
Copy-Item -Path "backend\*" -Destination "$TempDir\backend" -Recurse -Exclude "node_modules"
Copy-Item -Path "frontend\*" -Destination "$TempDir\frontend" -Recurse -Exclude "node_modules"

# Check total size
Get-ChildItem $TempDir -Recurse | Measure-Object -Property Length -Sum | 
    Select-Object @{Name="SizeMB";Expression={[math]::Round($_.Sum/1MB,2)}}

# Cleanup
Remove-Item $TempDir -Recurse -Force
```

### Issue 2: SCP Transfer Fails

**Symptoms:** "Transfer failed" or timeout during [2/5]

**Solutions:**
```powershell
# Test SSH manually
ssh ecs-agent@192.168.1.94 "echo 'SSH_OK'"

# If password required, setup SSH key authentication
ssh-keygen -t ed25519 -C "deployment-key"
ssh-copy-id ecs-agent@192.168.1.94

# Retry with verbose output
scp -v deploy-*.zip ecs-agent@192.168.1.94:/opt/hotel-ecs/
```

### Issue 3: Containers Not Starting

**Symptoms:** `docker compose ps` shows containers as "Exited" or "Restarting"

**Solutions:**
```bash
ssh ecs-agent@192.168.1.94
cd /opt/hotel-ecs/app

# Check logs for errors
docker compose -f docker-compose.prod.yml logs hotel-app
docker compose -f docker-compose.prod.yml logs hotel-tunnel

# Common fix: Restart with fresh build
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d --build

# Verify environment variables loaded
docker compose -f docker-compose.prod.yml config | grep TUNNEL_TOKEN
```

### Issue 4: Cloudflare Tunnel Not Connecting

**Symptoms:** Tunnel logs show "Authentication failed" or "Invalid token"

**Solutions:**
```bash
# On Windows - verify .env has correct token
Get-Content .env | Select-String "CLOUDFLARE_TUNNEL_TOKEN"

# On Pi - check if token was transferred correctly
ssh ecs-agent@192.168.1.94
cd /opt/hotel-ecs/app
cat .env | grep CLOUDFLARE_TUNNEL_TOKEN

# Restart tunnel service
docker compose -f docker-compose.prod.yml restart hotel-tunnel
docker compose -f docker-compose.prod.yml logs -f hotel-tunnel
```

### Issue 5: Frontend Shows Black Screen

**Symptoms:** Page loads but displays black/blank screen

**Solutions:**
```bash
# Check frontend build artifacts exist
ssh ecs-agent@192.168.1.94
ls -la /opt/hotel-ecs/app/frontend/dist/

# Rebuild frontend
cd /opt/hotel-ecs/app/frontend
npm install
npm run build

# Restart app container
docker compose -f docker-compose.prod.yml restart hotel-app
```

---

## 📊 Performance Benchmarks

### Expected Deployment Times

| Step | Expected Time | Notes |
|------|--------------|-------|
| Package Creation | < 10 seconds | After node_modules exclusion |
| SCP Transfer | 5-30 seconds | Depends on network speed |
| Container Stop | 5-10 seconds | Graceful shutdown |
| Backup Creation | 2-5 seconds | Rename existing directory |
| Extraction | 5-15 seconds | Unzip deployment package |
| Container Start | 30-60 seconds | Build and initialize services |
| **Total** | **~1-2 minutes** | Typical successful deployment |

### Package Size Comparison

| Before Optimization | After Optimization | Reduction |
|---------------------|-------------------|-----------|
| ~100-150 MB | ~5-15 MB | ~90% smaller |

---

## 📝 Logging and Audit Trail

### Save Deployment Results

After successful deployment, update the project timeline:

```powershell
# Add entry to docs/wiki/project_timeline.md
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$entry = @"

## $timestamp - Successful Deployment

- **Optimization**: Excluded node_modules and large files from deployment package
- **Package Size**: Reduced from ~100 MB to ~10 MB
- **Deployment Time**: Approximately 1-2 minutes
- **Status**: ✅ All containers running, Cloudflare Tunnel connected
- **Validated By**: Automated validation script
"@

Add-Content -Path "docs/wiki/project_timeline.md" -Value $entry
```

### Deployment Log Location

On Raspberry Pi:
```bash
# View all logs
docker compose -f docker-compose.prod.yml logs -f

# View specific service
docker compose -f docker-compose.prod.yml logs -f hotel-app
docker compose -f docker-compose.prod.yml logs -f hotel-tunnel

# Export logs for debugging
docker compose -f docker-compose.prod.yml logs > /tmp/deployment-logs.txt
```

---

## ✅ Success Criteria Checklist

Use this checklist to confirm successful deployment:

- [ ] **Network**: Pi responds to ping at 192.168.1.94
- [ ] **SSH**: Can connect via `ssh ecs-agent@192.168.1.94`
- [ ] **Package**: ZIP file created in < 10 seconds
- [ ] **Transfer**: SCP completes without errors
- [ ] **Containers**: Both `hotel-app` and `hotel-tunnel` show "Up" status
- [ ] **Backend**: http://192.168.1.94:3000/api/health returns 200 OK
- [ ] **Frontend**: http://192.168.1.94:5173 loads without errors
- [ ] **Tunnel**: Cloudflare Tunnel logs show "Connected" status
- [ ] **Resources**: Disk usage < 80%, memory available
- [ ] **No Errors**: No critical errors in container logs

---

## 🔄 Rollback Procedure

If deployment fails, rollback to previous version:

```bash
ssh ecs-agent@192.168.1.94
cd /opt/hotel-ecs

# List backups
ls -lt app_backup_*

# Restore most recent backup
LATEST_BACKUP=$(ls -t app_backup_* | head -n1)
rm -rf app
mv "$LATEST_BACKUP" app

# Restart containers
cd app
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d
```

---

## 📞 Support and Escalation

If issues persist after following this guide:

1. **Collect Diagnostic Information:**
   ```powershell
   # On Windows
   .\validate-deployment-status.ps1 > validation-output.txt
   
   # On Pi
   ssh ecs-agent@192.168.1.94 '/tmp/check-pi-status.sh > /tmp/status-output.txt'
   scp ecs-agent@192.168.1.94:/tmp/status-output.txt .
   ```

2. **Review Logs:**
   - Container logs: `docker compose logs --tail=100`
   - System logs: `journalctl -u docker.service`
   - Network logs: `dmesg | grep eth0`

3. **Document Findings:**
   - Error messages (full text)
   - Timestamp of occurrence
   - Steps already attempted
   - Current system state

---

## 🎯 Next Steps

After successful deployment verification:

1. ✅ Update `docs/wiki/project_timeline.md` with deployment results
2. ✅ Test end-to-end user flows (check-in, check-out, QR scanning)
3. ✅ Monitor system for 24 hours for stability
4. ✅ Document any issues encountered and solutions applied
5. ✅ Share deployment metrics with team

---

**Last Updated:** 2026-07-21  
**Version:** 2.0 (Optimized Deployment)  
**Maintainer:** Hotel-ECS Engineering Team
