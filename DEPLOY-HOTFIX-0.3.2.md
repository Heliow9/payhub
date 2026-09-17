# PayHub 0.3.2 — Busca manual por competência

## Objetivo

A busca manual de holerites agora permite escolher explicitamente:

- mês/competência;
- ano;
- um ou vários tipos de folha (2, 3, 4 e 6).

A alteração vale para busca individual e busca manual de grupos.

## O que não muda

- as buscas automáticas dos grupos continuam de segunda a sexta;
- cada horário automático continua consultando a competência atual;
- os tipos das buscas automáticas continuam sendo os tipos salvos no cadastro do grupo;
- o PayHub Sage Connector v3 não precisa ser recompilado para esta atualização;
- não há migration de banco nesta versão.

## Atualização no servidor

Depois de colocar os arquivos 0.3.2 em `/var/www/payhub`, preserve o `.env` atual e execute:

```bash
cd /var/www/payhub
npm install
npm test
npm run build
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
pm2 status
```

## Validação funcional

### Funcionário

1. Funcionários → abrir um funcionário.
2. Clicar em **Buscar holerites agora**.
3. Selecionar mês, ano e tipo(s).
4. Confirmar.
5. A execução criada deve registrar exatamente a competência escolhida.

### Grupo

1. Grupos → **Buscar holerites agora**.
2. Selecionar mês, ano e tipo(s).
3. Os tipos devem iniciar pré-selecionados conforme o grupo.
4. Alterações feitas no modal afetam somente aquela execução manual.

### Automação

A automação do grupo permanece usando mês atual + tipos cadastrados no grupo.
