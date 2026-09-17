# PayHub 0.4.0 — atualização de produção

Esta versão adiciona Web Push, Central de Notificações, perfil Sage enriquecido, exclusão MASTER segura, identidade visual PayHub e correção do PDF do holerite.

## 1. Antes de atualizar

Faça backup do banco MySQL e do diretório de documentos. Não altere nem regenere `SIGNATURE_SEAL_SECRET` em ambiente que já possui assinaturas.

No Lightsail, confirme o diretório:

```bash
cd /var/www/payhub
pwd
```

## 2. Atualizar o código

Depois de publicar o conteúdo do pacote 0.4.0 no repositório GitHub:

```bash
cd /var/www/payhub
git pull --ff-only origin main
npm install
```

A versão 0.4.0 adiciona a dependência `web-push`, portanto `npm install` é obrigatório.

## 3. Configurar Web Push / VAPID

Gere as chaves apenas uma vez no servidor:

```bash
cd /var/www/payhub
npx web-push generate-vapid-keys
```

Copie as chaves geradas diretamente para `/var/www/payhub/.env`. Não envie a chave privada em chats, prints ou repositórios.

```env
VAPID_SUBJECT=mailto:seu-email-administrativo@dominio.com.br
VAPID_PUBLIC_KEY=COLE_A_CHAVE_PUBLICA
VAPID_PRIVATE_KEY=COLE_A_CHAVE_PRIVADA
```

Se as variáveis ficarem vazias, o PayHub continua funcionando e mantém a Central de Notificações interna, mas o push com a página fechada fica desativado.

## 4. Aplicar migration 004

A versão cria `push_subscriptions`, `push_preferences` e `notifications`:

```bash
cd /var/www/payhub
npm run db:migrate
```

O esperado é aparecer:

```text
applied 004_notifications.sql
```

Em instalações onde ela já foi aplicada, aparecerá `skip 004_notifications.sql`.

## 5. Testar e gerar build

```bash
cd /var/www/payhub
npm test
npm run build
```

Não avance para o restart se teste ou build falhar.

## 6. Reiniciar API e Worker

```bash
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
pm2 status
```

Esperado:

```text
payhub-api       online
payhub-worker    online
```

Confira os logs:

```bash
pm2 logs payhub-api --lines 80 --nostream
pm2 logs payhub-worker --lines 80 --nostream
```

## 7. Atualizar o PWA no navegador

A versão usa `payhub-shell-v4` no Service Worker. Faça um recarregamento forçado uma vez (`Ctrl+F5`) no desktop. Em PWA instalado, feche e abra novamente após o deploy.

Depois, clique no sino do PayHub e escolha **Ativar** em “Notificações neste dispositivo”. A permissão é concedida pelo próprio navegador/sistema operacional.

No iPhone/iPad, Web Push exige o PayHub instalado como PWA na Tela de Início e uma versão do iOS compatível com Web Push para web apps instalados.

## 8. Testes funcionais recomendados

1. MASTER: abrir Funcionários e conferir as abas do perfil Sage.
2. MASTER: tentar excluir um funcionário sem holerite assinado e confirmar pelo CPF.
3. MASTER: confirmar que funcionário com qualquer holerite assinado tem exclusão bloqueada.
4. Funcionário: ativar notificações e liberar um holerite pelo administrativo; deve chegar “Novo holerite para assinatura”.
5. Funcionário: concluir assinatura; deve aparecer “Assinatura registrada”.
6. Administrativo: executar nova importação e conferir a notificação de conclusão.
7. Holerite: visualizar no modal administrativo compacto; baixar o PDF e conferir as duas vias sem linhas atravessando textos.

## 9. PDF atualizado

Para documentos que já possuem PDF antigo, execute uma nova busca da competência depois do deploy. O template documental está versionado e a nova busca gera a nova versão do PDF quando aplicável.

## 10. Android

O pacote contém os novos ícones e splash da identidade PayHub no projeto Android. Para distribuir um APK/AAB com esses assets, é necessário recompilar o app Android no ambiente de build habitual.

O Web Push desta versão é a implementação do navegador/PWA. Push nativo independente do WebView com o app Android completamente encerrado requer FCM e credenciais Android, e não está habilitado sem essa configuração externa.
