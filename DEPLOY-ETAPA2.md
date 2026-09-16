# Deploy PayHub — Etapa 2

## 1. Atualizar o GitHub

Aplique o patch da Etapa 2 no clone local do PayHub e envie para `main`.

## 2. Atualizar o Lightsail

O `.env` existente permanece no servidor e não é versionado.

Como o `ecosystem.config.cjs` foi ajustado manualmente no primeiro deploy para retirar a porta 3000, restaure apenas esse arquivo antes do primeiro `git pull` da Etapa 2. O commit novo contém a mesma correção de forma definitiva.

```bash
cd /var/www/payhub
git restore ecosystem.config.cjs
git pull origin main
npm install
npm test
npm run build
npm run db:migrate
pm2 restart payhub-api --update-env
pm2 save
sudo nginx -t
sudo systemctl reload nginx
```

Confirme:

```bash
curl -i https://paayhubapi.duckdns.org/api/health
pm2 status
```

## 3. Validar no Dashboard

Abra `https://paayhub.duckdns.org` e confirme o menu **Integração Sage**.

Como Master:

1. criar o conector `Servidor Sage`;
2. copiar `ConnectorId` e token exibido uma única vez;
3. manter o token fora do GitHub.

## 4. Preparar o Windows Service

Use a pasta `connector/PayHub.SageConnector` conforme `connector/README.md`.

Antes da instalação como serviço, rode o executável em modo console e confirme que o Dashboard mostra o conector como `ONLINE`.

## 5. Primeiro teste

No Dashboard:

1. criar job `Teste de conexão`;
2. aguardar `COMPLETED`;
3. criar job `Descoberta do schema`;
4. abrir `Logs` e confirmar as tabelas do Sage;
5. somente depois iniciar `Importação bruta da folha`.
