# PayHub 0.4.9 — CBO explícito na sincronização Sage

## Correção

O cargo/função já era obtido corretamente pela relação real do Sage:

- `FunFuncao.cd_empresa -> Funcao.enterprise_id`
- `FunFuncao.cd_funcao -> Funcao.cd_funcao`

Porém o CBO ainda dependia exclusivamente de ser reencontrado dentro do `sage_snapshot_json` na geração do PDF. Em algumas sincronizações o cargo chegava corretamente, mas o CBO não era promovido de forma explícita para o snapshot persistido, resultando em `CBO -` no holerite.

A versão 0.4.9 torna o CBO explícito em todo o fluxo:

1. Connector lê `Funcao.cbo2002`, com fallback para `Funcao.cbo`.
2. Connector envia `cbo` como campo canônico do funcionário e mantém `cbo_atual` no bloco bruto.
3. API normaliza CBO com 6 dígitos.
4. API persiste `cbo_atual` e `cbo2002` no snapshot do funcionário.
5. Holerites novos e holerites não assinados regenerados passam a usar esse CBO.

Para o funcionário Sage 4301 / função 70, o esperado é:

- Função: `TECNICO INFORMATICA`
- CBO: `313205`

## Versões

- PayHub: `0.4.9`
- Sage Connector: `3.1.5`

## Banco

Não há migration.

## Atualização do servidor

```bash
cd /var/www/payhub
npm install
npm run build
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
```

## Atualização do Connector Windows

```cmd
cd C:\caminho\PayHub\connector\PayHub.SageConnector
dotnet restore
dotnet publish -c Release -r win-x64 --self-contained false -o .\publish
```

Pare o serviço/processo antigo, preserve o `appsettings.json`, substitua os binários e inicie o Connector 3.1.5.

## Após atualizar

No perfil do funcionário, clique em **Sincronizar Sage** novamente. A sincronização atualizará o snapshot com o CBO e regenerará os holerites atuais ainda não assinados.

Holerites já assinados não são alterados.
