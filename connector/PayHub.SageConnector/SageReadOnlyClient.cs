using System.Data;
using System.Globalization;
using System.Text;
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
    private static readonly string[] FunctionDescriptionAliases = ["ds_funcao", "descricao_funcao", "nm_funcao", "nome_funcao", "ds_cargo", "descricao_cargo", "nm_cargo", "nome_cargo"];
    private static readonly string[] FunctionCodeAliases = ["cd_funcao", "codigo_funcao", "cod_funcao", "id_funcao", "funcao", "cd_cargo", "codigo_cargo", "cod_cargo"];
    private static readonly string[] CboAliases = ["cbo", "cd_cbo", "nr_cbo", "codigo_cbo", "cbo_funcao", "cd_cbo_funcao"];
    private static readonly string[] PhoneAliases = ["telefone", "nr_telefone", "fone", "celular", "nr_celular"];
    private static readonly string[] StatusAliases = ["situacao", "status", "st_funcionario", "ds_situacao", "fl_ativo"];
    private static readonly string[] SalaryAliases = ["salario", "vl_salario", "valor_salario", "vlr_salario", "salario_atual"];
    private static readonly string[] WeeklyHoursAliases = ["horas_semanais", "qt_horas_semanais", "qtd_horas_semanais", "jornada_semanal"];
    private static readonly string[] SalaryTypeAliases = ["tipo_salario", "tp_salario", "regime_salario"];
    private static readonly string[] SalaryDateAliases = ["dt_salario", "data_salario", "dt_vigencia", "data_vigencia", "inicio_vigencia", "dt_inicio", "data_inicio", "dt_alteracao", "data_alteracao", "dt_reajuste", "data_reajuste", "data"];
    private static readonly string[] FunctionDateAliases = ["dt_funcao", "data_funcao", "dt_vigencia", "data_vigencia", "inicio_vigencia", "dt_inicio", "data_inicio", "dt_alteracao", "data_alteracao", "data"];
    private static readonly string[] TerminationDateAliases = ["dt_demissao", "data_demissao", "demissao", "dt_desligamento", "data_desligamento", "dt_rescisao", "data_rescisao", "dt_termino_contrato", "data_termino_contrato"];
    private static readonly string[] TerminationTypeAliases = ["ds_tipo_demissao", "tipo_demissao", "ds_motivo_demissao", "motivo_demissao", "ds_motivo_rescisao", "motivo_rescisao", "ds_tipo_rescisao", "tipo_rescisao"];
    private static readonly string[] TerminationTypeCodeAliases = ["cd_tipo_demissao", "cd_motivo_demissao", "cd_motivo_rescisao", "cd_tipo_rescisao", "tipo"];
    private static readonly string[] NoticeStartAliases = ["dt_inicio_aviso", "data_inicio_aviso", "dt_inicio_aviso_previo", "data_inicio_aviso_previo", "dt_aviso_previo", "data_aviso_previo", "dt_inicio"];
    private static readonly string[] NoticeIssueAliases = ["dt_emissao_aviso", "data_emissao_aviso", "dt_emissao_aviso_previo", "data_emissao_aviso_previo", "dt_emissao"];
    private static readonly string[] NoticeDaysAliases = ["nr_dias_aviso", "qt_dias_aviso", "qtd_dias_aviso", "dias_aviso", "nr_dias_aviso_previo"];

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
            count.CommandText = $"SELECT COUNT_BIG(1) FROM [{EscapeIdentifier(table)}]";
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
                $"REPLACE(REPLACE(REPLACE(REPLACE(CONVERT(nvarchar(50), [{EscapeIdentifier(cpfColumn)}]),'.',''),'-',''),'/',''),' ','') = @cpf"
            };
            cmd.Parameters.Add(new SqlParameter("@cpf", SqlDbType.NVarChar, 11) { Value = cpf });
            var companyColumn = FindColumn(columns, CompanyAliases);
            if (companyColumn is not null)
            {
                predicates.Add($"CONVERT(nvarchar(100), [{EscapeIdentifier(companyColumn)}]) = @company");
                cmd.Parameters.Add(new SqlParameter("@company", SqlDbType.NVarChar, 100) { Value = companyCode });
            }
            cmd.CommandText = $"SELECT TOP 1 * FROM [{EscapeIdentifier(table)}] WHERE {string.Join(" AND ", predicates)}";
            await using var reader = await cmd.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
            if (!await reader.ReadAsync(cancellationToken)) continue;
            var row = ReadRow(reader);
            employeeCode = Scalar(row, employeeColumn);
            if (!string.IsNullOrWhiteSpace(employeeCode)) break;
        }

        if (string.IsNullOrWhiteSpace(employeeCode)) return null;

        var funcionarioRows = await ReadEmployeeRowsAsync(connection, "Funcionario", companyCode, employeeCode, cancellationToken);
        var documentoRows = await ReadEmployeeRowsAsync(connection, "FunDocumento", companyCode, employeeCode, cancellationToken);
        var funcionalRows = await ReadEmployeeRowsAsync(connection, "FunFuncional", companyCode, employeeCode, cancellationToken);
        var salarioRows = await ReadEmployeeRowsAsync(connection, "FunSalario", companyCode, employeeCode, cancellationToken);
        var latestFunctional = LatestByDate(funcionalRows, FunctionDateAliases);
        var latestSalary = LatestByDate(salarioRows, SalaryDateAliases);

        Dictionary<string, object?>? functionReference = null;
        var functionCode = latestFunctional is null ? null : First(latestFunctional, FunctionCodeAliases);
        if (!string.IsNullOrWhiteSpace(functionCode))
        {
            functionReference = await FindFunctionReferenceAsync(connection, functionCode, cancellationToken);
        }

        var lifecycleRows = await ReadLifecycleRowsAsync(connection, companyCode, employeeCode, cancellationToken);
        var allRows = funcionarioRows.Concat(documentoRows).Concat(funcionalRows).Concat(salarioRows).Concat(lifecycleRows).ToList();

        var collected = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        foreach (var row in funcionarioRows) Merge(collected, row);
        foreach (var row in documentoRows) Merge(collected, row);
        if (latestFunctional is not null) MergeOverwrite(collected, latestFunctional);
        if (functionReference is not null) MergeOverwrite(collected, functionReference);
        if (latestSalary is not null) MergeOverwrite(collected, latestSalary);
        foreach (var row in lifecycleRows) MergeOverwriteEmpty(collected, row);

        var jobTitle = First(latestFunctional ?? new(StringComparer.OrdinalIgnoreCase), FunctionDescriptionAliases)
            ?? First(functionReference ?? new(StringComparer.OrdinalIgnoreCase), FunctionDescriptionAliases)
            ?? First(collected, FunctionDescriptionAliases);
        var cbo = First(functionReference ?? new(StringComparer.OrdinalIgnoreCase), CboAliases)
            ?? First(latestFunctional ?? new(StringComparer.OrdinalIgnoreCase), CboAliases)
            ?? First(collected, CboAliases);
        var currentSalaryText = First(latestSalary ?? new(StringComparer.OrdinalIgnoreCase), SalaryAliases);
        var currentSalary = DecimalValue(currentSalaryText);
        var salaryEffectiveDate = latestSalary is null ? null : LatestIsoDate([latestSalary], SalaryDateAliases);
        var terminationDate = LatestIsoDate(allRows, TerminationDateAliases);
        var terminationType = FirstFromRows(lifecycleRows.Concat(funcionarioRows).Concat(funcionalRows), TerminationTypeAliases)
            ?? FirstFromRows(lifecycleRows.Concat(funcionarioRows).Concat(funcionalRows), TerminationTypeCodeAliases);
        var noticeStartDate = LatestIsoDate(lifecycleRows.Concat(allRows), NoticeStartAliases);
        var noticeIssueDate = LatestIsoDate(lifecycleRows.Concat(allRows), NoticeIssueAliases);
        var noticeDays = IntValue(FirstFromRows(lifecycleRows.Concat(allRows), NoticeDaysAliases));
        var rawStatus = FirstFromRows(funcionarioRows.Concat(funcionalRows), StatusAliases);
        var sageStatus = NormalizeStatus(rawStatus, terminationDate);

        var salaryHistory = salarioRows
            .Select(row => new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
            {
                ["date"] = LatestIsoDate([row], SalaryDateAliases),
                ["salary"] = DecimalValue(First(row, SalaryAliases)),
                ["weeklyHours"] = First(row, WeeklyHoursAliases),
                ["type"] = First(row, SalaryTypeAliases),
            })
            .Where(row => row["salary"] is not null || row["date"] is not null)
            .OrderByDescending(row => ParseDate(row["date"]) ?? DateTime.MinValue)
            .ToList();

        var functionHistory = funcionalRows
            .Select(row =>
            {
                var code = First(row, FunctionCodeAliases);
                var description = First(row, FunctionDescriptionAliases);
                if (string.IsNullOrWhiteSpace(description) && !string.IsNullOrWhiteSpace(code) && string.Equals(code, functionCode, StringComparison.OrdinalIgnoreCase)) description = jobTitle;
                return new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
                {
                    ["date"] = LatestIsoDate([row], FunctionDateAliases),
                    ["functionCode"] = code,
                    ["jobTitle"] = description,
                    ["cbo"] = First(row, CboAliases),
                };
            })
            .Where(row => row["jobTitle"] is not null || row["functionCode"] is not null || row["date"] is not null)
            .OrderByDescending(row => ParseDate(row["date"]) ?? DateTime.MinValue)
            .ToList();

        collected["funcao_atual"] = jobTitle;
        collected["codigo_funcao_atual"] = functionCode;
        collected["cbo_atual"] = cbo;
        collected["salario_atual"] = currentSalary;
        collected["dt_vigencia_salario"] = salaryEffectiveDate;
        collected["situacao_sage"] = sageStatus;
        collected["dt_demissao"] = terminationDate;
        collected["tipo_demissao"] = terminationType;
        collected["dt_inicio_aviso"] = noticeStartDate;
        collected["dt_emissao_aviso"] = noticeIssueDate;
        collected["dias_aviso"] = noticeDays;
        collected["historico_salarios"] = salaryHistory;
        collected["historico_funcoes"] = functionHistory;
        if (lifecycleRows.Count > 0) collected["dados_desligamento_sage"] = lifecycleRows;

        return new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
        {
            ["sageEmployeeCode"] = employeeCode,
            ["companyCode"] = companyCode,
            ["name"] = FirstFromRows(funcionarioRows.Concat(documentoRows), NameAliases) ?? $"Funcionário {employeeCode}",
            ["cpf"] = cpf,
            ["birthDate"] = IsoDate(FirstValueFromRows(funcionarioRows.Concat(documentoRows), BirthAliases)),
            ["admissionDate"] = IsoDate(FirstValueFromRows(funcionarioRows.Concat(funcionalRows), AdmissionAliases)),
            ["jobTitle"] = jobTitle,
            ["phone"] = FirstFromRows(funcionarioRows.Concat(documentoRows), PhoneAliases),
            ["status"] = sageStatus,
            ["currentSalary"] = currentSalary,
            ["terminationDate"] = terminationDate,
            ["terminationType"] = terminationType,
            ["noticeStartDate"] = noticeStartDate,
            ["noticeDays"] = noticeDays,
            ["raw"] = collected,
        };
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
                predicates.Add($"CONVERT(nvarchar(100), [{EscapeIdentifier(companyColumn)}]) = @companyCode");
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
                predicates.Add($"CONVERT(nvarchar(100), [{EscapeIdentifier(employeeColumn)}]) IN ({string.Join(",", names)})");
            }
            else if (!isGlobalReferenceTable && table is "Funcionario" or "FunDocumento" or "FunFuncional" or "FunSalario")
            {
                throw new InvalidOperationException($"Tabela {table} não possui código de funcionário reconhecido; leitura ampla bloqueada.");
            }

            AddOptionalIntPredicate(command, predicates, columns, ["ano", "nr_ano", "ano_referencia", "ano_competencia"], "@year", scope.FromAdmission ? null : scope.Year);
            AddOptionalIntPredicate(command, predicates, columns, ["mes", "nr_mes", "mes_referencia", "mes_competencia"], "@month", scope.FromAdmission ? null : scope.Month);
            var typeColumn = FindColumn(columns, ["tipo", "tipo_processamento", "tp_folha", "tipo_folha", "cd_tipo"]);
            if (typeColumn is not null && scope.Types is { Length: > 0 })
            {
                var names = new List<string>();
                for (var i = 0; i < scope.Types.Length; i++)
                {
                    var name = $"@type{i}"; names.Add(name);
                    command.Parameters.Add(new SqlParameter(name, SqlDbType.Int) { Value = scope.Types[i] });
                }
                predicates.Add($"[{EscapeIdentifier(typeColumn)}] IN ({string.Join(",", names)})");
            }

            var where = predicates.Count > 0 ? " WHERE " + string.Join(" AND ", predicates) : string.Empty;
            command.CommandText = $"SELECT * FROM [{EscapeIdentifier(table)}]{where}";
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
        predicates.Add($"[{EscapeIdentifier(column)}] = {parameterName}");
        command.Parameters.Add(new SqlParameter(parameterName, SqlDbType.Int) { Value = value.Value });
    }

    private async Task<List<Dictionary<string, object?>>> ReadEmployeeRowsAsync(SqlConnection connection, string table, string companyCode, string employeeCode, CancellationToken cancellationToken)
    {
        var columns = await GetColumnsAsync(connection, table, cancellationToken); if (columns.Count == 0) return [];
        var employeeColumn = FindColumn(columns, EmployeeAliases); if (employeeColumn is null) return [];
        await using var cmd = connection.CreateCommand(); cmd.CommandTimeout = _options.CommandTimeoutSeconds;
        var predicates = new List<string> { $"CONVERT(nvarchar(100), [{EscapeIdentifier(employeeColumn)}]) = @employee" };
        cmd.Parameters.Add(new SqlParameter("@employee", SqlDbType.NVarChar, 100) { Value = employeeCode });
        var companyColumn = FindColumn(columns, CompanyAliases);
        if (companyColumn is not null) { predicates.Add($"CONVERT(nvarchar(100), [{EscapeIdentifier(companyColumn)}]) = @company"); cmd.Parameters.Add(new SqlParameter("@company", SqlDbType.NVarChar, 100) { Value = companyCode }); }
        var orderColumn = FindColumn(columns, table.Equals("FunSalario", StringComparison.OrdinalIgnoreCase) ? SalaryDateAliases : table.Equals("FunFuncional", StringComparison.OrdinalIgnoreCase) ? FunctionDateAliases : TerminationDateAliases);
        var order = orderColumn is null ? string.Empty : $" ORDER BY [{EscapeIdentifier(orderColumn)}] DESC";
        cmd.CommandText = $"SELECT TOP (500) * FROM [{EscapeIdentifier(table)}] WHERE {string.Join(" AND ", predicates)}{order}";
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        var rows = new List<Dictionary<string, object?>>();
        while (await reader.ReadAsync(cancellationToken)) rows.Add(ReadRow(reader));
        return rows;
    }

    private async Task<Dictionary<string, object?>?> FindFunctionReferenceAsync(SqlConnection connection, string functionCode, CancellationToken cancellationToken)
    {
        var tables = await GetTableNamesAsync(connection, cancellationToken);
        foreach (var table in tables.Where(name =>
                     (NormalizeName(name).Contains("funcao") || NormalizeName(name).Contains("cargo"))
                     && !name.Equals("FunFuncional", StringComparison.OrdinalIgnoreCase)))
        {
            var columns = await GetColumnsAsync(connection, table, cancellationToken);
            var codeColumn = FindColumn(columns, FunctionCodeAliases);
            var descriptionColumn = FindColumn(columns, FunctionDescriptionAliases);
            if (codeColumn is null || descriptionColumn is null) continue;
            await using var cmd = connection.CreateCommand();cmd.CommandTimeout = _options.CommandTimeoutSeconds;
            cmd.Parameters.Add(new SqlParameter("@functionCode", SqlDbType.NVarChar, 100){Value=functionCode});
            var dateColumn = FindColumn(columns, FunctionDateAliases);
            var order = dateColumn is null ? string.Empty : $" ORDER BY [{EscapeIdentifier(dateColumn)}] DESC";
            cmd.CommandText = $"SELECT TOP 1 * FROM [{EscapeIdentifier(table)}] WHERE CONVERT(nvarchar(100),[{EscapeIdentifier(codeColumn)}])=@functionCode{order}";
            try
            {
                await using var reader=await cmd.ExecuteReaderAsync(CommandBehavior.SingleRow,cancellationToken);
                if(await reader.ReadAsync(cancellationToken))return ReadRow(reader);
            }
            catch (SqlException) { /* tabela de referência opcional */ }
        }
        return null;
    }

    private async Task<List<Dictionary<string, object?>>> ReadLifecycleRowsAsync(SqlConnection connection, string companyCode, string employeeCode, CancellationToken cancellationToken)
    {
        var result = new List<Dictionary<string, object?>>();
        var tables = await GetTableNamesAsync(connection, cancellationToken);
        var candidates = tables.Where(name =>
        {
            var normalized = NormalizeName(name);
            return normalized.Contains("aviso") || normalized.Contains("demiss") || normalized.Contains("deslig") || normalized.Contains("rescis");
        }).Take(20);
        foreach (var table in candidates)
        {
            var columns = await GetColumnsAsync(connection, table, cancellationToken);
            var employeeColumn = FindColumn(columns, EmployeeAliases); if (employeeColumn is null) continue;
            await using var cmd=connection.CreateCommand();cmd.CommandTimeout=_options.CommandTimeoutSeconds;
            var predicates=new List<string>{$"CONVERT(nvarchar(100),[{EscapeIdentifier(employeeColumn)}])=@employee"};
            cmd.Parameters.Add(new SqlParameter("@employee",SqlDbType.NVarChar,100){Value=employeeCode});
            var companyColumn=FindColumn(columns,CompanyAliases);
            if(companyColumn is not null){predicates.Add($"CONVERT(nvarchar(100),[{EscapeIdentifier(companyColumn)}])=@company");cmd.Parameters.Add(new SqlParameter("@company",SqlDbType.NVarChar,100){Value=companyCode});}
            var dateColumn=FindColumn(columns,NoticeStartAliases.Concat(TerminationDateAliases).Concat(NoticeIssueAliases));
            var order=dateColumn is null?string.Empty:$" ORDER BY [{EscapeIdentifier(dateColumn)}] DESC";
            cmd.CommandText=$"SELECT TOP (50) * FROM [{EscapeIdentifier(table)}] WHERE {string.Join(" AND ",predicates)}{order}";
            try
            {
                await using var reader=await cmd.ExecuteReaderAsync(cancellationToken);
                while(await reader.ReadAsync(cancellationToken)){var row=ReadRow(reader);row["__source_table"]=table;result.Add(row);}
            }
            catch(SqlException){/* módulo opcional do Sage; não bloqueia o cadastro principal */}
        }
        return result;
    }

    private async Task<List<string>> GetTableNamesAsync(SqlConnection connection,CancellationToken cancellationToken)
    {
        await using var command=connection.CreateCommand();command.CommandTimeout=_options.CommandTimeoutSeconds;
        command.CommandText="SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME";
        await using var reader=await command.ExecuteReaderAsync(cancellationToken);var names=new List<string>();while(await reader.ReadAsync(cancellationToken))names.Add(reader.GetString(0));return names;
    }

    private async Task<List<string>> GetColumnsAsync(SqlConnection connection, string table, CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand(); command.CommandTimeout = _options.CommandTimeoutSeconds;
        command.CommandText = "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @table ORDER BY ORDINAL_POSITION";
        command.Parameters.Add(new SqlParameter("@table", SqlDbType.NVarChar, 128) { Value = table });
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var columns = new List<string>(); while (await reader.ReadAsync(cancellationToken)) columns.Add(reader.GetString(0)); return columns;
    }

    private static Dictionary<string, object?>? LatestByDate(IEnumerable<Dictionary<string, object?>> rows, IEnumerable<string> aliases)
        => rows.Select((row,index)=>(row,index,date:BestDate(row,aliases))).OrderByDescending(x=>x.date??DateTime.MinValue).ThenBy(x=>x.index).Select(x=>x.row).FirstOrDefault();

    private static DateTime? BestDate(Dictionary<string,object?> row,IEnumerable<string> aliases)
    {
        foreach(var alias in aliases)if(row.TryGetValue(alias,out var value)){var parsed=ParseDate(value);if(parsed.HasValue)return parsed;}
        return null;
    }

    private static string? LatestIsoDate(IEnumerable<Dictionary<string, object?>> rows,IEnumerable<string> aliases)
    {
        var value=rows.Select(row=>BestDate(row,aliases)).Where(v=>v.HasValue).Select(v=>v!.Value).OrderByDescending(v=>v).FirstOrDefault();
        return value==default?null:value.ToString("yyyy-MM-dd");
    }

    private static DateTime? ParseDate(object? value)
    {
        if(value is null)return null;if(value is DateTime dt)return dt;if(value is DateTimeOffset dto)return dto.DateTime;
        return DateTime.TryParse(Convert.ToString(value),CultureInfo.GetCultureInfo("pt-BR"),DateTimeStyles.AllowWhiteSpaces,out var parsed)||DateTime.TryParse(Convert.ToString(value),CultureInfo.InvariantCulture,DateTimeStyles.AllowWhiteSpaces,out parsed)?parsed:null;
    }

    private static string NormalizeStatus(string? raw,string? terminationDate)
    {
        if(!string.IsNullOrWhiteSpace(terminationDate))return "DEMITIDO";
        if(string.IsNullOrWhiteSpace(raw))return "ATIVO";
        var value=NormalizeName(raw);
        if(value.Contains("demit")||value.Contains("deslig")||value.Contains("rescis"))return "DEMITIDO";
        if(value=="a"||value.Contains("ativ"))return "ATIVO";
        return raw.Trim();
    }

    private static decimal? DecimalValue(string? value)
    {
        if(string.IsNullOrWhiteSpace(value))return null;
        if(decimal.TryParse(value,NumberStyles.Any,CultureInfo.InvariantCulture,out var invariant))return invariant;
        if(decimal.TryParse(value,NumberStyles.Any,CultureInfo.GetCultureInfo("pt-BR"),out var br))return br;
        return null;
    }

    private static int? IntValue(string? value)=>int.TryParse(OnlyDigits(value??string.Empty),out var parsed)?parsed:null;

    private static string? FirstFromRows(IEnumerable<Dictionary<string,object?>> rows,IEnumerable<string> aliases)
    {foreach(var row in rows){var value=First(row,aliases);if(!string.IsNullOrWhiteSpace(value))return value;}return null;}
    private static object? FirstValueFromRows(IEnumerable<Dictionary<string,object?>> rows,IEnumerable<string> aliases)
    {foreach(var row in rows){var value=FirstValue(row,aliases);if(value is not null)return value;}return null;}

    private static string? FindColumn(IEnumerable<string> columns, IEnumerable<string> aliases)
    {
        var set = columns.ToDictionary(x => x, x => x, StringComparer.OrdinalIgnoreCase);
        foreach (var alias in aliases) if (set.TryGetValue(alias, out var exact)) return exact;
        return null;
    }
    private static string EscapeIdentifier(string value)=>value.Replace("]","]]",StringComparison.Ordinal);
    private static string NormalizeName(string value)
    {
        var form=value.Normalize(NormalizationForm.FormD);var sb=new StringBuilder();foreach(var c in form)if(CharUnicodeInfo.GetUnicodeCategory(c)!=UnicodeCategory.NonSpacingMark)sb.Append(char.ToLowerInvariant(c));return sb.ToString().Normalize(NormalizationForm.FormC);
    }
    private static string OnlyDigits(string value) => new(value.Where(char.IsDigit).ToArray());
    private static string JsonScalar(JsonElement element) => element.ValueKind switch { JsonValueKind.String => element.GetString() ?? string.Empty, JsonValueKind.Number => element.GetRawText(), _ => element.GetRawText().Trim('"') };
    private static string? Scalar(Dictionary<string, object?> row, string column) => row.TryGetValue(column, out var value) && value is not null ? Convert.ToString(value)?.Trim() : null;
    private static object? FirstValue(Dictionary<string, object?> row, IEnumerable<string> aliases) { foreach (var alias in aliases) if (row.TryGetValue(alias, out var value) && value is not null && Convert.ToString(value)?.Length > 0) return value; return null; }
    private static string? First(Dictionary<string, object?> row, IEnumerable<string> aliases) { var value = FirstValue(row, aliases); return value is null ? null : Convert.ToString(value)?.Trim(); }
    private static string? IsoDate(object? value) { var date=ParseDate(value);return date?.ToString("yyyy-MM-dd"); }
    private static void Merge(Dictionary<string, object?> target, Dictionary<string, object?> source) { foreach (var pair in source) if (pair.Value is not null && !target.ContainsKey(pair.Key)) target[pair.Key] = pair.Value; }
    private static void MergeOverwrite(Dictionary<string, object?> target,Dictionary<string,object?> source){foreach(var pair in source)if(pair.Value is not null)target[pair.Key]=pair.Value;}
    private static void MergeOverwriteEmpty(Dictionary<string, object?> target,Dictionary<string,object?> source){foreach(var pair in source)if(pair.Value is not null&&(!target.TryGetValue(pair.Key,out var current)||current is null||string.IsNullOrWhiteSpace(Convert.ToString(current))))target[pair.Key]=pair.Value;}
    private static Dictionary<string, object?> ReadRow(SqlDataReader reader)
    {
        var row = new Dictionary<string, object?>(reader.FieldCount, StringComparer.OrdinalIgnoreCase);
        for (var i = 0; i < reader.FieldCount; i++) { object? value = reader.IsDBNull(i) ? null : reader.GetValue(i); if (value is byte[] bytes) value = Convert.ToBase64String(bytes); row[reader.GetName(i)] = value; }
        return row;
    }
}
