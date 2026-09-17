# PayHub 0.4.1 — atualização de produção + Connector 3.1.1

## Alterações da 0.4.1
- salário/função atuais selecionados pela vigência mais recente no Sage;
- histórico salarial e funcional no perfil;
- situação Sage e dados de desligamento/aviso quando disponíveis;
- telefone/WhatsApp brasileiro no cadastro;
- botão Sincronizar Sage;
- PWA do funcionário com visualização discriminativa do holerite;
- assinatura desenhada visível em Assinatura/Evidências no administrativo;
- PDF assinado com texto de aceite completo, sem truncamento;
- hotfix TypeScript do Web Push.

## Hotfix Connector 3.1.1
Dois problemas foram confirmados em produção e corrigidos:

1. **Salário multiplicado por 100**: strings como `2783,42` eram aceitas primeiro por `InvariantCulture`, que tratava a vírgula como separador de milhar. A 3.1.1 escolhe a cultura pelo separador decimal.
2. **Eventos sem descrição/natureza**: `EventoGVigencia` recebia filtros `ano/mês/tipo` da folha. A tabela é global de referência; a 3.1.1 deixa de aplicar esses filtros nela.

## Servidor Linux
Depois de subir o projeto para o GitHub:

```bash
cd /var/www/payhub
git pull --ff-only origin main
npm install
npm run db:migrate
npm test
npm run build
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
pm2 status
```

Não há migration nova além da `004_notifications.sql` introduzida na 0.4.0.

## Connector Sage 3.1.1
No Windows, dentro de `connector/PayHub.SageConnector`:

```powershell
dotnet restore
dotnet publish -c Release -r win-x64 --self-contained false -o .\publish
```

O executável será gerado em:

```text
publish\PayHub.SageConnector.exe
```

Pare o serviço atual, preserve o `appsettings.json` real e copie **todos os arquivos** de `publish` para a pasta do serviço. Não troque Connector ID/token. Depois inicie o serviço novamente.

## Reprocessamento necessário
Após atualizar o Connector 3.1.1:

1. No perfil do funcionário, clique **Sincronizar Sage** para corrigir o salário/histórico já armazenado no snapshot.
2. Faça uma **nova busca do holerite** da competência afetada (ex.: 05/2025). O job antigo já está normalizado e não será reprocessado automaticamente.
3. Confira se `EventoGVigencia` volta a trazer o conjunto global de definições e se o holerite exibe descrições, VENCIMENTOS/DESCONTOS e totais.
