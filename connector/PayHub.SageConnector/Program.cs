using Microsoft.Extensions.Options;
using PayHub.SageConnector;

var builder = Host.CreateApplicationBuilder(args);

builder.Services.AddWindowsService(options =>
{
    options.ServiceName = "PayHub Sage Connector";
});

builder.Services.Configure<PayHubOptions>(builder.Configuration.GetSection(PayHubOptions.SectionName));
builder.Services.Configure<SageOptions>(builder.Configuration.GetSection(SageOptions.SectionName));

builder.Services.AddHttpClient<PayHubApiClient>((services, client) =>
{
    var options = services.GetRequiredService<IOptions<PayHubOptions>>().Value;
    client.BaseAddress = new Uri(options.ApiBaseUrl.TrimEnd('/') + "/");
    client.Timeout = TimeSpan.FromMinutes(5);
});

builder.Services.AddSingleton<SageReadOnlyClient>();
builder.Services.AddHostedService<Worker>();

await builder.Build().RunAsync();
