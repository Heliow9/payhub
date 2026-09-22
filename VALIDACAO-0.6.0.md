# Validação do pacote PayHub 0.6.0

## Validações executadas neste ambiente

- parsing de 220 arquivos TypeScript/TSX: **0 erros de sintaxe**;
- transpile sintático dos arquivos não-`.d.ts`: sem diagnóstico de parsing;
- geração real da amostra de holerite assinado usando o `pdf.service.ts` da 0.6.0;
- geração real da amostra do comprovante de evidências;
- renderização das duas amostras para PNG e inspeção visual;
- extração textual confirmou `Documento`, `Código de verificação` e URL de validação no holerite assinado;
- verificação estrutural do Sage Connector alterado: chaves balanceadas e escopo de leitura revisado.

## Limitação do ambiente de empacotamento

O ambiente usado para montar este pacote não possui acesso funcional ao registry do npm nem o SDK .NET 8. Por isso, o typecheck/build integral com dependências e o `dotnet build` não foram declarados como concluídos aqui.

**Antes de produção, o deploy exige:**

```bash
npm ci
npm run build --workspace @payhub/api
npm run build --workspace @payhub/dashboard
npm run verify:multi-company --workspace @payhub/api
npm run verify:durable-worker --workspace @payhub/api
npm run verify:document-performance --workspace @payhub/api
```

E, no Windows do Sage Connector:

```powershell
dotnet restore
dotnet build PayHub.SageConnector.csproj -c Release
```

Não reinicie produção se qualquer uma dessas etapas falhar.
