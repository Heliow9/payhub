using System.Text.Json;
using Microsoft.Extensions.Options;

namespace PayHub.SageConnector;

public sealed class Worker : BackgroundService
{
    private readonly ILogger<Worker> _logger;
    private readonly PayHubApiClient _api;
    private readonly SageReadOnlyClient _sage;
    private readonly PayHubOptions _options;
    private DateTimeOffset _lastHeartbeat = DateTimeOffset.MinValue;

    public Worker(
        ILogger<Worker> logger,
        PayHubApiClient api,
        SageReadOnlyClient sage,
        IOptions<PayHubOptions> options)
    {
        _logger = logger;
        _api = api;
        _sage = sage;
        _options = options.Value;
        _options.PollSeconds = Math.Clamp(_options.PollSeconds, 3, 300);
        _options.HeartbeatSeconds = Math.Clamp(_options.HeartbeatSeconds, 10, 600);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("PayHub Sage Connector iniciado em {MachineName}", Environment.MachineName);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await SendHeartbeatIfDueAsync(stoppingToken);
                var job = await _api.ClaimNextAsync(stoppingToken);
                if (job is not null) await ExecuteJobAsync(job, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Falha no ciclo do conector.");
            }

            await Task.Delay(TimeSpan.FromSeconds(_options.PollSeconds), stoppingToken);
        }
    }

    private async Task SendHeartbeatIfDueAsync(CancellationToken cancellationToken)
    {
        if (DateTimeOffset.UtcNow - _lastHeartbeat < TimeSpan.FromSeconds(_options.HeartbeatSeconds)) return;
        var metadata = new
        {
            os = Environment.OSVersion.ToString(),
            dotnet = Environment.Version.ToString(),
            processId = Environment.ProcessId,
            connectorVersion = typeof(Worker).Assembly.GetName().Version?.ToString() ?? "1.0.0",
        };
        await _api.HeartbeatAsync(Environment.MachineName, metadata, cancellationToken);
        _lastHeartbeat = DateTimeOffset.UtcNow;
    }

    private async Task ExecuteJobAsync(ImportJobDto job, CancellationToken cancellationToken)
    {
        _logger.LogInformation("Executando job {JobId} ({JobType})", job.Id, job.JobType);
        try
        {
            await _api.LogAsync(job.Id, "INFO", $"Job {job.JobType} iniciado em {Environment.MachineName}.", null, cancellationToken);
            switch (job.JobType)
            {
                case "CONNECTION_TEST":
                    await RunConnectionTestAsync(job, cancellationToken);
                    break;
                case "SCHEMA_DISCOVERY":
                    await RunSchemaDiscoveryAsync(job, cancellationToken);
                    break;
                case "PAYROLL_IMPORT":
                    await RunPayrollImportAsync(job, cancellationToken);
                    break;
                default:
                    throw new InvalidOperationException($"Tipo de job não suportado: {job.JobType}");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Job {JobId} falhou.", job.Id);
            try
            {
                await _api.LogAsync(job.Id, "ERROR", ex.Message, new { exception = ex.GetType().FullName }, cancellationToken);
                await _api.FailAsync(job.Id, ex.Message, cancellationToken);
            }
            catch (Exception reportError)
            {
                _logger.LogError(reportError, "Não foi possível reportar a falha do job {JobId} ao PayHub.", job.Id);
            }
        }
    }

    private async Task RunConnectionTestAsync(ImportJobDto job, CancellationToken cancellationToken)
    {
        await _api.ProgressAsync(job.Id, 0, 1, "Testando conexão somente leitura com o SQL Server…", cancellationToken);
        var row = await _sage.TestConnectionAsync(cancellationToken);
        await _api.SendConnectionBatchAsync(job.Id, [row], cancellationToken);
        await _api.ProgressAsync(job.Id, 1, 1, "Conexão com Sage validada.", cancellationToken);
        await _api.CompleteAsync(job.Id, "Conexão SQL Server validada com sucesso.", cancellationToken);
    }

    private async Task RunSchemaDiscoveryAsync(ImportJobDto job, CancellationToken cancellationToken)
    {
        await _api.ProgressAsync(job.Id, 0, SageReadOnlyClient.AllowedTables.Length, "Lendo metadados do Sage…", cancellationToken);
        var schema = await _sage.DiscoverSchemaAsync(cancellationToken);
        var rows = schema.Select(item => new Dictionary<string, object?>
        {
            ["tableName"] = item.TableName,
            ["columns"] = item.Columns,
            ["rowCount"] = item.RowCount,
        }).ToList();
        await _api.SendDiscoveryBatchAsync(job.Id, rows, cancellationToken);
        await _api.ProgressAsync(job.Id, schema.Count, SageReadOnlyClient.AllowedTables.Length, $"{schema.Count} tabelas Sage identificadas.", cancellationToken);
        await _api.CompleteAsync(job.Id, "Descoberta do schema concluída.", cancellationToken);
    }

    private async Task RunPayrollImportAsync(ImportJobDto job, CancellationToken cancellationToken)
    {
        if (!job.Scope.HasValue || job.Scope.Value.ValueKind != JsonValueKind.Object)
            throw new InvalidOperationException("PAYROLL_IMPORT sem escopo válido.");

        var scope = JsonSerializer.Deserialize<PayrollImportScope>(job.Scope.Value.GetRawText(), new JsonSerializerOptions(JsonSerializerDefaults.Web)
        {
            PropertyNameCaseInsensitive = true,
        }) ?? throw new InvalidOperationException("Não foi possível interpretar o escopo do job.");

        if (scope.CompanyCode.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null)
            throw new InvalidOperationException("companyCode é obrigatório para PAYROLL_IMPORT.");

        var tableIndex = 0;
        var batches = 0;
        string? currentTable = null;
        await _api.ProgressAsync(job.Id, 0, SageReadOnlyClient.AllowedTables.Length, "Iniciando leitura da folha no Sage…", cancellationToken);

        await foreach (var batch in _sage.ReadPayrollAsync(scope, cancellationToken))
        {
            await SendHeartbeatIfDueAsync(cancellationToken);
            if (!string.Equals(currentTable, batch.Table, StringComparison.OrdinalIgnoreCase))
            {
                currentTable = batch.Table;
                tableIndex++;
            }
            await _api.SendBatchAsync(job.Id, batch.Table, batch.BatchNumber, batch.Rows, cancellationToken);
            batches++;
            await _api.ProgressAsync(job.Id, tableIndex, SageReadOnlyClient.AllowedTables.Length, $"{batch.Table}: lote {batch.BatchNumber + 1} enviado ({batch.Rows.Count} linhas).", cancellationToken);
        }

        await _api.LogAsync(job.Id, "INFO", "Leitura bruta do Sage concluída.", new { batches }, cancellationToken);
        await _api.ProgressAsync(job.Id, SageReadOnlyClient.AllowedTables.Length, SageReadOnlyClient.AllowedTables.Length, $"Importação bruta concluída com {batches} lotes.", cancellationToken);
        await _api.CompleteAsync(job.Id, $"Importação bruta concluída com {batches} lotes.", cancellationToken);
    }
}
