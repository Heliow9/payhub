# PayHub 0.4.5 — PWA iPhone + cargo/função Sage

## Correções

### 1. Holerite no PWA do iPhone

O link direto para `/api/payrolls/employee/:id/download` podia ser aberto pelo WebView/PWA do iOS como uma página PDF, sem apresentar uma ação clara de download ou compartilhamento.

A 0.4.5 altera o fluxo para:

1. buscar o PDF autenticado via `fetch`;
2. preparar um `File` PDF local;
3. exibir uma tela **Holerite pronto**;
4. oferecer:
   - **Compartilhar / Salvar no iPhone** — abre a folha nativa do iOS;
   - **Baixar PDF** — download tradicional/fallback.

Na folha nativa do iOS o funcionário pode escolher **Salvar em Arquivos**, AirDrop, WhatsApp, e-mail etc.

O Service Worker foi atualizado para `payhub-shell-v5`.

### 2. Cargo/função do Sage

O Connector foi atualizado para **3.1.2**. A identificação do cargo/função agora aceita mais aliases e procura de forma mais tolerante nas tabelas de função/cargo do Sage.

A API também tenta recuperar a função pelo snapshot bruto quando o Connector não preencher diretamente `jobTitle`.

Após **Sincronizar Sage**, o PayHub:

- atualiza `employees.job_title`;
- mantém o snapshot do Sage;
- regenera os PDFs atuais que **ainda não foram assinados**, usando o cargo/função atualizado;
- recalcula `original_sha256`;
- nunca modifica PDFs já assinados.

## Servidor Linux

```bash
cd /var/www/payhub
git pull --ff-only origin main
npm install
npm run build
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
pm2 status
```

Não há migration de banco nesta versão.

## Connector Sage 3.1.2 — Windows

Na máquina onde o Connector acessa o SQL Server do Sage:

```powershell
cd C:\caminho\PayHub\connector\PayHub.SageConnector
dotnet restore
dotnet publish -c Release -r win-x64 --self-contained false -o .\publish
```

Depois:

1. pare o serviço **PayHub Sage Connector**;
2. preserve o `appsettings.json` real;
3. substitua os arquivos do serviço pelos arquivos da pasta `publish`;
4. inicie novamente o serviço.

Não altere Connector ID/token.

## Depois do deploy

Para o funcionário que aparece como **Função não informada**:

1. Abra o perfil.
2. Clique em **Sincronizar Sage**.
3. Confirme se o cargo/função aparece abaixo do nome.
4. Abra um holerite ainda não assinado e confira o cargo no PDF.

Os holerites não assinados existentes são atualizados durante essa sincronização.

## PWA no iPhone

Após o deploy, feche completamente o PayHub no iPhone e abra novamente pelo ícone da Tela de Início para que o novo Service Worker assuma o controle.
