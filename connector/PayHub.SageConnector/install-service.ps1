param(
  [string]$InstallDir = "C:\PayHub\SageConnector",
  [string]$ServiceName = "PayHub Sage Connector"
)

$ErrorActionPreference = "Stop"
$exe = Join-Path $InstallDir "PayHub.SageConnector.exe"
$config = Join-Path $InstallDir "appsettings.json"

if (-not (Test-Path $exe)) { throw "Executável não encontrado: $exe" }
if (-not (Test-Path $config)) { throw "Configuração não encontrada: $config" }

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
  if ($existing.Status -ne 'Stopped') { Stop-Service -Name $ServiceName -Force }
  sc.exe delete "$ServiceName" | Out-Host
  Start-Sleep -Seconds 2
}

# Restringe o arquivo que contém o token do PayHub e a credencial SQL.
icacls $config /inheritance:r /grant:r "*S-1-5-18:(R)" "*S-1-5-32-544:(R)" | Out-Host

sc.exe create "$ServiceName" binPath= "`"$exe`"" start= auto | Out-Host
sc.exe description "$ServiceName" "Integração somente leitura entre Sage_Gestao_Contabil e PayHub" | Out-Host
sc.exe failure "$ServiceName" reset= 86400 actions= restart/5000/restart/15000/restart/60000 | Out-Host
sc.exe start "$ServiceName" | Out-Host

Write-Host "Serviço instalado. Use: sc.exe query `"$ServiceName`""
