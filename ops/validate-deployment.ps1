# Pre-Deployment Environment Validation Script
# Run this before deploying to ensure all required environment variables are set

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Hotel-ECS Pre-Deployment Validation" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$projectRoot = $PSScriptRoot
$errors = @()
$warnings = @()

# Check 1: Root .env file exists
Write-Host "[1/5] Checking root .env file..." -ForegroundColor Yellow
$rootEnvPath = Join-Path $projectRoot ".env"
if (Test-Path $rootEnvPath) {
    Write-Host "  [OK] Root .env file exists" -ForegroundColor Green
    
    # Check for Cloudflare token
    $rootEnvContent = Get-Content $rootEnvPath
    if ($rootEnvContent -match "CLOUDFLARE_TUNNEL_TOKEN=") {
        Write-Host "  [OK] CLOUDFLARE_TUNNEL_TOKEN found in root .env" -ForegroundColor Green
    } else {
        $errors += "CLOUDFLARE_TUNNEL_TOKEN missing from root .env file"
        Write-Host "  [ERROR] CLOUDFLARE_TUNNEL_TOKEN NOT found in root .env" -ForegroundColor Red
    }
} else {
    $errors += "Root .env file does not exist"
    Write-Host "  [ERROR] Root .env file NOT found" -ForegroundColor Red
}

Write-Host ""

# Check 2: Backend .env file exists and has token
Write-Host "[2/5] Checking backend .env file..." -ForegroundColor Yellow
$backendEnvPath = Join-Path $projectRoot "backend\.env"
if (Test-Path $backendEnvPath) {
    Write-Host "  [OK] Backend .env file exists" -ForegroundColor Green
    
    $backendEnvContent = Get-Content $backendEnvPath
    if ($backendEnvContent -match "CLOUDFLARE_TUNNEL_TOKEN=") {
        Write-Host "  [OK] CLOUDFLARE_TUNNEL_TOKEN found in backend .env" -ForegroundColor Green
        
        # Extract tokens for comparison
        $rootTokenMatch = $rootEnvContent | Select-String "CLOUDFLARE_TUNNEL_TOKEN="
        $backendTokenMatch = $backendEnvContent | Select-String "CLOUDFLARE_TUNNEL_TOKEN="
        
        if ($rootTokenMatch -and $backendTokenMatch) {
            $rootToken = $rootTokenMatch.Line.Split('=')[1]
            $backendToken = $backendTokenMatch.Line.Split('=')[1]
            
            if ($rootToken -eq $backendToken) {
                Write-Host "  [OK] Tokens match in both locations" -ForegroundColor Green
            } else {
                $warnings += "CLOUDFLARE_TUNNEL_TOKEN values differ between root and backend .env files"
                Write-Host "  [WARNING] Token mismatch detected!" -ForegroundColor Yellow
                $rootPreview = if ($rootToken.Length -gt 20) { $rootToken.Substring(0, 20) + "..." } else { $rootToken }
                $backendPreview = if ($backendToken.Length -gt 20) { $backendToken.Substring(0, 20) + "..." } else { $backendToken }
                Write-Host "    Root:     $rootPreview" -ForegroundColor Gray
                Write-Host "    Backend:  $backendPreview" -ForegroundColor Gray
            }
        }
    } else {
        $errors += "CLOUDFLARE_TUNNEL_TOKEN missing from backend .env file"
        Write-Host "  [ERROR] CLOUDFLARE_TUNNEL_TOKEN NOT found in backend .env" -ForegroundColor Red
    }
} else {
    $errors += "Backend .env file does not exist"
    Write-Host "  [ERROR] Backend .env file NOT found" -ForegroundColor Red
}

Write-Host ""

# Check 3: Other critical environment variables
Write-Host "[3/5] Checking other critical variables..." -ForegroundColor Yellow
$criticalVars = @(
    "PORT",
    "PBX_MODE",
    "JWT_SECRET",
    "TELEGRAM_BOT_TOKEN"
)

$missingVars = @()
$backendEnvContent = Get-Content $backendEnvPath -ErrorAction SilentlyContinue
if ($backendEnvContent) {
    foreach ($var in $criticalVars) {
        $pattern = "^$var="
        $found = $false
        foreach ($line in $backendEnvContent) {
            if ($line -match $pattern) {
                $found = $true
                break
            }
        }
        if (-not $found) {
            $missingVars += $var
        }
    }
}

if ($missingVars.Count -eq 0) {
    Write-Host "  [OK] All critical variables present" -ForegroundColor Green
} else {
    $warnings += "Missing optional variables: $($missingVars -join ', ')"
    Write-Host "  [WARNING] Some variables missing: $($missingVars -join ', ')" -ForegroundColor Yellow
}

Write-Host ""

# Check 4: Deployment script exists
Write-Host "[4/5] Checking deployment script..." -ForegroundColor Yellow
$deployScriptPath = Join-Path $projectRoot "deploy-to-pi.ps1"
if (Test-Path $deployScriptPath) {
    Write-Host "  [OK] deploy-to-pi.ps1 exists" -ForegroundColor Green
} else {
    $errors += "Deployment script not found"
    Write-Host "  [ERROR] deploy-to-pi.ps1 NOT found" -ForegroundColor Red
}

Write-Host ""

# Check 5: Docker Compose configuration
Write-Host "[5/5] Checking Docker Compose configuration..." -ForegroundColor Yellow
$composePath = Join-Path $projectRoot "docker-compose.prod.yml"
if (Test-Path $composePath) {
    Write-Host "  [OK] docker-compose.prod.yml exists" -ForegroundColor Green
    
    $composeContent = Get-Content $composePath -Raw
    if ($composeContent -match "TUNNEL_TOKEN") {
        Write-Host "  [OK] TUNNEL_TOKEN reference found in compose file" -ForegroundColor Green
    } else {
        $warnings += "TUNNEL_TOKEN not referenced in docker-compose.prod.yml"
        Write-Host "  [WARNING] TUNNEL_TOKEN reference NOT found in compose file" -ForegroundColor Yellow
    }
} else {
    $errors += "Docker Compose production file not found"
    Write-Host "  [ERROR] docker-compose.prod.yml NOT found" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Validation Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if ($errors.Count -gt 0) {
    Write-Host "[ERROR] ERRORS FOUND ($($errors.Count)):" -ForegroundColor Red
    foreach ($error in $errors) {
        Write-Host "  - $error" -ForegroundColor Red
    }
    Write-Host ""
    Write-Host "[CRITICAL] DEPLOYMENT SHOULD NOT PROCEED UNTIL ERRORS ARE FIXED" -ForegroundColor Red
    exit 1
} else {
    Write-Host "[OK] No errors found" -ForegroundColor Green
}

if ($warnings.Count -gt 0) {
    Write-Host ""
    Write-Host "[WARNING] WARNINGS ($($warnings.Count)):" -ForegroundColor Yellow
    foreach ($warning in $warnings) {
        Write-Host "  - $warning" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "[SUCCESS] System is ready for deployment!" -ForegroundColor Green
Write-Host ""
Write-Host "To deploy, run: .\deploy-to-pi.ps1" -ForegroundColor White
