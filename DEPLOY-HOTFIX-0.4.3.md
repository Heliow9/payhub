# PayHub 0.4.3 — Hotfix de exportação de holerites

## Correções desta versão

- Corrige o erro 500/"Erro interno" ao usar **Exportar PDFs selecionados**.
- A causa era o registro da ação `BULK_EXPORT` em `document_access_logs`, enquanto o schema atual aceita apenas `VIEW_SUMMARY`, `VIEW_FULL`, `DOWNLOAD` e `SIGN`.
- A exportação em lote passa a registrar cada documento exportado como `DOWNLOAD`, mantendo compatibilidade imediata com o banco atual.
- Remove do holerite a frase: `Documento gerado pelo PayHub a partir dos dados de folha recebidos do Sage.`
- Novos PDFs já são gerados sem essa frase.
- PDFs originais antigos, ainda não assinados, são higienizados automaticamente no primeiro download/exportação e têm o SHA-256 atualizado no banco.
- PDFs já assinados não são modificados, preservando a integridade das evidências e hashes de assinatura.

## Banco de dados

Não há migration nova nesta versão.

## Atualização no servidor

```bash
cd /var/www/payhub
git pull --ff-only origin main
npm install
npm run build
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
pm2 status
```

Se o projeto for atualizado por substituição do pacote ZIP em vez de Git, preserve o `.env` e a pasta de armazenamento da produção antes da substituição.

## Validação recomendada

1. Acesse **Central de holerites**.
2. Marque dois ou mais documentos.
3. Clique em **Exportar PDFs selecionados**.
4. Confirme o download do ZIP e a presença do `manifesto.csv`.
5. Abra um holerite não assinado e confirme que a frase sobre geração a partir do Sage não aparece mais.
6. Abra um holerite já assinado e confirme que seu documento/evidência permanece inalterado.
