# PayHub 0.3.3 — Correção da normalização da folha Sage

## O que foi corrigido

A integração com o Sage estava recebendo corretamente os lotes, porém o PayHub não criava holerites porque o normalizador assumia uma estrutura diferente da encontrada no Sage real.

Mapeamento adotado nesta versão:

- `ProcEvento`: fonte financeira dos eventos processados (`cd_funcionario`, `ano`, `mes`, `tipo`, `cd_evento`, `referencia`, `referencia_editada`, `valor`).
- `EventoGVigencia`: descrição e natureza do evento. A vigência aplicável à competência é escolhida pela `dt_inicio`.
- `ProcBase`: bases de cálculo e referência da competência.
- `MovCapa`: dados gerais/complementares do processamento.
- `MovEvento`: movimentação auxiliar e compatibilidade; `tipo_processamento` também é reconhecido como tipo de folha.

Também foi mantida compatibilidade com o formato anterior usado nos testes/instalações antigas.

## Totais

- Proventos: soma dos eventos classificados pelo Sage como vencimento/provento (`tp_evento = V/P`).
- Descontos: soma dos eventos classificados como desconto (`tp_evento = D`).
- Líquido: proventos menos descontos.
- `referencia_editada` é priorizada para exibição quando existir.

## Implantação no Lightsail

```bash
cd /var/www/payhub
git pull origin main
npm install
npm test
npm run build
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
pm2 status
```

Não existe migration nova nesta versão.

## Conector Windows

O PayHub Sage Connector v3 não precisa ser recompilado para esta correção. Ele já envia as tabelas necessárias corretamente.

## Teste após atualização

O job antigo já normalizado não é processado novamente. Depois de atualizar a API/worker, faça uma **nova busca manual** do funcionário ou grupo escolhendo a competência desejada, por exemplo janeiro/2025 e tipo Mensal.

O novo job deve produzir holerites na Central quando houver `ProcEvento` para os funcionários consultados.
