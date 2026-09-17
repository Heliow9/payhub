using System.Data;
using System.Text.Json;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Options;

namespace PayHub.SageConnector;

public sealed record PayrollImportScope(
    JsonElement CompanyCode,
    JsonElement? EmployeeCode,
    string[]? EmployeeCodes,
    int? Year,
    int? Month,
    int[]? Types,
    bool FromAdmission = false);

public sealed record EmployeeLookupScope(JsonElement CompanyCode, string Cpf);
public sealed record SageTableSchema(string TableName, IReadOnlyList<string> Columns, long RowCount);

public sealed class SageReadOnlyClient
{
    public static readonly string[] AllowedTables =
    [
        "Funcionario", "FunDocumento", "FunFuncional", "FunSalario",
        "ProcEvento", "EventoGVigencia", "ProcBase", "MovCapa", "MovEvento",
    ];

    private static readonly string[] EmployeeAliases = ["cd_funcionario", "codigo_funcionario", "cod_funcionario", "id_funcionario", "funcionario"];
    private static readonly string[] CompanyAliases = ["cd_empresa", "codigo_empresa", "cod_empresa", "empresa"];
    private static readonly string[] CpfAliases = ["cpf", "nr_cpf", "nu_cpf", "ds_cpf", "cd_cpf", "cpf_funcionario", "nr_cpf_funcionario"];
    private static readonly string[] NameAliases = ["nm_funcionario", "nome_funcionario", "nome", "nm_pessoa", "nome_pessoa"];
    private static readonly string[] BirthAliases = ["dt_nascimento", "data_nascimento", "dtnascimento", "nascimento"];
    private static readonly string[] AdmissionAliases = ["dt_admissao", "data_admissao", "dtadmissao", "admissao"];
    private static readonly string[] JobAliases = ["ds_cargo", "cargo", "nm_cargo", "descricao_cargo", "ds_funcao", "funcao", "nm_funcao"];
    private static readonly string[] PhoneAliases = ["telefone", "nr_telefone", "fone", "celular", "nr_celular"];
    private static readonly string[] StatusAliases = ["situacao", "status", "st_funcionario", "ds_situacao", "fl_ativo"];

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
            result.Add(new SageTableSchema(table, columns, Convert.ToInt64(await count.ExecuteScalarAsync(cancellationToken) ?? 0)));
        }
        return result;
    }

    public async Task<Dictionary<string, object?>?> LookupEmployeeByCpfAsync(EmployeeLookupScope scope, CancellationToken cancellationToken)
    {
        var cpf = OnlyDigits(scope.Cpf);
        if (cpf.Length != 11) throw new InvalidOperationException("CPF inválido para consulta no Sage.");
        var companyCode = JsonScalar(scope.CompanyCode);

        await using var connection = CreateConnection();
        await connection.OpenAsync(cancellationToken);

        string? employeeCode = null;
        var collected = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        foreach (var table in new[] { "Funcionario", "FunDocumento", "FunFuncional" })
        {
            var columns = await GetColumnsAsync(connection, table, cancellationToken);
            if (columns.Count == 0) continue;
            var cpfColumn = FindColumn(columns, CpfAliases);
            var employeeColumn = FindColumn(columns, EmployeeAliases);
            if (cpfColumn is null || employeeColumn is null) continue;

            await using var cmd = connection.CreateCommand();
            cmd.CommandTimeout = _options.CommandTimeoutSeconds;
            var predicates = new List<string>
            {
                $"REPLACE(REPLACE(REPLACE(REPLACE(CONVERT(nvarchar(50), [{cpfColumn}]),'.',''),'-',''),'/',''),' ','') = @cpf"
            };
            cmd.Parameters.Add(new SqlParameter("@cpf", SqlDbType.NVarChar, 11) { Value = cpf });
            var companyColumn = FindColumn(columns, CompanyAliases);
            if (companyColumn is not null)
            {
                predicates.Add($"CONVERT(nvarchar(100), [{companyColumn}]) = @company");
                cmd.Parameters.Add(new SqlParameter("@company", SqlDbType.NVarChar, 100) { Value = companyCode });
            }
            cmd.CommandText = $"SELECT TOP 1 * FROM [{table}] WHERE {string.Join(" AND ", predicates)}";
            await using var reader = await cmd.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
            if (!await reader.ReadAsync(cancellationToken)) continue;
            var row = ReadRow(reader);
            employeeCode = Scalar(row, employeeColumn);
            Merge(collected, row);
            if (!string.IsNullOrWhiteSpace(employeeCode)) break;
        }

        if (string.IsNullOrWhiteSpace(employeeCode)) return null;

        foreach (var table in new[] { "Funcionario", "FunDocumento", "FunFuncional", "FunSalario" })
        {
            var row = await ReadEmployeeRowAsync(connection, table, companyCode, employeeCode, cancellationToken);
            if (row is not null) Merge(collected, row);
        }

        var result = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
        {
            ["sageEmployeeCode"] = employeeCode,
            ["companyCode"] = companyCode,
            ["name"] = First(collected, NameAliases) ?? $"Funcionário {employeeCode}",
            ["cpf"] = cpf,
            ["birthDate"] = IsoDate(FirstValue(collected, BirthAliases)),
            ["admissionDate"] = IsoDate(FirstValue(collected, AdmissionAliases)),
            ["jobTitle"] = First(collected, JobAliases),
            ["phone"] = First(collected, PhoneAliases),
            ["status"] = First(collected, StatusAliases),
            ["raw"] = collected,
        };
        return result;
    }

    public async IAsyncEnumerable<(string Table, int BatchNumber, List<Dictionary<string, object?>> Rows)> ReadPayrollAsync(
        PayrollImportScope scope,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var companyCode = JsonScalar(scope.CompanyCode);
        var employeeCodes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (scope.EmployeeCodes is { Length: > 0 }) foreach (var code in scope.EmployeeCodes.Where(x => !string.IsNullOrWhiteSpace(x))) employeeCodes.Add(code.Trim());
        if (scope.EmployeeCode.HasValue) { var one = JsonScalar(scope.EmployeeCode.Value); if (!string.IsNullOrWhiteSpace(one)) employeeCodes.Add(one); }
        if (employeeCodes.Count == 0) throw new InvalidOperationException("PAYROLL_IMPORT exige ao menos um funcionário previamente cadastrado no PayHub.");

        await using var connection = CreateConnection();
        await connection.OpenAsync(cancellationToken);

        foreach (var table in AllowedTables)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var columns = await GetColumnsAsync(connection, table, cancellationToken);
            if (columns.Count == 0) continue;
            var companyColumn = FindColumn(columns, CompanyAliases);
            var employeeColumn = FindColumn(columns, EmployeeAliases);
            var isGlobalReferenceTable = string.Equals(table, "EventoGVigencia", StringComparison.OrdinalIgnoreCase);
            if (!isGlobalReferenceTable && companyColumn is null)
                throw new InvalidOperationException($"Tabela {table} existe, mas não possui coluna de empresa; leitura ampla bloqueada por segurança.");

            await using var command = connection.CreateCommand();
            command.CommandTimeout = _options.CommandTimeoutSeconds;
            var predicates = new List<string>();
            if (companyColumn is not null)
            {
                predicates.Add($"CONVERT(nvarchar(100), [{companyColumn}]) = @companyCode");
                command.Parameters.Add(new SqlParameter("@companyCode", SqlDbType.NVarChar, 100) { Value = companyCode });
            }
            if (employeeColumn is not null)
            {
                var names = new List<string>(); var index = 0;
                foreach (var code in employeeCodes)
                {
                    var name = $"@employee{index++}"; names.Add(name);
                    command.Parameters.Add(new SqlParameter(name, SqlDbType.NVarChar, 100) { Value = code });
                }
                predicates.Add($"CONVERT(nvarchar(100), [{employeeColumn}]) IN ({string.Join(",", names)})");
            }
            else if (!isGlobalReferenceTable && table is "Funcionario" or "FunDocumento" or "FunFuncional" or "FunSalario")
            {
                throw new InvalidOperationException($"Tabela {table} não possui código de funcionário reconhecido; leitura ampla bloqueada.");
            }

            AddOptionalIntPredicate(command, predicates, columns, ["ano", "nr_ano", "ano_referencia", "ano_competencia"], "@year", scope.FromAdmission ? null : scope.Year);
            AddOptionalIntPredicate(command, predicates, columns, ["mes", "nr_mes", "mes_referencia", "mes_competencia"], "@month", scope.FromAdmission ? null : scope.Month);
            var typeColumn = FindColumn(columns, ["tipo", "tp_folha", "tipo_folha", "cd_tipo"]);
            if (typeColumn is not null && scope.Types is { Length: > 0 })
            {
                var names = new List<string>();
                for (var i = 0; i < scope.Types.Length; i++)
                {
                    var name = $"@type{i}"; names.Add(name);
                    command.Parameters.Add(new SqlParameter(name, SqlDbType.Int) { Value = scope.Types[i] });
                }
                predicates.Add($"[{typeColumn}] IN ({string.Join(",", names)})");
            }

            var where = predicates.Count > 0 ? " WHERE " + string.Join(" AND ", predicates) : string.Empty;
            command.CommandText = $"SELECT * FROM [{table}]{where}";
            await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SequentialAccess, cancellationToken);
            var batch = new List<Dictionary<string, object?>>(_options.BatchSize); var batchNumber = 0;
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

    private static void AddOptionalIntPredicate(SqlCommand command, List<string> predicates, List<string> columns, string[] aliases, string parameterName, int? value)
    {
        if (!value.HasValue) return;
        var column = FindColumn(columns, aliases); if (column is null) return;
        predicates.Add($"[{column}] = {parameterName}");
        command.Parameters.Add(new SqlParameter(parameterName, SqlDbType.Int) { Value = value.Value });
    }

    private async Task<Dictionary<string, object?>?> ReadEmployeeRowAsync(SqlConnection connection, string table, string companyCode, string employeeCode, CancellationToken cancellationToken)
    {
        var columns = await GetColumnsAsync(connection, table, cancellationToken); if (columns.Count == 0) return null;
        var employeeColumn = FindColumn(columns, EmployeeAliases); if (employeeColumn is null) return null;
        await using var cmd = connection.CreateCommand(); cmd.CommandTimeout = _options.CommandTimeoutSeconds;
        var predicates = new List<string> { $"CONVERT(nvarchar(100), [{employeeColumn}]) = @employee" };
        cmd.Parameters.Add(new SqlParameter("@employee", SqlDbType.NVarChar, 100) { Value = employeeCode });
        var companyColumn = FindColumn(columns, CompanyAliases);
        if (companyColumn is not null) { predicates.Add($"CONVERT(nvarchar(100), [{companyColumn}]) = @company"); cmd.Parameters.Add(new SqlParameter("@company", SqlDbType.NVarChar, 100) { Value = companyCode }); }
        cmd.CommandText = $"SELECT TOP 1 * FROM [{table}] WHERE {string.Join(" AND ", predicates)}";
        await using var reader = await cmd.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? ReadRow(reader) : null;
    }

    private async Task<List<string>> GetColumnsAsync(SqlConnection connection, string table, CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand(); command.CommandTimeout = _options.CommandTimeoutSeconds;
        command.CommandText = "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @table ORDER BY ORDINAL_POSITION";
        command.Parameters.Add(new SqlParameter("@table", SqlDbType.NVarChar, 128) { Value = table });
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var columns = new List<string>(); while (await reader.ReadAsync(cancellationToken)) columns.Add(reader.GetString(0)); return columns;
    }

    private static string? FindColumn(IEnumerable<string> columns, IEnumerable<string> aliases)
    {
        var set = columns.ToDictionary(x => x, x => x, StringComparer.OrdinalIgnoreCase);
        foreach (var alias in aliases) if (set.TryGetValue(alias, out var exact)) return exact;
        return null;
    }
    private static string OnlyDigits(string value) => new(value.Where(char.IsDigit).ToArray());
    private static string JsonScalar(JsonElement element) => element.ValueKind switch { JsonValueKind.String => element.GetString() ?? string.Empty, JsonValueKind.Number => element.GetRawText(), _ => element.GetRawText().Trim('"') };
    private static string? Scalar(Dictionary<string, object?> row, string column) => row.TryGetValue(column, out var value) && value is not null ? Convert.ToString(value)?.Trim() : null;
    private static object? FirstValue(Dictionary<string, object?> row, IEnumerable<string> aliases) { foreach (var alias in aliases) if (row.TryGetValue(alias, out var value) && value is not null && Convert.ToString(value)?.Length > 0) return value; return null; }
    private static string? First(Dictionary<string, object?> row, IEnumerable<string> aliases) { var value = FirstValue(row, aliases); return value is null ? null : Convert.ToString(value)?.Trim(); }
    private static string? IsoDate(object? value) { if (value is null) return null; if (value is DateTime dt) return dt.ToString("yyyy-MM-dd"); if (value is DateTimeOffset dto) return dto.ToString("yyyy-MM-dd"); return DateTime.TryParse(Convert.ToString(value), out var parsed) ? parsed.ToString("yyyy-MM-dd") : null; }
    private static void Merge(Dictionary<string, object?> target, Dictionary<string, object?> source) { foreach (var pair in source) if (pair.Value is not null && !target.ContainsKey(pair.Key)) target[pair.Key] = pair.Value; }
    private static Dictionary<string, object?> ReadRow(SqlDataReader reader)
    {
        var row = new Dictionary<string, object?>(reader.FieldCount, StringComparer.OrdinalIgnoreCase);
        for (var i = 0; i < reader.FieldCount; i++) { object? value = reader.IsDBNull(i) ? null : reader.GetValue(i); if (value is byte[] bytes) value = Convert.ToBase64String(bytes); row[reader.GetName(i)] = value; }
        return row;
    }
}
