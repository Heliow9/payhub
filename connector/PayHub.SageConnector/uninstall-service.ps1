param([string]$ServiceName = "PayHub Sage Connector")
$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $service) {
  Write-Host "Serviço não instalado."
  exit 0
}
if ($service.Status -ne 'Stopped') { Stop-Service -Name $ServiceName -Force }
sc.exe delete "$ServiceName" | Out-Host
Write-Host "Serviço removido."
