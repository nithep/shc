# Check Cloudflare Tunnel Status on Raspberry Pi
# Run this script after deployment to verify tunnel connectivity

$PiUser = "ecs-agent"
$PiHost = "192.168.1.94"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Cloudflare Tunnel Status Check" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Checking tunnel logs..." -ForegroundColor Yellow
Write-Host ""

$checkCmd = "cd '/home/ecs-agent/nithep/shc' ; docker compose -f docker-compose.prod.yml logs --tail=50 hotel-tunnel"

try {
    $logs = ssh "${PiUser}@${PiHost}" $checkCmd
    Write-Host $logs
    
    # Check for successful connection indicators
    if ($logs -match "Connected") {
        Write-Host ""
        Write-Host "✓ Tunnel is CONNECTED and operational!" -ForegroundColor Green
    } elseif ($logs -match "error|Error|ERROR|failed|Failed|FAILED") {
        Write-Host ""
        Write-Host "✗ Tunnel encountered errors. Check logs above." -ForegroundColor Red
    } else {
        Write-Host ""
        Write-Host "? Tunnel status unclear. Review logs above." -ForegroundColor Yellow
    }
} catch {
    Write-Host "Failed to connect to Raspberry Pi: $_" -ForegroundColor Red
    Write-Host "Make sure you have SSH access to ${PiHost}" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "To view live logs, run:" -ForegroundColor Gray
Write-Host "  ssh ${PiUser}@${PiHost}" -ForegroundColor Gray
Write-Host "  cd /home/ecs-agent/nithep/shc && docker compose -f docker-compose.prod.yml logs -f hotel-tunnel" -ForegroundColor Gray
