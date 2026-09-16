using System.Data;
using System.Text.Json;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Options;

namespace PayHub.SageConnector;

public sealed record PayrollImportScope(
    JsonElement CompanyCode,
    JsonElement? EmployeeCode,
    int? Year,
    int? Month,
    int[]? Types,
    bool FromAdmission = false);

public sealed record SageTableSchema(string TableName, IReadOnlyList<string> Columns, long RowCount);

public sealed class SageReadOnlyClient
{
    public static readonly string[] AllowedTables =
    [
        "Funcionario",
        "FunDocumento",
        "FunFuncional",
        "FunSalario",
        "ProcEvento",
        "EventoGVigencia",
        "ProcBase",
        "MovCapa",
        "MovEvento",
    ];

    private readonly SageOptions _options;

    public SageReadOnlyClient(IOptions<SageOptions> options)
    {
        _options = options.Value;
        if (string.IsNullOrWhiteSpace(_options.ConnectionString)) throw new InvalidOperationException("Sage:ConnectionString deve ser informada.");
        _options.BatchSize = Math.Clamp(_options.BatchSize, 10, 500);
        _options.CommandTimeoutSeconds = Math.Clamp(_options.CommandTimeoutSeconds, 30, 600);
    }

    private SqlConnection CreateConnection()
    {
        var builder = new SqlConnectionStringBuilder(_options.ConnectionString)
        {
            ApplicationName = "PayHub.SageConnector",
            ApplicationIntent = ApplicationIntent.ReadOnly,
        };
        return new SqlConnection(builder.ConnectionString);
    }

    public async Task<Dictionary<string, object?>> TestConnectionAsync(CancellationToken cancellationToken)
    {
        await using var connection = CreateConnection();
        await connection.OpenAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandTimeout = _options.CommandTimeoutSeconds;
        command.CommandText = "SELECT CAST(SERVERPROPERTY('ProductVersion') AS nvarchar(128)) AS product_version, DB_NAME() AS database_name, @@SERVERNAME AS server_name";
        await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
        if (!await reader.ReadAsync(cancellationToken)) throw new InvalidOperationException("SQL Server não retornou informações da conexão.");
        return ReadRow(reader);
    }

    public async Task<IReadOnlyList<SageTableSchema>> DiscoverSchemaAsync(CancellationToken cancellationToken)
    {
        await using var connection = CreateConnection();
        await connection.OpenAsync(cancellationToken);
        var result = new List<SageTableSchema>();

        foreach (var table in AllowedTables)
        {
            var columns = await GetColumnsAsync(connection, table, cancellationToken);
            if (columns.Count == 0) continue;
            await using var count = connection.CreateCommand();
            count.CommandTimeout = _options.CommandTimeoutSeconds;
            count.CommandText = $"SELECT COUNT_BIG(1) FROM [{table}]";
            var value = await count.ExecuteScalarAsync(cancellationToken);
            result.Add(new SageTableSchema(table, columns, Convert.ToInt64(value ?? 0)));
        }

        return result;
    }

    public async IAsyncEnumerable<(string Table, int BatchNumber, List<Dictionary<string, object?>> Rows)> ReadPayrollAsync(
        PayrollImportScope scope,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var companyCode = JsonScalar(scope.CompanyCode);
        var employeeCode = scope.EmployeeCode.HasValue ? JsonScalar(scope.EmployeeCode.Value) : null;

        await using var connection = CreateConnection();
        await connection.OpenAsync(cancellationToken);

        foreach (var table in AllowedTables)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var columns = await GetColumnsAsync(connection, table, cancellationToken);
            if (columns.Count == 0) continue;
            var isGlobalReferenceTable = string.Equals(table, "EventoGVigencia", StringComparison.OrdinalIgnoreCase);
            if (!isGlobalReferenceTable && !columns.Contains("cd_empresa", StringComparer.OrdinalIgnoreCase))
                throw new InvalidOperationException($"Tabela {table} existe, mas não possui cd_empresa; leitura ampla bloqueada por segurança.");

            await using var command = connection.CreateCommand();
            command.CommandTimeout = _options.CommandTimeoutSeconds;
            var predicates = new List<string>();

            if (columns.Contains("cd_empresa", StringComparer.OrdinalIgnoreCase))
            {
                predicates.Add("CONVERT(nvarchar(100), [cd_empresa]) = @companyCode");
                command.Parameters.Add(new SqlParameter("@companyCode", SqlDbType.NVarChar, 100) { Value = companyCode });
            }
            if (employeeCode is not null && columns.Contains("cd_funcionario", StringComparer.OrdinalIgnoreCase))
            {
                predicates.Add("CONVERT(nvarchar(100), [cd_funcionario]) = @employeeCode");
                command.Parameters.Add(new SqlParameter("@employeeCode", SqlDbType.NVarChar, 100) { Value = employeeCode });
            }
            if (!scope.FromAdmission && scope.Year.HasValue && columns.Contains("ano", StringComparer.OrdinalIgnoreCase))
            {
                predicates.Add("[ano] = @year");
                command.Parameters.Add(new SqlParameter("@year", SqlDbType.Int) { Value = scope.Year.Value });
            }
            if (!scope.FromAdmission && scope.Month.HasValue && columns.Contains("mes", StringComparer.OrdinalIgnoreCase))
            {
                predicates.Add("[mes] = @month");
                command.Parameters.Add(new SqlParameter("@month", SqlDbType.Int) { Value = scope.Month.Value });
            }
            if (scope.Types is { Length: > 0 } && columns.Contains("tipo", StringComparer.OrdinalIgnoreCase))
            {
                var typeParams = new List<string>();
                for (var i = 0; i < scope.Types.Length; i++)
                {
                    var name = $"@type{i}";
                    typeParams.Add(name);
                    command.Parameters.Add(new SqlParameter(name, SqlDbType.Int) { Value = scope.Types[i] });
                }
                predicates.Add($"[tipo] IN ({string.Join(",", typeParams)})");
            }

            var where = predicates.Count > 0 ? " WHERE " + string.Join(" AND ", predicates) : string.Empty;
            command.CommandText = $"SELECT * FROM [{table}]{where}";

            await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SequentialAccess, cancellationToken);
            var batch = new List<Dictionary<string, object?>>(_options.BatchSize);
            var batchNumber = 0;
            while (await reader.ReadAsync(cancellationToken))
            {
                batch.Add(ReadRow(reader));
                if (batch.Count < _options.BatchSize) continue;
                yield return (table, batchNumber++, batch);
                batch = new List<Dictionary<string, object?>>(_options.BatchSize);
            }
            if (batch.Count > 0) yield return (table, batchNumber, batch);
        }
    }

    private async Task<List<string>> GetColumnsAsync(SqlConnection connection, string table, CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandTimeout = _options.CommandTimeoutSeconds;
        command.CommandText = "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @table ORDER BY ORDINAL_POSITION";
        command.Parameters.Add(new SqlParameter("@table", SqlDbType.NVarChar, 128) { Value = table });
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var columns = new List<string>();
        while (await reader.ReadAsync(cancellationToken)) columns.Add(reader.GetString(0));
        return columns;
    }

    private static string JsonScalar(JsonElement element) => element.ValueKind switch
    {
        JsonValueKind.String => element.GetString() ?? string.Empty,
        JsonValueKind.Number => element.GetRawText(),
        _ => element.GetRawText().Trim('"'),
    };

    private static Dictionary<string, object?> ReadRow(SqlDataReader reader)
    {
        var row = new Dictionary<string, object?>(reader.FieldCount, StringComparer.OrdinalIgnoreCase);
        for (var i = 0; i < reader.FieldCount; i++)
        {
            object? value = reader.IsDBNull(i) ? null : reader.GetValue(i);
            if (value is byte[] bytes) value = Convert.ToBase64String(bytes);
            row[reader.GetName(i)] = value;
        }
        return row;
    }
}
