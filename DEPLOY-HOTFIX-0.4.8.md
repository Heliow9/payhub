# PayHub 0.4.8 — Função e CBO oficiais do Sage

## Estrutura confirmada no Sage

A função/cargo do funcionário passa a ser consultada pela relação real entre as tabelas `FunFuncao` e `Funcao`:

```sql
SELECT TOP (1)
    ff.cd_empresa,
    ff.cd_funcionario,
    ff.dt_funcao,
    ff.cd_funcao,
    f.descricao,
    f.descricao_completa,
    f.cbo,
    f.cbo2002
FROM FunFuncao ff
LEFT JOIN Funcao f
       ON f.enterprise_id = ff.cd_empresa
      AND f.cd_funcao = ff.cd_funcao
WHERE ff.cd_empresa = @empresa
  AND ff.cd_funcionario = @funcionario
ORDER BY
    CASE WHEN ff.dt_final IS NULL OR ff.dt_final >= CAST(GETDATE() AS date) THEN 0 ELSE 1 END,
    ff.dt_funcao DESC;
```

Para o caso validado do funcionário 4301 / empresa 1, a relação aponta `cd_funcao = 70`, cuja descrição é **TECNICO INFORMATICA** e cujo `cbo2002` é **313205**.

## Alterações

- remove a dependência de inferência genérica de `FunFuncional` para determinar o cargo;
- `descricao_completa` da tabela `Funcao` é a primeira opção para função/cargo;
- `descricao` é utilizada como fallback;
- `cbo2002` é a fonte principal de CBO;
- `cbo` é fallback;
- o CBO passa a ser incluído no snapshot Sage e utilizado nos PDFs de holerite;
- ao sincronizar o funcionário, holerites atuais **não assinados** são regenerados com função e CBO atualizados;
- holerites **já assinados** não são alterados, preservando hashes e evidências.

## Atualização do servidor PayHub

```bash
cd /var/www/payhub
npm install
npm run build
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
```

Não há migration de banco.

## Atualização do Connector Sage (Windows)

No diretório `connector\PayHub.SageConnector`:

```cmd
dotnet restore
dotnet publish -c Release -r win-x64 --self-contained false -o .\publish
```

Preserve o `appsettings.json` utilizado em produção, substitua os binários e reinicie o serviço/execução do Connector.

Versão do Connector: **3.1.4**.

## Depois do deploy

No perfil do funcionário clique em **Sincronizar Sage**. O cadastro deverá exibir a função correta e o CBO, e os holerites não assinados serão regenerados.
