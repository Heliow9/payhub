# PayHub 0.4.7 — Hotfix cargo/função Sage

## Correção
- Impede que códigos internos curtos do Sage, como `E`, `A`, `S` ou `N`, sejam interpretados como descrição de cargo/função.
- A API também rejeita `jobTitle` inválido e tenta recuperar a descrição real no snapshot Sage.
- O Connector passa a continuar a busca por uma descrição textual válida.

## Após atualizar
1. Rebuild/restart da API/dashboard.
2. Atualizar/republicar o Connector Sage.
3. No perfil do funcionário, clicar em **Sincronizar Sage** novamente.

Não há migration de banco.
