# PayHub — Etapa 3 Completa

PayHub centraliza integração com Sage, cadastro de funcionários, grupos, automações de busca, holerites, portal do funcionário e assinatura eletrônica reforçada.

## Arquitetura

- **Dashboard/PWA:** React + Vite
- **API:** Node.js 22 + TypeScript + Express
- **Worker:** processo Node separado em PM2 usando MySQL como orquestrador
- **Banco:** MySQL 5.6+
- **Sage Connector:** .NET 8 Windows Service somente leitura
- **Android:** wrapper WebView nativo para o PWA

## Regras principais

- Empresa Sage fixa em `1` e exibida bloqueada na UI.
- Funcionário só pode ser cadastrado se o CPF for localizado no Sage.
- Cada funcionário pertence a exatamente um grupo.
- Cada grupo define tipos de folha e vários horários de busca, executados de segunda a sexta.
- Busca automática usa sempre o mês atual em `America/Sao_Paulo`.
- Holerite importado fica administrativo até ser liberado como `ASSINATURA_SOLICITADA`.
- Funcionário entra com CPF + PIN numérico de 6 dígitos.
- Primeiro acesso: CPF + data de nascimento, criação de PIN.
- Link temporário de assinatura exige PIN se já cadastrado; caso contrário executa primeiro acesso.
- Download pelo funcionário só após assinatura.
- Assinatura reforçada: hash SHA-256 do PDF, identidade, timestamp, IP, User-Agent, sessão, aceite, desenho opcional, cadeia de eventos e selo HMAC. TSA externo pode ser configurado.

## Instalação

```bash
npm install
cp .env.example .env
npm test
npm run build
npm run db:migrate
pm2 startOrReload ecosystem.config.cjs
pm2 save
```

O conector Windows fica em `connector/PayHub.SageConnector`.

Consulte `DEPLOY-ETAPA3.md` para o procedimento de atualização em produção.
