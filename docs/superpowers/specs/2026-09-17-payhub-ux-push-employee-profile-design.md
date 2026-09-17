# PayHub 0.4.0 — UX, Push, Perfil Sage e Exclusão Segura

## Objetivo
Evoluir o PayHub para uma experiência mais premium, com identidade visual oficial, notificações Web Push para usuários administrativos e funcionários, perfil de funcionário enriquecido com dados já trazidos do Sage, exclusão segura restrita ao MASTER e correções no PDF de holerite.

## Escopo aprovado

### 1. UI/UX e identidade
- Aplicar a marca PayHub fornecida pelo cliente em login, loading/splash, sidebar/cabeçalho, favicon, PWA e Android.
- Melhorar hierarquia visual, estados de carregamento e botões de ação da Central de Holerites.
- Modal administrativo de visualização do holerite volta ao formato compacto: resumo + tabela de eventos, sem imitar o PDF.
- Manter a ordem Sage aprovada: primeiro vencimentos, depois descontos, e dentro de cada grupo a sequência numérica de códigos observada no holerite oficial (00001, 00018, 00361, 00369; depois 00076, 00078, 00079, 00080, 99138).
- Naturezas visíveis em português: VENCIMENTOS e DESCONTOS.

### 2. Notificações
- Web Push nativo com VAPID.
- Funciona com a página fechada quando o navegador/PWA suporta push e a permissão foi concedida.
- Perfis distintos:
  - Funcionário: holerite liberado, assinatura concluída, novo documento.
  - MASTER/ANALISTA: importação concluída, importação com falha, holerites pendentes de assinatura e conector offline.
- Central de notificações no PayHub, com lida/não lida.
- Preferências de categorias por destinatário.
- Service Worker exibe notificações e abre o destino correto ao clicar.

### 3. Perfil de funcionário enriquecido
- Usar `sage_snapshot_json` já salvo pelo PayHub como fonte principal para exibição.
- Sem edição manual de dados oriundos do Sage.
- Abas: Resumo, Dados pessoais, Documentos, Dados funcionais, Remuneração e Holerites.
- Exibir somente campos realmente presentes no snapshot, usando aliases conhecidos para CPF, PIS/PASEP, RG, CTPS, telefone/celular, endereço, sexo, estado civil, escolaridade, CBO, salário, jornada, lotação/departamento, admissão, demissão e situação.
- No cadastro inicial, exibir mais dados encontrados antes da confirmação.

### 4. Exclusão segura de funcionário
- Somente MASTER.
- Backend protegido por `requireMaster`; não depender apenas da UI.
- Bloquear a exclusão se existir qualquer holerite assinado (`SIGNED`) em qualquer versão do funcionário.
- Para funcionário sem holerite assinado: apagar holerites, itens, documentos, solicitações/links/evidências não assinadas, logs de acesso, sessões, credenciais, histórico de grupo e o cadastro.
- Apagar arquivos físicos vinculados ao funcionário após confirmação da transação de banco.
- Registrar auditoria da exclusão com metadados mínimos antes da remoção do cadastro.
- UI exige confirmação explícita digitando CPF ou nome indicado.

### 5. PDF do holerite
- Corrigir sobreposição de textos com bordas no cabeçalho e quadro inferior.
- Aumentar altura e padding útil das células.
- Rótulos e valores devem ficar integralmente dentro das células.
- Manter PDF A4 em duas vias e o layout aprovado anteriormente.

## Arquitetura
- Nova `NotificationService` na API para persistência, preferências e envio Web Push.
- Nova migration `004_notifications_employee_delete.sql` para subscriptions/notificações/preferências.
- Novo conjunto de rotas `/api/notifications` acessível a usuário administrativo ou funcionário autenticado.
- Eventos de domínio integram NotificationService em liberação de holerite, assinatura, normalização e worker de saúde do conector.
- Frontend registra Service Worker, subscription Push e central do sino.
- Perfil Sage usa helper puro para extrair aliases do snapshot, testável sem banco.
- Exclusão fica concentrada no `EmployeeService.deleteEmployee`.

## Segurança e integridade
- Push subscription armazenada por principal (USER/EMPLOYEE) e endpoint único.
- VAPID private key fica somente no `.env` da API.
- Exclusão valida assinatura antes de iniciar a transação e repete a validação dentro da transação com lock.
- Nenhum histórico assinado pode ser apagado.
- O audit log não tem FK para employee e preserva o registro da operação.

## Compatibilidade
- Node 22+.
- MySQL 5.6: migration evita recursos SQL de versões posteriores.
- O conector Windows não precisa ser recompilado para o perfil enriquecido, pois o snapshot bruto já é retornado pelo lookup atual.
- PWA iOS: Web Push depende de PWA instalado na Tela de Início e permissão concedida.
