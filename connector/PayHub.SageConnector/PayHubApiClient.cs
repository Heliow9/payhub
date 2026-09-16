using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace PayHub.SageConnector;

public sealed record ImportJobDto(
    long Id,
    long RequestedByUserId,
    long? ConnectorId,
    string JobType,
    string Status,
    JsonElement? Scope,
    int ProgressCurrent,
    int ProgressTotal,
    string? ProgressMessage,
    int AttemptCount,
    DateTimeOffset? ClaimedAt,
    DateTimeOffset? StartedAt,
    DateTimeOffset? FinishedAt,
    string? ErrorMessage,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

internal sealed record JobEnvelope(ImportJobDto Job);

public sealed class PayHubApiClient
{
    private readonly HttpClient _http;
    private readonly PayHubOptions _options;
    private readonly JsonSerializerOptions _json = new(JsonSerializerDefaults.Web);

    public PayHubApiClient(HttpClient http, IOptions<PayHubOptions> options)
    {
        _http = http;
        _options = options.Value;
        if (_options.ConnectorId <= 0) throw new InvalidOperationException("PayHub:ConnectorId deve ser informado.");
        if (string.IsNullOrWhiteSpace(_options.ConnectorToken)) throw new InvalidOperationException("PayHub:ConnectorToken deve ser informado.");
    }

    private HttpRequestMessage Request(HttpMethod method, string path, object? body = null)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.TryAddWithoutValidation("X-PayHub-Connector-Id", _options.ConnectorId.ToString());
        request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _options.ConnectorToken);
        if (body is not null) request.Content = JsonContent.Create(body, options: _json);
        return request;
    }

    private async Task SendNoContentAsync(HttpMethod method, string path, object? body, CancellationToken cancellationToken)
    {
        using var request = Request(method, path, body);
        using var response = await _http.SendAsync(request, cancellationToken);
        response.EnsureSuccessStatusCode();
    }

    public async Task HeartbeatAsync(string machineName, object metadata, CancellationToken cancellationToken)
    {
        using var request = Request(HttpMethod.Post, "api/connector-agent/heartbeat", new { machineName, metadata });
        using var response = await _http.SendAsync(request, cancellationToken);
        response.EnsureSuccessStatusCode();
    }

    public async Task<ImportJobDto?> ClaimNextAsync(CancellationToken cancellationToken)
    {
        using var request = Request(HttpMethod.Post, "api/connector-agent/jobs/next");
        using var response = await _http.SendAsync(request, cancellationToken);
        if (response.StatusCode == HttpStatusCode.NoContent) return null;
        response.EnsureSuccessStatusCode();
        var envelope = await response.Content.ReadFromJsonAsync<JobEnvelope>(_json, cancellationToken);
        return envelope?.Job;
    }

    public Task ProgressAsync(long jobId, int current, int total, string? message, CancellationToken cancellationToken) =>
        SendNoContentAsync(HttpMethod.Post, $"api/connector-agent/jobs/{jobId}/progress", new { current, total, message }, cancellationToken);

    public Task LogAsync(long jobId, string level, string message, object? metadata, CancellationToken cancellationToken) =>
        SendNoContentAsync(HttpMethod.Post, $"api/connector-agent/jobs/{jobId}/logs", new { level, message, metadata }, cancellationToken);

    public Task SendBatchAsync(long jobId, string sourceTable, int batchNumber, IReadOnlyList<Dictionary<string, object?>> rows, CancellationToken cancellationToken) =>
        SendNoContentAsync(HttpMethod.Post, $"api/connector-agent/jobs/{jobId}/batches", new { sourceTable, batchNumber, rows }, cancellationToken);

    public Task SendDiscoveryBatchAsync(long jobId, IReadOnlyList<Dictionary<string, object?>> rows, CancellationToken cancellationToken) =>
        SendNoContentAsync(HttpMethod.Post, $"api/connector-agent/jobs/{jobId}/batches", new { sourceTable = "SchemaDiscovery", batchNumber = 0, rows }, cancellationToken);

    public Task SendConnectionBatchAsync(long jobId, IReadOnlyList<Dictionary<string, object?>> rows, CancellationToken cancellationToken) =>
        SendNoContentAsync(HttpMethod.Post, $"api/connector-agent/jobs/{jobId}/batches", new { sourceTable = "ConnectionTest", batchNumber = 0, rows }, cancellationToken);

    public Task CompleteAsync(long jobId, string? message, CancellationToken cancellationToken) =>
        SendNoContentAsync(HttpMethod.Post, $"api/connector-agent/jobs/{jobId}/complete", new { message }, cancellationToken);

    public Task FailAsync(long jobId, string error, CancellationToken cancellationToken) =>
        SendNoContentAsync(HttpMethod.Post, $"api/connector-agent/jobs/{jobId}/fail", new { error }, cancellationToken);
}
