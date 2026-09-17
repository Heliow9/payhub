# PayHub 0.4.4 — Hotfix de comprovante de evidências

## O que muda

Esta atualização melhora o PDF de **comprovante de evidências** gerado após a assinatura do holerite:

- layout mais apresentável e organizado;
- inclusão da **logo do PayHub** no cabeçalho do comprovante;
- agrupamento das informações por blocos:
  - Identificação da assinatura
  - Evidências do dispositivo e da sessão
  - Integridade e trilha criptográfica
- status mais claro para o **carimbo de tempo externo (TSA RFC 3161)**.

## Compatibilidade

- **Sem migration de banco**
- **Sem alteração de estrutura do storage**
- Exige apenas rebuild e restart

## Deploy

No diretório do projeto:

```bash
npm install
npm run build
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
```

## Configuração do carimbo de tempo externo

Adicionar no `.env` da API:

```env
TSA_URL=https://SUA-TSA/exemplo
TSA_BEARER_TOKEN=
```

> Se o provedor TSA exigir autenticação Bearer, preencha `TSA_BEARER_TOKEN`.
> Se não exigir, deixe em branco.

## Observação

O PayHub usa `openssl ts -query` para montar a requisição RFC 3161 antes de enviar ao `TSA_URL`. Em ambientes Linux, mantenha o **OpenSSL instalado** no servidor.
