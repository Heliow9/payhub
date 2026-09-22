# PayHub 0.6.0 - Performance + Verificação Documental

## Documento único e autenticidade

- `document_number` único e permanente por versão de holerite.
- Código moderno no formato `PH-AAAAMM-XXXX-XXXX-XXXX` com entropia criptográfica.
- Backfill seguro para documentos existentes na migration 007.
- Código exibido no cabeçalho do PDF.
- No PDF assinado, código e endereço de validação ficam depois das informações de assinatura.
- Página pública `/#/verificar` sem login.
- Validação de integridade do PDF original e assinado por SHA-256.
- Validação de SHA-256 da evidência, selo HMAC e cadeia de eventos.
- Estado de TSA exposto sem afirmar validação criptográfica que não tenha sido executada.
- Comparação local de PDF: o navegador calcula SHA-256 e envia apenas o hash.
- Log de todas as consultas públicas e comparações de arquivo.

## Performance

- `render_hash` separado do hash bruto da origem.
- Normalizador usa mapas por funcionário/competência/tipo em vez de filtros repetidos.
- Funcionários ativos pré-carregados em lote.
- Holerites atuais pré-carregados em lote.
- `payroll_items` persistidos em INSERTs múltiplos.
- Até 3 holerites processados em paralelo dentro do mesmo job.
- Índice `idx_payroll_current_lookup` para o lookup principal da normalização.
- Heartbeat independente durante ciclos longos.

## Tamanho do banco

- Batches Sage de jobs normalizados podem sair do `LONGTEXT` e ser armazenados como `.json.gz` no storage documental.
- SHA-256 e metadados do arquivo compactado permanecem no MySQL.
- Leitura de batches arquivados é transparente para funcionalidades que ainda necessitem dos dados.
- Novos jobs são arquivados automaticamente após conclusão da normalização.
- Script em lotes para compactar histórico já concluído.

## Sage Connector 3.2.0

- PAYROLL_IMPORT deixa de retransmitir tabelas cadastrais já sincronizadas.
- Consulta somente `ProcEvento`, `MovEvento`, `ProcBase`, `MovCapa` e `EventoGVigencia`.
- `EventoGVigencia` é filtrada pelos códigos realmente encontrados na folha.

- A verificação pública também confere o vínculo entre o número do documento e os hashes dos PDFs registrados dentro da própria evidência assinada.
