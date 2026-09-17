# PayHub 0.3.4 - Holerite padrão Sage

Atualização visual e documental dos holerites.

## Incluído

- eventos exibidos no padrão do Sage: VENCIMENTOS primeiro e DESCONTOS depois;
- em cada bloco, sequência de códigos igual ao modelo validado: 00001, 00018, 00361, 00369 / 00076, 00078, 00079, 00080, 99138;
- labels em português: VENCIMENTOS e DESCONTOS;
- visualização administrativa no formato de recibo de pagamento;
- Portal do Funcionário usa o mesmo documento;
- tela de assinatura pelo portal e link temporário usa o mesmo documento antes do aceite;
- PDF A4 com duas vias no padrão do modelo Sage/Real Energy;
- bases de INSS, FGTS e IRRF trazidas de ProcBase quando disponíveis;
- nova versão do hash documental para que uma nova busca gere um novo PDF mesmo quando os dados do Sage não mudarem.

## Não muda

- não há migration nova;
- não é necessário recompilar o conector Windows v3;
- banco MySQL permanece externo.

## Deploy via GitHub no Lightsail

```bash
cd /var/www/payhub
git pull --ff-only origin main
npm install
npm test
npm run build
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
pm2 status
```

## Teste funcional recomendado

No PayHub:

1. Grupo > Buscar holerites agora.
2. Competência: Janeiro/2025.
3. Tipo: Mensal.
4. Aguardar o job concluir.
5. Abrir Central de holerites > Janeiro/2025.
6. Visualizar o holerite.
7. Liberar para assinatura e conferir o mesmo layout no Portal do Funcionário / link temporário.
8. Abrir o PDF e conferir as duas vias.

Como a versão do template entrou no `sourceHash`, uma nova busca cria uma nova versão documental quando o holerite existente foi gerado pelo template anterior.
