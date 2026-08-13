# Hotel-ECS Quick Reference Card

## 🚀 Deployment Workflow

### Before Deployment
```powershell
# 1. Validate environment configuration
.\validate-deployment.ps1

# Expected output: [SUCCESS] System is ready for deployment!
```

### Deploy to Raspberry Pi
```powershell
# 2. Run deployment script
.\deploy-to-pi.ps1

# This will:
# - Create ZIP package
# - Transfer to Pi (192.168.1.94)
# - Stop containers
# - Extract new version
# - Start containers
# - Show status
```

### After Deployment
```powershell
# 3. Check Cloudflare Tunnel status
.\check-tunnel-status.ps1

# Look for: "✓ Tunnel is CONNECTED and operational!"
```

---

## 🔑 Critical Files

| File | Purpose | Location |
|------|---------|----------|
| `.env` | Cloudflare token for packaging | Project root |
| `backend/.env` | Runtime environment config | `/backend/` |
| `docker-compose.prod.yml` | Production container config | Project root |
| `deploy-to-pi.ps1` | Deployment automation | Project root |

---

## 📋 Environment Variables Checklist

### Required in BOTH `.env` files:
- ✅ `CLOUDFLARE_TUNNEL_TOKEN` - Tunnel authentication
- ✅ `PORT` - Backend server port (3000)
- ✅ `PBX_MODE` - Connection mode (tcp/serial/mock)
- ✅ `JWT_SECRET` - Authentication secret
- ✅ `TELEGRAM_BOT_TOKEN` - Telegram notifications

### Verify tokens match:
```powershell
# Both files should have identical CLOUDFLARE_TUNNEL_TOKEN
Get-Content .env | Select-String "CLOUDFLARE_TUNNEL_TOKEN"
Get-Content backend\.env | Select-String "CLOUDFLARE_TUNNEL_TOKEN"
```

---

## 🔍 Troubleshooting Commands

### Check Container Status on Pi
```bash
ssh ecs-agent@192.168.1.94
cd /opt/hotel-ecs/app
docker compose -f docker-compose.prod.yml ps
```

### View Tunnel Logs
```bash
# Last 50 lines
docker compose -f docker-compose.prod.yml logs --tail=50 hotel-tunnel

# Live streaming
docker compose -f docker-compose.prod.yml logs -f hotel-tunnel
```

### Restart Tunnel Service
```bash
docker compose -f docker-compose.prod.yml restart cloudflare-tunnel
```

### Check Environment Variables in Container
```bash
docker exec hotel-tunnel env | grep TUNNEL
```

### Full System Restart
```bash
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d
```

---

## 🌐 Access URLs

After successful deployment:

- **Local Frontend**: http://192.168.1.94:5173
- **Local Backend API**: http://192.168.1.94:3000
- **Cloudflare Tunnel**: https://your-domain.cloudflareaccess.com

---

## ⚠️ Common Issues & Solutions

### Issue: Tunnel Not Connecting
**Symptoms**: Authentication errors in logs

**Solution**:
1. Verify token in both `.env` files
2. Redeploy: `.\deploy-to-pi.ps1`
3. Check container env: `docker exec hotel-tunnel env | grep TUNNEL`
4. Restart tunnel: `docker compose restart cloudflare-tunnel`

### Issue: Token Mismatch Warning
**Symptoms**: Validation shows different tokens

**Solution**:
1. Copy token from backend/.env to root .env (or vice versa)
2. Ensure exact match (no extra spaces)
3. Re-run validation: `.\validate-deployment.ps1`

### Issue: Deployment Fails at SCP
**Symptoms**: "Transfer failed" error

**Solution**:
1. Verify SSH access: `ssh ecs-agent@192.168.1.94`
2. Check Pi is online: `ping 192.168.1.94`
3. Verify credentials in deploy-to-pi.ps1

### Issue: Missing .env After Deployment
**Symptoms**: Tunnel fails with "Invalid token"

**Solution**:
1. Ensure `.env` exists in project root before deploying
2. Check `.gitignore` doesn't exclude it from ZIP
3. Manually copy to Pi if needed:
   ```bash
   scp backend/.env ecs-agent@192.168.1.94:/opt/hotel-ecs/config/.env
   ```

---

## 🔒 Security Reminders

- ❌ Never commit `.env` files to Git
- ✅ Use `.gitignore` (already configured)
- ✅ Store tokens in password manager
- ✅ Rotate tokens periodically via Cloudflare Dashboard
- ✅ Monitor tunnel logs for unauthorized access

---

## 📞 Support Resources

- **Full Guide**: `CLOUDFLARE_DEPLOYMENT_GUIDE.md`
- **Setup Summary**: `CLOUDFLARE_SETUP_SUMMARY.md`
- **Architecture**: `ARCHITECTURE.md`
- **Security**: `SECURITY.md`

---

## 🎯 Quick Commands Reference

```powershell
# Validate before deploy
.\validate-deployment.ps1

# Deploy to Pi
.\deploy-to-pi.ps1

# Check tunnel
.\check-tunnel-status.ps1

# SSH to Pi
ssh ecs-agent@192.168.1.94

# View all logs
ssh ecs-agent@192.168.1.94 "cd /opt/hotel-ecs/app && docker compose -f docker-compose.prod.yml logs -f"
```

---

**Last Updated**: 2026-07-21  
**Pi Address**: 192.168.1.94  
**Pi User**: ecs-agent  
**Token Status**: ✅ Configured
