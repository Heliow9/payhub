# PayHub Etapa 3 Implementation Plan

**Goal:** evoluir o PayHub para cadastro validado no Sage, grupos, automações, normalização de holerites, portal do funcionário e assinatura eletrônica reforçada.

**Architecture:** a API Node/TypeScript atende Master, Analista, Funcionário e links temporários. Um processo `payhub-worker` usa MySQL para agendamento/normalização. O Windows Service .NET 8 existente continua como única ponte somente leitura para o Sage.

**Tech Stack:** Node.js 22+, TypeScript, Express, React/Vite, MySQL 5.6+, PM2, Nginx, .NET 8 Windows Service, Android/Kotlin WebView.

**Spec:** `docs/superpowers/specs/2026-09-16-payhub-etapa3-design.md`

## Entregas

- [x] Migration 003 com funcionários, grupos, agendas, holerites, documentos, assinatura e evidências.
- [x] Autenticação única: e-mail/senha para administração; CPF/PIN de 6 dígitos para funcionário.
- [x] Primeiro acesso por CPF + nascimento + criação do PIN.
- [x] Consulta de funcionário no Sage por CPF, empresa fixa 1, cadastro bloqueado quando não encontrado.
- [x] Um grupo por funcionário, histórico de movimentação e tipos de folha configuráveis.
- [x] Vários horários por grupo, segunda a sexta, competência sempre do mês atual.
- [x] Worker PM2 para agenda e normalização.
- [x] Importação por grupo e individual limitada a funcionários cadastrados no PayHub.
- [x] Versionamento de holerite, PDF e SHA-256.
- [x] Liberação manual para `SIGNATURE_REQUESTED`.
- [x] Portal do funcionário com resumo/completo e download somente após assinatura.
- [x] Link temporário para WhatsApp com expiração e autenticação por PIN/primeiro acesso.
- [x] Assinatura reforçada: aceite, desenho opcional/obrigatório, IP, user-agent, timestamp, hashes, HMAC, trilha encadeada e suporte opcional a TSA RFC3161.
- [x] Auditoria administrativa e configurações Master.
- [x] Dashboard responsivo/PWA e wrapper Android.
- [x] Evolução do mesmo `PayHub.SageConnector`, sem segundo conector.

## Verificação para deploy

```bash
npm install
npm test
npm run build
npm run db:migrate
pm2 startOrReload ecosystem.config.cjs
pm2 save
sudo nginx -t
sudo systemctl reload nginx
```

No Windows:

```powershell
dotnet restore connector\PayHub.SageConnector\PayHub.SageConnector.csproj
dotnet publish connector\PayHub.SageConnector\PayHub.SageConnector.csproj -c Release -r win-x64 --self-contained true /p:PublishSingleFile=true -o C:\PayHub\SageConnector
```
