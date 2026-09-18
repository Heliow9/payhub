# PayHub 0.5.0 — UX do Portal do Funcionário

## Correções incluídas

### 1. Atualização automática ao abrir notificação
- O Portal do Funcionário atualiza a lista de holerites ao receber clique de notificação push.
- Também atualiza ao retornar ao primeiro plano, recuperar foco e ao clicar em uma notificação dentro do próprio PWA.
- Service Worker atualizado para `payhub-shell-v7` para invalidar o shell anterior no iPhone.

### 2. Novo header responsivo
- Logo e identidade PayHub reorganizadas.
- Sino, usuário e saída separados em um bloco de ações.
- Nome do funcionário recebe truncamento controlado em telas intermediárias.
- Em celulares, o nome deixa de ocupar o header; a identificação permanece no avatar e na saudação do portal.
- Espaçamentos, bordas, sombras e hierarquia visual revisados.

### 3. Fim do zoom automático em inputs no iPhone
- Campos de texto, senha, busca, selects e textareas passam a usar `font-size: 16px` em telas móveis.
- Isso evita o zoom automático aplicado pelo Safari/iOS em controles com fonte menor que 16px.
- Checkboxes, radios e ranges não são afetados.

## Banco de dados
Nenhuma migration é necessária.

## Deploy
```bash
cd /var/www/payhub
npm install
npm run build
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
```

## Após o deploy no iPhone
1. Feche completamente o PayHub.
2. Abra novamente pelo ícone da Tela de Início.
3. Se o shell antigo ainda aparecer, feche e abra uma segunda vez para o Service Worker `payhub-shell-v7` assumir o controle.
