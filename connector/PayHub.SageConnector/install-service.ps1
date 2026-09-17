$ErrorActionPreference = "Stop"
$serviceName = "PayHub Sage Connector"
$base = "C:\PayHub\SageConnector"
$exe = Join-Path $base "PayHub.SageConnector.exe"
$config = Join-Path $base "appsettings.json"
if (!(Test-Path $exe)) { throw "Executável não encontrado: $exe" }
if (!(Test-Path $config)) { throw "appsettings.json não encontrado: $config" }
if (Get-Service -Name $serviceName -ErrorAction SilentlyContinue) { Stop-Service $serviceName -Force -ErrorAction SilentlyContinue; sc.exe delete "$serviceName" | Out-Null; Start-Sleep -Seconds 2 }
New-Service -Name $serviceName -BinaryPathName ('"' + $exe + '"') -DisplayName $serviceName -Description "Conector somente leitura do Sage para o PayHub" -StartupType Automatic
sc.exe failure "$serviceName" reset= 86400 actions= restart/5000/restart/15000/restart/60000 | Out-Null
icacls $config /inheritance:r /grant:r "SYSTEM:(R)" "Administrators:(R)" | Out-Null
Start-Service $serviceName
Get-Service $serviceName
