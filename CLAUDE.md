# Sistema de Inventário de Óleo e Peças (Scania) — Contexto do Projeto

Este arquivo é carregado automaticamente pelo Claude Code em toda sessão
neste repositório. Ele existe para que qualquer agente (principal ou
subagente) tenha o contexto mínimo necessário sem precisar reler todos os
documentos de design a cada tarefa.

## O que é o sistema

Substitui uma planilha Excel e um protótipo HTML único
(`docs/contagem_oleo.html`) por um sistema de três camadas:

- **Frontend:** React (`frontend/`)
- **Backend:** FastAPI (`backend/`)
- **Banco:** PostgreSQL, com SQLAlchemy + Alembic

Três telas: **Contagem** (9 óleos + 2 graxas fixos), **Inventários**
(peças variáveis importadas de XML) e **Histórico** (dias já fechados).

## Onde estão as decisões já tomadas

Todos em `docs/`. **Leia o(s) relevante(s) antes de implementar qualquer
tarefa** — não improvise uma regra de negócio sem checar se ela já foi
definida:

| Arquivo | Conteúdo |
|---|---|
| `docs/visao-geral.md` | Arquitetura em 3 camadas, estrutura de pastas |
| `docs/banco-de-dados.md` | Schema completo (tabelas, colunas, índices) |
| `docs/rascunho-inventario.md` | Como rascunho/fechado funcionam na mesma tabela |
| `docs/regras-de-negocios.md` | Regras RN01–RN27, com justificativa de cada uma |
| `docs/requisitos.md` | Requisitos funcionais (RF) e não funcionais (RNF) |
| `docs/document-rest-API.md` | Contrato exato de cada endpoint (request/response/erros) |
| `docs/fluxo-de-telas.md` | Fluxo completo da importação de XML, passo a passo |
| `docs/componentes-react.md` | Árvore de componentes React e responsabilidade de cada um |
| `docs/docker-compose.md` | Especificação dos serviços Docker |
| `docs/preparativos-vps.md` | Roteiro passo a passo de deploy numa VPS (Hostinger) |
| `docs/contagem_oleo.html` | Protótipo funcional — referência de comportamento visual e de UX, NÃO de arquitetura |

`SPRINTS.md` (na raiz) é o backlog vivo: lista as tarefas por sprint, com
checkboxes. **Esse arquivo deve ser atualizado a cada tarefa concluída** —
nunca implemente algo sem marcar o checkbox correspondente depois.

## Regras inegociáveis (não redecidir, só aplicar)

Estas já foram debatidas e fechadas — não proponha alternativas para elas
sem que a pessoa peça explicitamente:

1. **Cálculo de diferença/status nunca é feito no frontend.** Sempre no
   backend (ou coluna gerada do Postgres). RN01, RN02, RN03.
2. **Rascunho e contagem fechada são a mesma linha da tabela
   `inventarios`**, diferenciadas só pela coluna `status`. Nunca criar uma
   tabela separada para rascunho. Ver `docs/rascunho-inventario.md`.
3. **Quantidade física zera a cada novo dia; quantidade de sistema NÃO
   zera** — herda o último valor fechado (RN27). Isso vale só para
   óleo/graxa, nunca para peças.
4. **Reimportar XML sempre faz merge, nunca duplica** (RN13) — identidade
   do item é sempre o `codigo` (RN04).
5. **`GET /inventarios/{data}` nunca escreve no banco**, mesmo quando o dia
   ainda não existe (nesse caso retorna `status: "nao_iniciado"` calculado
   na hora).
6. **Nenhum `confirm()`/`alert()` nativo do navegador** — sempre
   `ConfirmDialog`/`AlertDialog` próprios (RNF02).
7. **Toda validação de negócio vive no backend**, mesmo que o frontend
   também valide para dar feedback rápido (RNF08, RN24).
8. **Sem autenticação nesta fase** — não implemente login/usuários a menos
   que explicitamente pedido; está fora de escopo (`docs/requisitos.md`,
   seção 3).

## Convenções técnicas

- API em `snake_case`, versionada em `/api/v1`.
- Datas sempre `AAAA-MM-DD` (ISO 8601) na API; formatação BR só na exibição.
- Erros da API sempre no envelope `{ "erro": { "codigo", "mensagem" } }`.
- Migrações de banco só via Alembic — nunca `ALTER TABLE` manual.
- Autosave no frontend: debounce de ~500ms, uma requisição por item
  alterado (nunca por tecla) — RNF11.

## Pontos que já foram resolvidos (histórico de decisões)

Todos os pontos que antes estavam listados aqui como "em aberto" já foram
decididos pela pessoa. Ver `SPRINTS.md`, seção "Log de decisões", para o
detalhe de cada um:

- "Nova contagem" num dia já fechado pede confirmação reforçada
  (`ConfirmDialog` avisando que a contagem salva será apagada); o dia
  continua `fechado` com `fechado_em` original preservado (RN18) — decidido
  em 2026-08-03.
- Rascunhos nunca fechados **não** aparecem no Histórico (RN25) — decidido
  em 2026-08-05.
- Tamanho de página padrão do histórico = **30** — confirmado em
  2026-08-05.
- Migrações do Alembic rodam via serviço `migrate` separado no
  `docker-compose.yml` (`alembic upgrade head && python -m
  app.seed_items`, nessa ordem), com `backend` dependendo dele via
  `condition: service_completed_successfully` — decidido em 2026-08-09
  (Sprint 7).

Se surgir um novo ponto não coberto por `docs/` durante uma tarefa, pare e
pergunte à pessoa em vez de decidir por conta própria — não reabra os
pontos acima sem que a pessoa peça explicitamente.

## Como trabalhar neste repositório

- `README.md` (raiz) documenta o que cada arquivo do repositório faz.
  **Sempre que uma tarefa criar, apagar, renomear ou mudar claramente a
  responsabilidade de um arquivo, atualize a linha correspondente no
  `README.md` no mesmo commit/sessão** — não deixe para depois. Isso vale
  para `backend-dev` e `frontend-dev` também, não só para quem orquestra.
- Antes de começar qualquer tarefa, abra `SPRINTS.md` e confirme qual é a
  próxima tarefa não concluída do sprint atual.
- Prefira delegar implementação de backend ao subagente `backend-dev` e de
  frontend ao subagente `frontend-dev` — eles têm o system prompt já focado
  na camada certa e nas regras de negócio que ela aplica.
- Ao terminar uma tarefa, marque o checkbox correspondente em
  `SPRINTS.md` e adicione uma linha breve de nota se alguma decisão nova
  precisou ser tomada no caminho.
- Nunca marque uma tarefa como concluída sem rodar os testes relevantes
  (quando existirem) ou, no mínimo, sem confirmar que o código sobe sem
  erro (`docker compose up` ou execução local equivalente).
