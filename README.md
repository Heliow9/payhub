# PayHub — Gestão Digital de Holerites

PayHub centraliza integração com Sage, cadastro de funcionários, grupos, automações de busca, holerites, portal do funcionário e assinatura eletrônica reforçada.

## Arquitetura

- **Dashboard/PWA:** React + Vite
- **API:** Node.js 22 + TypeScript + Express
- **Worker:** processo Node separado em PM2 usando MySQL como orquestrador
- **Banco:** MySQL 5.6+
- **Sage Connector:** .NET 8 Windows Service somente leitura
- **Android:** wrapper WebView nativo para o PWA, com identidade visual PayHub

## Regras principais

- Empresa Sage fixa em `1` e exibida bloqueada na UI.
- Funcionário só pode ser cadastrado se o CPF for localizado no Sage.
- Cada funcionário pertence a exatamente um grupo.
- Cada grupo define tipos de folha e vários horários de busca, executados de segunda a sexta.
- Busca automática usa sempre o mês atual em `America/Sao_Paulo`.
- Holerite importado fica administrativo até ser liberado como `ASSINATURA_SOLICITADA`.
- Funcionário entra com CPF + PIN numérico de 6 dígitos.
- Primeiro acesso: CPF + data de nascimento, criação de PIN.
- Link temporário de assinatura exige PIN se já cadastrado; caso contrário executa primeiro acesso.
- Download pelo funcionário só após assinatura.
- Assinatura reforçada: hash SHA-256 do PDF, identidade, timestamp, IP, User-Agent, sessão, aceite, desenho opcional, cadeia de eventos e selo HMAC. TSA externo pode ser configurado.


## Versão 0.3.1 — correções de autenticação

- Compatibilidade com hashes scrypt hexadecimais criados pela Etapa 2, com upgrade automático após login válido.
- Restauração de sessão e renovação de CSRF no `GET /api/auth/me`.
- Reconciliação da sessão HttpOnly antes de uma nova tentativa de login, evitando falso erro de credenciais quando a sessão existente ainda é válida.
- Opção **Lembrar e-mail neste dispositivo** no acesso administrativo. Somente o e-mail é armazenado; senha e PIN nunca são persistidos no navegador.
- Correções de tipagem TypeScript já aplicadas em `connector.service.ts`, `payroll.service.ts` e `AppShell.tsx`.


## Versão 0.3.4 - holerite padrão Sage

- Documento visual e PDF seguindo o recibo de pagamento de salário da Real Energy/Sage.
- Duas vias no PDF A4.
- Vencimentos listados antes dos descontos, seguindo a ordem de códigos do modelo Sage.
- Rótulos em português: **VENCIMENTOS** e **DESCONTOS**.
- Mesmo documento exibido no administrativo, portal do funcionário e tela de assinatura.
- Bases de INSS, FGTS e IRRF apresentadas a partir de `ProcBase`.
- Template documental versionado para que nova busca da competência gere o PDF atualizado.


## Versão 0.4.0 — experiência premium, notificações e perfil Sage

- Identidade visual oficial PayHub no login, carregamento, dashboard, PWA, favicon e assets Android.
- Central de notificações persistentes para funcionários, MASTER e ANALISTA.
- Web Push com VAPID para navegador/PWA, inclusive com a página fechada quando o sistema operacional/navegador permite.
- Preferências de notificação por perfil e dispositivo.
- Perfil do funcionário enriquecido com o snapshot real do Sage: dados pessoais, documentos, dados funcionais e remuneração.
- Exclusão de funcionário exclusiva para MASTER, transacional, com limpeza de holerites/arquivos não assinados e bloqueio absoluto quando existir documento assinado.
- Central de holerites com ações enriquecidas e modal administrativo compacto.
- Naturezas exibidas em português e ordem oficial aprovada: vencimentos antes dos descontos, ordenados por código.
- Correção estrutural do PDF A4 em duas vias para impedir linhas sobre textos no cabeçalho, totais e bases.

> Web Push desta versão atende navegadores/PWA. O wrapper Android nativo usa o mesmo PWA e branding; push nativo independente do WebView com o aplicativo totalmente encerrado exige integração FCM e credenciais próprias.

## Instalação

```bash
npm install
cp .env.example .env
npm test
npm run build
npm run db:migrate
pm2 startOrReload ecosystem.config.cjs
pm2 save
```

O conector Windows fica em `connector/PayHub.SageConnector`.

Para atualização da versão 0.4.0 em produção, consulte `DEPLOY-HOTFIX-0.4.0.md`.

## Versão 0.4.1 — dados Sage vigentes, PWA e assinatura
- salário/função atuais pela última vigência do Sage;
- sincronização cadastral manual e histórico salarial/funcional;
- telefone brasileiro no cadastro;
- situação Sage e dados de desligamento/aviso quando disponíveis;
- PWA com visualização discriminativa do holerite;
- assinatura desenhada disponível em Assinatura/Evidências no administrativo;
- PDF assinado com declaração e aceite completos sem truncamento;
- Connector Sage 3.1.1 (hotfix de valores pt-BR e EventoGVigencia).

Consulte `DEPLOY-HOTFIX-0.4.1.md` para atualização.

## Versão 0.4.2 — login unificado, evidências reforçadas e exportação em lote

- Login único com orientação clara para administrador (e-mail + senha) e funcionário (CPF + PIN).
- `GET /api/auth/me` sem sessão passa a responder estado anônimo, evitando 401 desnecessário na tela de login.
- Rate limit separado entre login e primeiro acesso, com mensagem amigável e sem contar acessos bem-sucedidos.
- Identidade visual do login refeita com símbolo PayHub nítido, wordmark em CSS e animações leves.
- PDF assinado mantém a declaração eletrônica na lateral direita, em linha vertical, sem inserir a assinatura desenhada no documento.
- Assinatura desenhada permanece preservada apenas como evidência administrativa.
- Pacote de evidências registra IP do servidor, User-Agent, dispositivo, sistema, navegador/app, tela, idioma, fuso horário e localização quando disponível.
- PWA coleta geolocalização pela API do navegador no ato da assinatura; quando a plataforma exigir, apenas o prompt nativo do sistema/navegador poderá aparecer.
- Android nativo habilita localização no WebView, solicita a permissão do sistema operacional e expõe marca, fabricante, modelo, versão Android, arquitetura e versão do app para a evidência.
- Coordenadas podem ser convertidas em endereço aproximado por geocodificação reversa configurável.
- O aceite informa de forma expressa quais informações técnicas e de localização compõem a evidência da assinatura.
- Dashboard administrativo exibe dispositivo, IP, localização, endereço aproximado, hashes e permite exportar o comprovante de evidências.
- Central de holerites permite exportar até 200 documentos selecionados em um único ZIP; usa o PDF assinado quando existir e o original nos demais casos, além de gerar `manifesto.csv` com SHA-256.

## Versão 0.4.3 — hotfix de exportação de PDFs

- Corrige o erro interno na exportação em lote de holerites selecionados.
- Mantém o log de acesso compatível com o enum atual do banco, registrando os documentos exportados como `DOWNLOAD`.
- Remove dos novos holerites a observação sobre geração a partir dos dados recebidos do Sage.
- Em PDFs originais antigos e ainda não assinados, a observação é removida automaticamente no primeiro download/exportação, com atualização do SHA-256.
- PDFs já assinados permanecem imutáveis para preservar as evidências de assinatura.

Consulte `DEPLOY-HOTFIX-0.4.3.md` para atualização.

## Versão 0.4.4 — melhoria do comprovante de evidências

- Novo layout do comprovante de evidências em PDF, com cabeçalho visual, logo do PayHub e textos organizados por seções.
- Exibição mais clara dos blocos de identificação da assinatura, dados do dispositivo/sessão e trilha criptográfica.
- Status do carimbo de tempo externo agora diferencia:
  - **Não configurado**
  - **Registrado com sucesso (TSA RFC 3161)**
  - **Configurado, porém houve falha no registro externo**
- Requer apenas atualização de código e rebuild/restart dos processos.

Consulte `DEPLOY-HOTFIX-0.4.4.md` para atualização.

## Versão 0.4.5 — PWA iPhone + cargo/função Sage

- Corrigido o fluxo de holerite assinado no **PWA do iPhone**: o botão deixa de depender de abrir diretamente a URL do PDF e passa a preparar o arquivo para download/compartilhamento.
- No iPhone, o funcionário recebe a opção **Compartilhar / Salvar no iPhone**, usando a folha nativa do iOS, incluindo **Salvar em Arquivos**, AirDrop, WhatsApp, e-mail etc.
- Mantido botão de **Baixar PDF** como alternativa em desktop/Android.
- Service Worker atualizado para `payhub-shell-v5` para evitar permanência do shell anterior após o deploy.
- Connector Sage atualizado para **3.1.2**, ampliando a identificação de campos de função/cargo e tabelas de referência.
- A API também possui fallback para inferir função/cargo a partir do snapshot do Sage quando o campo canônico `jobTitle` não vier preenchido.
- Ao executar **Sincronizar Sage**, os PDFs atuais ainda não assinados do funcionário são regenerados com a função/cargo corrigida e o novo SHA-256 é salvo. PDFs já assinados não são alterados.

Consulte `DEPLOY-HOTFIX-0.4.5.md`.


## Versão 0.4.6 — hotfix de build TypeScript

- Corrige `TS18048` no leitor de dimensões JPEG usado pelo comprovante de evidências.
- Sem alteração de banco.

## Versão 0.4.7 — correção cargo/função Sage

- Rejeita códigos curtos como `E` na função atual.
- Continua a busca pela descrição real de cargo/função no Sage.
- Requer atualização do Connector e nova sincronização do funcionário.


## Versão 0.4.8 — função e CBO oficiais do Sage

- função obtida por `FunFuncao` + `Funcao`;
- `descricao_completa`/`descricao` usadas como cargo/função;
- `cbo2002`/`cbo` usados no holerite;
- sincronização regenera PDFs não assinados com os novos dados;
- Connector Sage 3.1.4.

Consulte `DEPLOY-HOTFIX-0.4.8.md`.


## Versão 0.4.9 — CBO explícito do Sage

- Sage Connector 3.1.5 passa a enviar o CBO como campo canônico do funcionário.
- API normaliza e persiste `cbo_atual`/`cbo2002` no snapshot usado pelos PDFs.
- Corrige holerite com função preenchida e CBO exibido como `-`.
- Sem migration de banco.

Consulte `DEPLOY-HOTFIX-0.4.9.md`.

## Versão 0.5.0 — UX do Portal do Funcionário

- Atualização automática dos holerites ao abrir o PWA por notificação, ao recuperar foco e ao clicar em notificações internas.
- Header do Portal do Funcionário redesenhado e responsivo para iPhone/PWA.
- Correção do zoom automático do Safari/iOS em inputs, selects e textareas.
- Service Worker `payhub-shell-v7` para atualização do shell no dispositivo.
- Sem migration de banco.

Consulte `DEPLOY-0.5.0.md`.

## Versão 0.5.1 — Perfil do funcionário e redesign mobile

- Header do Portal do Funcionário redesenhado para PWA e Android.
- Avatar abre o novo **Meu perfil**.
- Perfil apresenta dados cadastrais já existentes no banco e sincronizados com o Sage: matrícula, CPF, nascimento, admissão, função/cargo, CBO, telefone, grupo e situação.
- Perfil inclui indicadores de holerites e informações de acesso.
- Botão de saída movido para o perfil.
- Service Worker `payhub-shell-v8`.
- Sem migration de banco.

Consulte `DEPLOY-0.5.1.md`.

## Versão 0.5.2 — hotfix de build

- Corrige a tipagem das estatísticas do perfil do funcionário no MySQL.
- Elimina os erros TS2339 para `total`, `signedCount` e `pendingCount`.
- Sem migration de banco.
- Sem atualização obrigatória do Connector Sage.

Consulte `DEPLOY-HOTFIX-0.5.2.md`.
