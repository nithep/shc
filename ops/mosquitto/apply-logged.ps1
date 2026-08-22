# ==============================================================================
# apply-logged.ps1 — Run setup-auth-tls.ps1 (elevated) and capture output to apply.log
# This wrapper is meant to be launched elevated (UAC) so the child inherits admin.
# ==============================================================================
$ErrorActionPreference = 'Continue'
$log   = Join-Path $PSScriptRoot 'apply.log'
$setup = Join-Path $PSScriptRoot 'setup-auth-tls.ps1'

Remove-Item $log -ErrorAction SilentlyContinue
"==== apply started $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ====" | Out-File $log -Encoding utf8

# Run setup in a CHILD powershell so its `exit` codes don't kill this wrapper
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $setup 2>&1 | Tee-Object -FilePath $log -Append
$code = $LASTEXITCODE
if ($null -eq $code) { $code = 0 }

"==== apply finished (exit=$code) $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ====" | Out-File $log -Encoding utf8 -Append
exit $code
