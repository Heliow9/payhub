# PayHub — pacote mobile pronto para Expo / APK

## O que foi implementado

- Aplicativo Expo/React Native em `apps/mobile` para o funcionário.
- Login por CPF + PIN e fluxo de primeiro acesso.
- Sessão mobile com Bearer Token armazenado no SecureStore.
- Lista e detalhe de holerites.
- Assinatura eletrônica com aceite, PIN e assinatura desenhada quando exigida.
- Evidências técnicas do dispositivo e localização (somente após autorização do usuário).
- Download e compartilhamento do PDF assinado.
- Perfil do funcionário.
- Identidade visual PayHub, ícone e splash.
- `eas.json` com APK de teste e APK de produção interna.
- `expo-updates` preparado para EAS Update.
- API ajustada para aceitar Bearer Token mobile, preservando o login web por cookie.
- `dist` da API também foi atualizado para facilitar o deploy atual.

## Importante: não há migração de banco

A versão mobile usa as tabelas e endpoints existentes. Não foi criada nenhuma alteração SQL para esta entrega.

## Ordem recomendada para testar

### 1) Subir a API atualizada no servidor

Envie `apps/api` e reinicie o processo atual da API. O ideal é recompilar antes do restart:

```bash
cd apps/api
npm install
npm run build
# depois reinicie o processo que você já usa no PM2
```

### 2) No Windows / VS Code, abrir o mobile

PowerShell:

```powershell
cd apps/mobile
Copy-Item .env.example .env
npm install
npx expo install --fix
npx expo start --tunnel
```

Abra o Expo Go no Android e leia o QR Code.

A API padrão já está configurada como:

`https://paayhub.duckdns.org`

### 3) Gerar o APK

Na primeira configuração da sua conta Expo/EAS:

```powershell
npm install -g eas-cli
eas login
eas build:configure
eas update:configure
```

APK de teste:

```powershell
npm run apk
```

APK para usuários ligado ao canal `production`:

```powershell
npm run apk:production
```

### 4) Atualizações futuras sem gerar novo APK

Depois que o APK de produção tiver sido gerado já com EAS Update configurado:

```powershell
eas update --channel production --message "Atualização PayHub"
```

Mudanças apenas em JavaScript/TypeScript/assets compatíveis com o mesmo runtime podem seguir por EAS Update. Alterações nativas, permissões ou bibliotecas nativas exigem uma nova build.

## Observação sobre a validação neste ambiente

A estrutura, JSONs, imagens e sintaxe dos arquivos modificados foram validados. O download das dependências npm não pôde ser concluído neste ambiente por indisponibilidade de DNS do registro npm; por isso o ZIP é entregue corretamente sem `node_modules`. Rode `npm install` no seu computador antes do primeiro teste.
