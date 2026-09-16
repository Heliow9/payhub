namespace PayHub.SageConnector;

public sealed class PayHubOptions
{
    public const string SectionName = "PayHub";
    public string ApiBaseUrl { get; set; } = "https://paayhubapi.duckdns.org";
    public long ConnectorId { get; set; }
    public string ConnectorToken { get; set; } = string.Empty;
    public int PollSeconds { get; set; } = 10;
    public int HeartbeatSeconds { get; set; } = 30;
}

public sealed class SageOptions
{
    public const string SectionName = "Sage";
    public string ConnectionString { get; set; } = string.Empty;
    public int CommandTimeoutSeconds { get; set; } = 120;
    public int BatchSize { get; set; } = 100;
}
