# Hotel-ECS Quick Deployment Reference Card

## 🚀 One-Command Deploy

```powershell
cd "C:\Users\Nithep\ไดรฟ์ของฉัน (cnithep@gmail.com)\Hotel-ECS"
Remove-Item deploy-*.zip -Force -ErrorAction SilentlyContinue
.\deploy-to-pi.ps1
```

## 🔍 Quick Validation

### Windows (PowerShell)
```powershell
# Full automated validation
.\validate-deployment-status.ps1

# Test endpoints manually
Invoke-WebRequest http://192.168.1.94:3000/api/health
Invoke-WebRequest http://192.168.1.94:5173
```

### Raspberry Pi (SSH)
```bash
# Quick status check
ssh ecs-agent@192.168.1.94 'bash -s' < check-pi-status.sh

# Manual checks
ssh ecs-agent@192.168.1.94
cd /opt/hotel-ecs/app
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=20 hotel-tunnel
```

## 🐛 Common Fixes

### Restart Containers
```bash
ssh ecs-agent@192.168.1.94
cd /opt/hotel-ecs/app
docker compose -f docker-compose.prod.yml restart
```

### Rebuild from Scratch
```bash
ssh ecs-agent@192.168.1.94
cd /opt/hotel-ecs/app
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d --build
```

### Check Tunnel Token
```powershell
# Windows
Get-Content .env | Select-String "CLOUDFLARE_TUNNEL_TOKEN"

# Pi
ssh ecs-agent@192.168.1.94 'cat /opt/hotel-ecs/app/.env | grep TUNNEL'
```

### View Live Logs
```bash
ssh ecs-agent@192.168.1.94
cd /opt/hotel-ecs/app
docker compose -f docker-compose.prod.yml logs -f
```

## 📊 Expected Performance

| Metric | Target |
|--------|--------|
| Package Creation | < 10 seconds |
| Total Deployment | 1-2 minutes |
| Package Size | 5-15 MB |
| Frontend Load | < 2 seconds |
| API Response | < 100ms |

## ✅ Success Indicators

- ✓ ZIP file created with timestamp (e.g., `deploy-20260721-125900.zip`)
- ✓ Both containers show "Up" status
- ✓ Tunnel logs contain "Connected"
- ✓ Frontend loads at http://192.168.1.94:5173
- ✓ Backend responds at http://192.168.1.94:3000/api/health

## 🆘 Emergency Contacts

- **Deployment Issues**: Check `DEPLOYMENT_TESTING_GUIDE.md`
- **Tunnel Problems**: Verify token in `.env`, restart tunnel container
- **App Crashes**: Check logs, rollback to previous backup
- **Network Issues**: Verify Pi IP (192.168.1.94), test ping

---

**Tip**: Bookmark this file for quick access during deployments!
