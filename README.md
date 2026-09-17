# Sistema de Inventário de Óleo e Peças (Scania)

> Mapa de todos os arquivos do repositório e o que cada um faz.
>
> **Regra de manutenção: este arquivo deve ser atualizado sempre que um
> arquivo for criado, removido, renomeado ou tiver sua responsabilidade
> alterada.** Não é opcional — trate isso como parte da tarefa, do mesmo
> jeito que `SPRINTS.md` é atualizado a cada tarefa concluída. Se você
> (pessoa ou agente) adicionar um arquivo novo e não sabe onde encaixá-lo
> aqui, isso é um sinal de que a estrutura de pastas pode estar errada —
> pare e pense antes de só "jogar" a linha em algum lugar.
>
> Para contexto de arquitetura, regras de negócio e decisões de produto,
> ver `CLAUDE.md` e `docs/`. Este README documenta **o quê cada arquivo é**,
> não **por quê** as decisões foram tomadas — isso já está nos docs
> correspondentes, linkados abaixo quando relevante.

## Visão geral rápida

Três camadas: **frontend** (React/Vite), **backend** (FastAPI +
SQLAlchemy + Alembic) e **banco** (PostgreSQL). Empacotado com Docker
Compose para desenvolvimento e produção (VPS). Detalhes de arquitetura em
`docs/visao-geral.md`.

---

## Raiz do repositório

| Arquivo | O que é |
|---|---|
| `CLAUDE.md` | Contexto do projeto carregado automaticamente pelo Claude Code em toda sessão — arquitetura, regras inegociáveis, onde estão as decisões já tomadas |
| `README.md` | Este arquivo |
| `SPRINTS.md` | Backlog vivo do projeto, por sprint, com checkboxes e log de decisões tomadas durante a implementação |
| `.env.example` | Modelo de variáveis de ambiente para o Docker Compose (Postgres, `DATABASE_URL`, `CORS_ORIGINS`, `DOMAIN`/`ACME_EMAIL` de produção). Copiar para `.env` (não versionado) antes de rodar |
| `.gitignore` | Padrões ignorados pelo Git (`__pycache__/`, `node_modules/`, `dist/`, `.env` e `.env.*` — com exceção de `.env.example`, etc.) |
| `.mcp.json` | Servidores MCP do projeto — registra o MCP do Supabase (projeto `fcmmshbwedjqtgnqutsn`) usado na migração para inspecionar o banco sem precisar da senha. Pede aprovação e login OAuth na primeira sessão de cada máquina |
| `docker-compose.yml` | Definição base dos serviços Docker: `db` (Postgres 16), `migrate` (roda Alembic + seed e sai), `backend` (FastAPI), `frontend` (build de produção via Caddy). Usada sozinha = ambiente de produção "crua" |
| `docker-compose.override.yml` | Sobrescreve a base **automaticamente** em desenvolvimento (Compose carrega os dois por padrão): hot-reload do backend (`--reload`, volume montado), Vite dev server do frontend na porta 5173 |
| `docker-compose.prod.yml` | Ajustes exclusivos de produção, carregados só sob pedido explícito (`-f docker-compose.yml -f docker-compose.prod.yml`): `restart: unless-stopped`, 5 workers do Uvicorn, HTTPS via Caddy (portas 80/443, volumes de certificado), serviço `backup` (dump diário do Postgres) |
| `scripts/backup-postgres.sh` | Script `sh` rodado pelo serviço `backup`: `pg_dump` + `gzip`, aplica retenção de 7 dias, comentário com o comando de restauração |
| `scripts/migrar-supabase.ps1` | Roda `alembic upgrade head` e depois `python -m app.seed_items` contra o Supabase, nessa ordem. Lê a URL de conexão de `backend/.env.supabase` (fora do git) para a senha não passar pela linha de comando; mascara a senha em toda a saída, recusa URL com porta 6543, sem `+psycopg` ou apontando para um projeto Supabase que não seja o atual, e não roda o seed se a migração falhar. `-SomenteMigracao` pula o seed |

## `.claude/` — configuração do Claude Code neste repositório

| Arquivo | O que é |
|---|---|
| `.claude/settings.local.json` | Configurações locais do Claude Code (permissões etc.) — não é parte do sistema, só do ambiente de desenvolvimento assistido |
| `.claude/agents/backend-dev.md` | Subagente especializado em implementar `backend/` (FastAPI/SQLAlchemy/Alembic), com as regras inegociáveis dessa camada |
| `.claude/agents/frontend-dev.md` | Subagente especializado em implementar `frontend/` (React), com as regras inegociáveis dessa camada |
| `.claude/agents/sprint-runner.md` | Subagente orquestrador: lê `SPRINTS.md`, decide a próxima tarefa, delega a `backend-dev`/`frontend-dev`, verifica e atualiza o backlog |
| `.claude/commands/proxima-tarefa.md` | Slash command (`/proxima-tarefa`) que aciona o `sprint-runner` para avançar o backlog |

## `docs/` — documentação de decisões e contrato

| Arquivo | O que é |
|---|---|
| `docs/visao-geral.md` | Arquitetura em 3 camadas e estrutura de pastas do projeto |
| `docs/banco-de-dados.md` | Schema completo do Postgres: tabelas, colunas, tipos, índices, colunas geradas |
| `docs/rascunho-inventario.md` | Como rascunho e contagem fechada convivem na mesma tabela `inventarios` |
| `docs/regras-de-negocios.md` | Regras de negócio RN01–RN27, cada uma com a justificativa |
| `docs/requisitos.md` | Requisitos funcionais (RF) e não funcionais (RNF), incluindo o que está fora de escopo |
| `docs/document-rest-API.md` | Contrato exato de cada endpoint: request, response, códigos de erro |
| `docs/fluxo-de-telas.md` | Fluxo completo de cada tela, incluindo a importação de XML passo a passo |
| `docs/componentes-react.md` | Árvore de componentes React e a responsabilidade de cada um |
| `docs/docker-compose.md` | Especificação dos serviços Docker (o "porquê" por trás dos arquivos `docker-compose*.yml`) |
| `docs/preparativos-vps.md` | Roteiro passo a passo de deploy numa VPS (Hostinger). **Nunca executado** — escrito no Sprint 7, mas nenhuma VPS chegou a ser contratada; até hoje o sistema só rodou em `localhost` |
| `docs/migracao-vercel-supabase.md` | Proposta (não implementada) de migração de infraestrutura para Vercel + Supabase, com conflitos técnicos e pontos em aberto identificados — a **análise** da mudança |
| `docs/deploy-vercel-supabase.md` | Roteiro passo a passo da migração para Vercel + Supabase, do zero (criar contas) ao cutover — a **execução**, com as opções de hospedagem do backend (Vercel serverless ou Render) |
| `docs/estado-da-migracao.md` | **Onde a migração parou**: o que já está pronto, o que falta, como preparar outra máquina para continuar, e as armadilhas já encontradas (reset de senha do Supabase que não aplica, disjuntor do pooler, IPv6). Leia este primeiro ao retomar |
| `docs/contagem_oleo.html` | Protótipo HTML original do sistema — referência de comportamento visual/UX (cores de status, textos, formato de data BR), **não** de arquitetura |

## `backend/` — API (FastAPI + SQLAlchemy + Alembic)

| Arquivo | O que é |
|---|---|
| `backend/requirements.txt` | Dependências Python: `fastapi`, `uvicorn`, `SQLAlchemy`, `alembic`, `psycopg[binary]`, `python-dotenv`, `python-multipart`, `defusedxml` |
| `backend/Dockerfile` | Imagem de produção do backend: `python:3.12-slim`, usuário não-root, healthcheck em `GET /api/v1/health`, `CMD uvicorn` (1 worker por padrão — produção sobrescreve para 5 via `docker-compose.prod.yml`) |
| `backend/.dockerignore` | Evita copiar `__pycache__/`, `.pytest_cache/` etc. para dentro da imagem |
| `backend/alembic.ini` | Configuração do Alembic (aponta para `alembic/env.py` como `script_location`) |
| `backend/alembic/env.py` | Bootstrap das migrações: injeta `DATABASE_URL` real (de `app/database.py`) e os metadados dos models (`app/models.py`) no contexto do Alembic |
| `backend/alembic/versions/0001_initial.py` | Migração inicial: cria as 4 tabelas (`itens`, `inventarios`, `inventario_itens`, `importacoes_xml`), `CHECK`s, `UNIQUE`s e as colunas geradas `diferenca`/`status` (`GENERATED ALWAYS AS ... STORED`) |
| `backend/app/__init__.py` | Marca `app/` como pacote Python (vazio) |
| `backend/app/database.py` | Configura o engine SQLAlchemy (`DATABASE_URL` via variável de ambiente), `SessionLocal`, `Base` declarativo e a dependency `get_db()` usada pelas rotas |
| `backend/app/models.py` | Models SQLAlchemy das 4 tabelas: `Item` (catálogo fixo + peças), `Inventario` (um dia, rascunho ou fechado), `InventarioItem` (lançamento por item/dia), `ImportacaoXML` (auditoria de cada importação) |
| `backend/app/schemas.py` | Schemas Pydantic de request/response: `ItemOleo`, `ItemPeca`, `InventarioResponse`, `InventarioListResponse`, `ImportacaoXMLResponse`, `PatchInventarioItem` |
| `backend/app/seed_items.py` | Popula o catálogo fixo de 9 óleos + 2 graxas em `itens` (idempotente — só insere o que ainda não existe). Roda depois do Alembic, nunca antes (colunas geradas dependem da migração) |
| `backend/app/routers/__init__.py` | Marca `routers/` como pacote Python (vazio) |
| `backend/app/routers/inventarios.py` | Todos os endpoints de `/api/v1/inventarios`: `GET /{data}` (com semeadura RN27), `GET /` (histórico paginado), `PATCH /{data}/itens/{item_id}` (autosave), `POST /{data}/importar-xml` (parsing seguro com `defusedxml`, merge RN13), `POST /{data}/fechar`, `DELETE /{data}/itens`, `GET /{data}/importacoes` |
| `backend/app/main.py` | Monta a aplicação FastAPI: registra o router de inventários, CORS (`CORS_ORIGINS`), handlers globais de exceção (garantem o envelope `{"erro": {...}}` mesmo em erros nativos do FastAPI) e `GET /api/v1/health` |

## `frontend/` — SPA (React + Vite + TypeScript)

| Arquivo | O que é |
|---|---|
| `frontend/package.json` / `package-lock.json` | Dependências e scripts npm (`dev`, `build`, etc.) |
| `frontend/tsconfig.json` / `tsconfig.node.json` | Configuração do compilador TypeScript (app e ferramentas de build, respectivamente) |
| `frontend/vite.config.ts` | Configuração do Vite (bundler/dev server) |
| `frontend/vercel.json` | Configuração da Vercel para o frontend: reescreve qualquer rota para `/index.html`, para o `react-router` funcionar ao abrir `/historico` direto ou dar F5 (equivalente ao `try_files` do `Caddyfile`) |
| `frontend/index.html` | HTML raiz da SPA, ponto de montagem do React |
| `frontend/.env.example` | Modelo de variável de ambiente do frontend (`VITE_API_URL`, URL base da API) |
| `frontend/.dockerignore` | Evita copiar `node_modules/`, `dist/` etc. para dentro da imagem |
| `frontend/Dockerfile` | Build multi-stage: estágio `build` (`node:20-alpine`, `npm install` + `npm run build`) e estágio `production` (`caddy:2-alpine`, serve os estáticos e faz proxy de `/api/*`) |
| `frontend/Caddyfile` | Configuração do Caddy em produção: HTTPS automático via `DOMAIN` (ou HTTP puro na porta 80 sem domínio), serve os estáticos do build e proxeia `/api/*` para `backend:8000` |

### `frontend/src/`

| Arquivo | O que é |
|---|---|
| `main.tsx` | Ponto de entrada da SPA — monta `<App />` no DOM |
| `App.tsx` | Componente raiz: roteamento (`react-router-dom`) entre Contagem/Inventários/Histórico e o estado elevado da data selecionada (compartilhado entre as três telas) |
| `index.css` | Estilos globais da aplicação |
| `vite-env.d.ts` | Tipos ambiente do Vite (ex: `import.meta.env`) |
| `api/inventarios.ts` | Cliente HTTP único para toda a API: tipos TypeScript espelhando os schemas do backend (em `snake_case`, sem conversão), `ApiError` tipado para o envelope de erro, e uma função por endpoint (`getInventarioDoDia`, `patchItem`, `listarInventarios`, `importarXML`, `fecharInventario`, `listarImportacoes`, `limparItensDoDia`) |
| `utils/data.ts` | `dataLocalHoje()`/`formatarDataISO()` — data no fuso local (nunca `toISOString()`, que quebra perto da meia-noite em UTC-3) |
| `hooks/useDebouncedSave.ts` | Hook genérico de autosave com debounce (~500ms) por chave — base do RNF11, reaproveitado por óleos e peças |
| `hooks/useInventarioDoDia.ts` | Busca o inventário do dia (`GET`) e aplica autosave por item (`PATCH`) via `useDebouncedSave`; nunca recalcula `diferenca`/`status` no cliente |
| `hooks/useHistorico.ts` | Busca a listagem paginada do histórico (`GET /inventarios`) com paginação incremental (`carregarMais()`) |
| `pages/ContagemPage.tsx` | Tela "Contagem": lista de `OleoCard` (9 óleos + 2 graxas), busca, resumo, ações de fechar/nova contagem |
| `pages/InventariosPage.tsx` | Tela "Inventários": lista de `PecaListItem` (peças importadas de XML), botão de importação, histórico de importações do dia |
| `pages/HistoricoPage.tsx` | Tela "Histórico": lista paginada de dias já fechados, com atalho para abrir um dia em Contagem |
| `components/layout/Header.tsx` | Cabeçalho fixo do app (título) |
| `components/layout/TabNav.tsx` | Navegação entre as três abas (Contagem/Inventários/Histórico) |
| `components/layout/DateSelector.tsx` | Seletor de data compartilhado entre Contagem e Inventários |
| `components/layout/ActionsFooter.tsx` | Rodapé de ações (salvar contagem do dia / nova contagem), incluindo `PrintInventoryButton` |
| `components/contagem/OleoCard.tsx` | Card de um óleo/graxa: campos condicionais (Estoque+Oficina vs. Físico único, conforme `possui_quebra_estoque_oficina`), `ComparisonBar`, `StatusBadge`, `ObservacaoInput` |
| `components/inventarios/PecaListItem.tsx` | Linha de uma peça na tela Inventários, com `StatusBadge` |
| `components/inventarios/ImportXMLButton.tsx` | Botão de upload do XML de conferência — envia o arquivo cru via `multipart/form-data`, sem parsing no navegador |
| `components/inventarios/ImportSummaryDialog.tsx` | Modal com o resumo da importação (itens novos/atualizados, códigos duplicados) |
| `components/inventarios/ImportacoesHistoricoList.tsx` | Lista as importações de XML já feitas no dia selecionado |
| `components/historico/HistoricoListItem.tsx` | Uma linha da lista do Histórico (data, status, `SummaryBar` do resumo) |
| `components/impressao/PrintInventoryButton.tsx` | Busca os dados do dia e monta o HTML de impressão |
| `components/comuns/StatusBadge.tsx` | Badge visual de status (`correto`/`sobra`/`falta`) — só exibe o que a API manda, nunca calcula |
| `components/comuns/SummaryBar.tsx` | Barra de resumo (contagem de falta/sobra/correto) |
| `components/comuns/ComparisonBar.tsx` | Barra comparativa físico × sistema de um item |
| `components/comuns/SearchInput.tsx` | Campo de busca reutilizável (filtro de peças) |
| `components/comuns/ObservacaoInput.tsx` | Campo de observação por item, com rótulo configurável |
| `components/comuns/SaveStatusIndicator.tsx` | Indicador visual do estado do autosave (ocioso/salvando/salvo/erro) |
| `components/comuns/EditingBanner.tsx` | Aviso exibido ao editar um dia já fechado |
| `components/comuns/ConfirmDialog.tsx` | Modal de confirmação próprio (nunca `confirm()` nativo — RNF02) |
| `components/comuns/AlertDialog.tsx` | Modal de aviso próprio (nunca `alert()` nativo — RNF02) |

---

## Como manter este README correto

Ao terminar qualquer tarefa que crie, apague, renomeie ou mude claramente a
responsabilidade de um arquivo:

1. Atualize a linha correspondente (ou adicione/remova a linha) na tabela
   certa acima.
2. Se a tarefa criou uma pasta nova sem tabela própria aqui, adicione uma
   seção nova seguindo o mesmo formato (`### caminho/`, tabela
   `Arquivo | O que é`).
3. Não precisa registrar mudanças internas que não alterem o propósito do
   arquivo (ex: um refactor interno de uma função) — só o que muda *o que o
   arquivo é/faz* do ponto de vista de quem está navegando o repositório.
