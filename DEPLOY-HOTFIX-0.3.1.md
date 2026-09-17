# PayHub 0.3.1 — atualização de autenticação

Esta versão corrige o login administrativo legado, restauração de sessão/CSRF e adiciona **Lembrar e-mail**.

## Atualização no Lightsail

Preserve o `.env` real antes de substituir arquivos.

```bash
cd /var/www/payhub
cp .env ~/payhub-env-backup-0.3.1

npm install
npm test
npm run build
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
```

A versão 0.3.1 não adiciona nova migration além da `003_payhub_etapa3.sql` já existente.

Após o deploy, abra o PayHub e use `Ctrl+F5` uma vez para descartar o bundle anterior do navegador.

## Segurança

- Não armazena senha administrativa no navegador.
- Não armazena PIN do funcionário no navegador.
- A opção "Lembrar e-mail" grava somente o e-mail normalizado em `localStorage`.
- Hashes administrativos legados da Etapa 2 continuam válidos e são atualizados automaticamente para o formato atual após um login bem-sucedido.
