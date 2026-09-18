# PayHub 0.5.1 — Redesign mobile + Perfil do Funcionário

## Principais mudanças

- novo header compacto e mobile-first para PWA e Android;
- avatar do funcionário passa a abrir **Meu perfil**;
- remoção do botão “Sair” do header — agora disponível dentro do perfil;
- perfil somente leitura com dados já existentes no PayHub/Sage;
- função/cargo e CBO exibidos no perfil;
- matrícula Sage, CPF, nascimento, admissão, telefone, grupo e situação;
- estatísticas de holerites, assinados e pendentes;
- último acesso e situação do PIN;
- atualização automática da lista ao retornar ao app ou abrir uma notificação;
- correção do zoom automático em inputs no iPhone preservada;
- Service Worker atualizado para `payhub-shell-v8`;
- Android versionName `0.5.1`, versionCode `7`.

## Banco de dados

**Não há migration.** O perfil reutiliza os dados existentes nas tabelas `employees`, `employee_groups`, `employee_credentials` e `payrolls`.

## Deploy servidor

```bash
cd /var/www/payhub
npm install
npm run build
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
pm2 status
```

## PWA iPhone

Após o deploy, feche completamente o PWA e abra novamente pela Tela de Início. O novo Service Worker substitui o cache anterior automaticamente.

## Android

O aplicativo Android usa a mesma interface web do PayHub, então o redesign e o novo perfil ficam disponíveis após o deploy do servidor. Caso vá gerar um novo APK, use a versão Android 0.5.1 incluída neste pacote.
