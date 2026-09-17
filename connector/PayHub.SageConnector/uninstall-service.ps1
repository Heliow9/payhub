$serviceName = "PayHub Sage Connector"
$service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($service) { Stop-Service $serviceName -Force -ErrorAction SilentlyContinue; sc.exe delete "$serviceName"; Write-Host "Serviço removido." } else { Write-Host "Serviço não encontrado." }
