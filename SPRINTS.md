# Sprints — Sistema de Inventário de Óleo e Peças (Scania)

> Backlog vivo. Cada tarefa tem um checkbox — marque `[x]` só depois de
> implementada e verificada (código sobe sem erro, testes relevantes
> passam quando existirem). Adicione uma nota abaixo da tarefa se alguma
> decisão nova precisou ser tomada durante a implementação.
>
> Regra de ouro: nunca pule pra uma tarefa de um sprint posterior enquanto
> houver tarefa não concluída num sprint anterior que ela dependa — as
> dependências estão anotadas em cada sprint.

---

## ⚠️ Pendências de verificação local (ambiente de agente sem Docker/Node)

As sessões de agente que trabalharam neste backlog rodaram numa sandbox
**sem Docker e sem Node/npm instalados**. Todo o trabalho de backend foi
validado via `pip install` + import direto dos módulos Python; nada foi
validado de ponta a ponta contra um Postgres real ou um build real do
frontend. Antes de confiar no backlog como "pronto", rode na sua máquina:

```bash
docker compose up --build
```

E confirme especificamente:

- [x] Os três serviços (`db`, `backend`, `frontend`) sobem sem erro
      (ver checkbox pendente no Sprint 0). **Exigiu duas correções** —
      ver log de decisões (`tsconfig.node.json` sem `composite`, e
      `frontend` sem `build.target` no override).
- [x] `alembic upgrade head` roda contra o Postgres real sem erro.
      **Exigiu duas correções** de caminho (`script_location` e o
      `sys.path` do `env.py`) — ver log de decisões.
- [ ] **Ordem seed vs. migração:** `backend/app/seed_items.py` chama
      `Base.metadata.create_all(bind=engine)` antes de popular o catálogo.
      As colunas geradas `diferenca`/`status` só existem de fato via
      `sa.Computed(...)` na migração Alembic (`0001_initial.py`) —
      `models.py` só declara `server_default` simples. Se o seed rodar
      antes de `alembic upgrade head` num banco novo, as tabelas podem ser
      criadas sem essas colunas geradas corretamente, furando a regra de
      "migração só via Alembic". Verificar com `\d+ inventarios` no
      `psql` se `diferenca`/`status` aparecem como `GENERATED ALWAYS AS`.
      Se não aparecerem, é necessário corrigir a ordem de inicialização
      (rodar `alembic upgrade head` antes do seed) — **não decidido ainda,
      confirmar com a pessoa antes de mexer**, pois se conecta ao ponto em
      aberto do Sprint 7 sobre onde as migrações rodam em produção.
- [x] **Verificado em 2026-08-03:** `diferenca` e `status` aparecem como
      `GENERATED ALWAYS` em `inventario_itens`, e o cálculo foi conferido
      na prática (físico 5 / sistema 0 → `diferenca 5`, `status sobra`).
      **Porém nada no `docker-compose` roda migração nem seed** — o banco
      subiu completamente vazio e ambos tiveram que ser rodados à mão.
      A ordem correta (Alembic antes do seed) ainda não está automatizada;
      continua sendo o ponto em aberto do Sprint 7.
- [x] `GET /api/v1/inventarios/{data}` para uma data nova retorna o
      catálogo correto de óleos/graxas (valida a correção do
      `seed_items.py`). **Verificado:** 11 itens (9 óleos + 2 graxas),
      `status: "nao_iniciado"`, e sem escrita no banco (regra 5 do
      `CLAUDE.md` confirmada).
- [x] `npm install` + build do `frontend/` completam sem erro
      (após a correção do `tsconfig.node.json`).
- [x] Frontend consegue chamar a API sem erro de CORS (valida a correção
      do `.split(",")` em `backend/app/main.py`). **Verificado no nível do
      header:** requisição com `Origin: http://localhost:5173` responde
      `access-control-allow-origin` correto. **Também confirmado pela UI
      real:** a tela de Contagem carrega os 11 itens e o autosave grava,
      ambos via `fetch` do navegador em `localhost:5173` → `localhost:8000`.

### 🐛 Bug encontrado durante a validação — CORRIGIDO em 2026-08-03

- [x] **`GET /inventarios/{data}` no caminho "dia existe" devolve só os
      itens que já têm linha em `inventario_itens`, não o catálogo fixo.**
      Reproduzido: num dia novo o GET devolve 11 óleos; após um único
      PATCH, passa a devolver **1**. Na tela de Contagem isso faz os
      outros 10 óleos sumirem ao recarregar a página.
      Causa: `backend/app/routers/inventarios.py` linha ~189 parte de
      `select(InventarioItem).join(Item)`, enquanto o caminho
      "nao_iniciado" (linha ~146) parte do catálogo completo. O caminho
      "existe" precisa partir do catálogo de óleos/graxas e fazer
      `LEFT JOIN` com as linhas existentes. Peças seguem só as que existem
      (vêm do XML).
      **Correção aplicada:** os dois caminhos agora partem do mesmo
      catálogo (`catalogo_oleos_graxas`) e da mesma herança RN27
      (`ultimas_quantidades_sistema_fechadas`), que estavam duplicados
      inline e foi essa duplicação que deixou um caminho para trás.
      Verificado: dia com rascunho volta a devolver 11 óleos, e o item
      editado preserva o valor.

- [x] **A data inicial da tela usa UTC, não a data local.** — CORRIGIDO em 2026-08-03.
      `frontend/src/App.tsx` linha 10 faz
      `new Date().toISOString().slice(0, 10)`, e `toISOString()` sempre
      converte para UTC. No horário de Brasília (UTC-3), a partir das 21h
      o app abre **no dia seguinte**. Observado na prática durante a
      validação: às 22h de 2026-08-03 a tela abriu em 2026-08-04 e o
      autosave criou o rascunho na data errada. Contagem feita à noite
      cairia no dia errado. Correção: montar a string a partir dos
      componentes locais (`getFullYear`/`getMonth`/`getDate`) em vez de
      `toISOString()`.
      **Correção aplicada:** criado `frontend/src/utils/data.ts` com
      `dataLocalHoje()` e `formatarDataISO()`, e `App.tsx` passou a usar o
      helper. Verificado no navegador (fuso `America/Sao_Paulo`, às 22h de
      2026-08-03): a tela abre em 2026-08-03, não mais em 2026-08-04.
      **Use esses helpers em qualquer data nova** (Sprint 3 "Nova
      contagem", Sprint 5 Histórico) em vez de `toISOString()`.

---

## Sprint 0 — Fundação (bloqueia todo o resto)

- [x] Criar estrutura de pastas (`frontend/`, `backend/`, `docs/`) conforme `docs/visao-geral.md` seção 6
- [x] Configurar `backend/` — FastAPI + SQLAlchemy + Alembic + `requirements.txt`
- [x] Configurar `frontend/` — projeto React (Vite) + estrutura de `src/` conforme `docs/componentes-react.md` seção 1
- [x] Criar migração Alembic inicial: tabelas `itens`, `inventarios`, `inventario_itens`, `importacoes_xml` (`docs/banco-de-dados.md`)
- [x] Seed do catálogo fixo (9 óleos + 2 graxas) em `itens`
- [x] `docker-compose.yml` + `docker-compose.override.yml` + `.env.example` (`docs/docker-compose.md`)
- [x] Confirmar que `docker compose up` sobe os três serviços (`db`, `backend`, `frontend`) sem erro — verificado em 2026-08-03, após as correções registradas no log de decisões

**Dependências:** nenhuma — é o ponto de partida.
**Não avançar para o Sprint 1 sem isso funcionando.**

> **Nota de verificação (sessão de retomada):** este código já existia no
> repositório antes desta sessão, mas o `SPRINTS.md` nunca tinha sido
> atualizado. Ao auditar, encontrei e corrigi (via `backend-dev`) três bugs
> reais que impediam a aplicação de subir: (1) `backend/requirements.txt`
> fixava `psycopg[binary]==3.4.0`, versão inexistente no PyPI — corrigido
> para `3.2.10`; (2) `backend/app/database.py` e `.env.example` usavam
> `postgresql://...` sem o dialeto `+psycopg`, o que faria o SQLAlchemy
> tentar carregar `psycopg2` (não instalado) — corrigido para
> `postgresql+psycopg://...`; (3) `backend/app/main.py` chamava
> `.split(",")` numa lista em vez de na string de `CORS_ORIGINS` — corrigido.
> Também encontrei que `backend/app/seed_items.py` tinha um catálogo de 9
> óleos + 2 graxas **inventado**, divergente do catálogo real documentado em
> `docs/contagem_oleo.html` (constantes `OLEOS`/`GRAXAS`) e confirmado por
> `docs/banco-de-dados.md` seção 8 (`E7`, código `45-3247280`) — corrigido
> para usar exatamente a lista do protótipo.
>
> **Verificado nesta sandbox (sem Docker/Node disponíveis):** `pip install
> -r requirements.txt` completa sem erro; `python -c "from app.main import
> app"` e `from app.routers import inventarios` importam sem erro e
> registram as rotas esperadas (`/api/v1/inventarios`,
> `/api/v1/inventarios/{data}`, `/api/v1/inventarios/{data}/importacoes`,
> `/api/v1/health`); `seed_items.FIXED_ITEMS` gera exatamente 9 itens
> `categoria=oleo` + 2 `categoria=graxa` com os códigos corretos; a
> migração Alembic (`0001_initial.py`) tem as 4 tabelas com as colunas,
> `CHECK`s, `UNIQUE`s e colunas geradas (`diferenca`/`status`) exatamente
> como especificado em `docs/banco-de-dados.md`.
>
> **Não verificado nesta sandbox** (ambiente sem Docker e sem Node/npm
> instalados): a migração Alembic nunca rodou contra um Postgres real; o
> `frontend/` nunca foi instalado (`npm install`) nem buildado; e
> `docker compose up` nunca foi executado de fato. Por isso o último
> checkbox do sprint continua **não marcado** — só deve ser marcado depois
> que a pessoa confirmar, na própria máquina, que os três serviços sobem
> sem erro.

---

## Sprint 1 — Endpoints de leitura + componentes visuais "burros"

Pode ser feito em paralelo: metade backend, metade frontend, sem
interdependência real dentro do próprio sprint.

### Backend
- [x] `GET /api/v1/inventarios/{data}` — caminho "existe" (RF01, RF10, RF21)
- [x] `GET /api/v1/inventarios/{data}` — caminho "não iniciado" com semeadura RN27
- [x] `GET /api/v1/inventarios` — listagem paginada (RF20, RN25)
- [x] `GET /api/v1/inventarios/{data}/importacoes` (RF15) — pode retornar lista vazia por enquanto

### Frontend
- [x] `StatusBadge`, `SummaryBar`, `ComparisonBar` (componentes comuns, sem lógica de API)
- [x] `Header`, `TabNav`, `DateSelector`, `ActionsFooter` (layout)
- [x] `ConfirmDialog`, `AlertDialog` (RNF02)
- [x] `SearchInput`, `ObservacaoInput`

**Dependências:** Sprint 0.
**Decisão a confirmar antes de fechar este sprint:** tamanho de página
padrão do histórico (`docs/document-rest-API.md` seção 8).

> **Nota de verificação:** implementação já existente, auditada nesta
> sessão. O código em `backend/app/routers/inventarios.py` implementa os
> três endpoints com a estrutura de resposta (`resumo_oleos`,
> `resumo_pecas`, `oleos`, `pecas`, `status: "nao_iniciado"`) conforme
> `docs/document-rest-API.md` seção 2.1/2.2/2.7, e já usa `tamanho_pagina`
> padrão `30` (o valor que o próprio documento sugere na seção 8, mas que
> ainda consta como "decisão nova" não formalmente confirmada com a
> pessoa — ver pendência abaixo). Os componentes de frontend listados
> existem em `frontend/src/components/comuns/` e `frontend/src/components/layout/`
> e seguem a estrutura de pastas de `docs/componentes-react.md` seção 1
> (implementados em TypeScript/`.tsx`, não `.jsx` como no doc — detalhe de
> stack, não diverge de nenhuma regra de negócio). `ConfirmDialog`/`AlertDialog`
> não usam `confirm()`/`alert()` nativos (RNF02) — confirmado por leitura de
> código.
>
> **Não verificado nesta sandbox:** comportamento real dos endpoints contra
> um Postgres de verdade (só validei import dos módulos e schema da
> migração por leitura); render/funcionamento real dos componentes React no
> navegador (sem Node/npm nesta sandbox, não rodei `npm install`/`vite`).
>
> **Pendência a confirmar com a pessoa antes de considerar o Sprint 1
> formalmente fechado:** o tamanho de página padrão do histórico (30) já
> está implementado — só falta a confirmação explícita de que esse é o
> valor desejado (`docs/document-rest-API.md` seção 8 trata isso como
> sugestão, não decisão fechada).

---

## Sprint 2 — Autosave e página Contagem

- [x] Backend: `PATCH /api/v1/inventarios/{data}/itens/{item_id}` completo (RF01, RF02, RF03, RF06, RF10) — criação de `inventarios`/`inventario_itens` na primeira alteração (RN16)
- [x] Backend: validações 400/404/422 do PATCH conforme `docs/document-rest-API.md` seção 2.3
- [x] Frontend: hook `useDebouncedSave` (RNF11)
- [x] Frontend: hook `useInventarioDoDia(data)`
- [x] Frontend: `OleoCard` completo, ligado ao PATCH via autosave
- [x] Frontend: `ContagemPage` montada (Header + DateSelector + SummaryBar + lista de OleoCard + ActionsFooter)
- [x] Frontend: `SaveStatusIndicator` refletindo sucesso/falha real da chamada HTTP
- [x] Teste manual: editar um óleo, recarregar a página, confirmar que o valor persistiu
      — **verificado no navegador em 2026-08-03**, após a correção do bug do GET
      registrado no topo deste arquivo. Digitado Estoque 4 + Oficina 3 no card do E7
      (`45-3247280`); o autosave criou o rascunho do dia (RN16) e gravou
      `quantidade_fisica = 7` com `status = sobra` (diferença calculada pela coluna
      gerada do Postgres, RN01–RN03). Após recarregar, a tela voltou com os 11 óleos,
      o E7 com 4/3/7 e o resumo em `Sobra 1 / Correto 10`.

**Dependências:** Sprint 1 (reaproveita a lógica de "criar inventário do dia se não existir" do `GET`).

> **Nota de implementação — backend (`PATCH /inventarios/{data}/itens/{item_id}`):**
> implementado em `backend/app/routers/inventarios.py` (função `patch_item`),
> reaproveitando `parse_data`/`montar_item`/`contar_resumo` já existentes. O
> corpo da requisição é recebido como `dict` cru (`Body(default=None)`), não
> como um modelo Pydantic amarrado diretamente ao parâmetro — decisão tomada
> para poder devolver exatamente `400` (tipo errado) vs `422` (regra de
> negócio violada) como a seção 2.3 de `docs/document-rest-API.md` exige, já
> que o comportamento padrão do FastAPI para falha de validação de um
> `BaseModel` como parâmetro é sempre `422`, misturando os dois casos.
> `diferenca`/`status` nunca são atribuídos pelo código — continuam sendo
> colunas `GENERATED ALWAYS AS ... STORED` do Postgres, só lidas de volta
> após o commit. Interpretei "tentar enviar um campo incompatível" (RNF08)
> como a simples presença da chave no JSON, mesmo com valor `null` — ou
> seja, `{"estoque": null}` para uma peça também é `422`, não passa em
> silêncio. Também foram adicionados em `backend/app/main.py` dois
> `exception_handler`s globais (`RequestValidationError` e
> `StarletteHTTPException`) para garantir que qualquer erro nativo do
> FastAPI (JSON malformado, parâmetro de path com tipo errado, etc.) também
> saia no envelope `{"erro": {"codigo", "mensagem"}}` exigido pela seção 4 —
> antes disso só as checagens manuais dos routers usavam esse formato.
>
> **Verificado (backend, sem Postgres real disponível nesta sandbox):**
> `python -c "from app.main import app"` importa sem erro e registra a rota
> `PATCH /api/v1/inventarios/{data}/itens/{item_id}`. Um smoke test com
> `fastapi.testclient.TestClient` contra SQLite em memória cobriu: `400`
> para data inválida e tipo errado; `404` para item inexistente; `422` para
> óleo recebendo `quantidade_fisica`, peça recebendo `estoque` e quantidade
> negativa; criação da linha de `inventarios` (`status="rascunho"`) e de
> `inventario_itens` só na primeira alteração de fato (RN16); soma
> `estoque + oficina` como `quantidade_fisica` de um óleo (RN07); e a
> semeadura RN27 (um novo dia herdou `quantidade_sistema` de um inventário
> fechado anterior para o mesmo item). **Limitação:** como `diferenca`/
> `status` só são `GENERATED ALWAYS AS ... STORED` de fato no Postgres real
> (o modelo SQLAlchemy declara `server_default` estático, não `Computed()`),
> o smoke test não pôde validar que o `200 OK` reflete corretamente a
> fórmula RN01/RN02 — só confirmável contra Postgres real via
> `docker compose up`.
>
> **Nota de implementação — frontend:** criados `frontend/src/api/inventarios.ts`
> (cliente HTTP com `ApiError` tipado para o envelope `{ erro: { codigo,
> mensagem } }`), `frontend/src/hooks/useDebouncedSave.ts` (debounce
> genérico por chave, ~500ms, reaproveitável também pelo futuro
> `PecaListItem` do Sprint 4) e `frontend/src/hooks/useInventarioDoDia.ts`
> (busca o `GET` e aplica autosave por item via `PATCH`, sem recalcular
> `diferenca`/`status`/`quantidade_fisica` no frontend — sempre vêm prontos
> da resposta da API). `OleoCard.tsx` e `ContagemPage.tsx` foram religados a
> esses hooks; `SaveStatusIndicator.tsx` é novo em `components/comuns/`.
>
> Decisões de UX tomadas dentro do escopo já documentado (não são novas
> regras de negócio): os botões de `ActionsFooter` na `ContagemPage` hoje
> abrem um `AlertDialog` (nunca `alert()` nativo, RNF02) avisando que
> "Salvar contagem do dia"/"Nova contagem" ainda não estão implementados,
> em vez de ficar sem nenhum feedback — esses endpoints (`POST /fechar`,
> `DELETE /itens`) são do Sprint 3, fora do escopo desta tarefa.
> `ObservacaoInput` ganhou um `label` opcional (usado como "Observação"
> dentro do `OleoCard`, por item — RF06) em vez do texto fixo "Observação do
> dia" que só fazia sentido para um campo de página inteira não previsto em
> nenhum documento; o antigo campo de observação de página inteira que
> existia na versão mockada do `ContagemPage` foi removido.
>
> **Não verificado (frontend):** esta sandbox não tem Node/npm instalados —
> não foi possível rodar `npm install`, `npm run dev`, `tsc --noEmit`, nem
> qualquer teste real de browser. A verificação foi feita por leitura
> cuidadosa de tipos, imports e assinaturas de props, mais uma checagem
> manual de balanceamento de chaves/parênteses nos arquivos novos/alterados.
> Falta, numa máquina com o toolchain completo: `npm install && npm run dev`
> (idealmente `npm run build` para um type-check real via `tsc`) e o teste
> manual de ponta a ponta descrito no checkbox acima (editar um óleo,
> confirmar que o PATCH dispara uma única vez ~500ms após parar de digitar,
> recarregar a página e confirmar que o valor persistiu).

---

## Sprint 3 — Fechar dia e Nova contagem

- [x] Backend: `POST /api/v1/inventarios/{data}/fechar` (RF18, RF19, RN17–RN20)
- [x] Backend: `DELETE /api/v1/inventarios/{data}/itens` (RF22, RN21) — óleos zeram físico mas mantêm sistema (RN27); peças são apagadas
- [x] Frontend: `ActionsFooter` ligado às duas rotas acima
- [x] Frontend: `ConfirmDialog` de "confirma fechar esse dia?" antes de `POST /fechar`
- [x] Frontend: `EditingBanner` (aparece ao editar um dia já fechado)

> **Verificado em 2026-08-03**, backend via HTTP e frontend no navegador:
> - `POST /fechar` em dia inexistente → `404` com o envelope de erro padrão.
> - Re-fechar preserva o `fechado_em` do primeiro fechamento (RN18) —
>   conferido comparando as duas respostas.
> - `DELETE /itens`: óleo e graxa mantiveram `quantidade_sistema` (9 e 5) e
>   tiveram físico/estoque/oficina/observação zerados; a linha da peça de
>   teste foi apagada; `pecas: []` na resposta (RN21, RN27).
> - Na tela: dia sem lançamento → `AlertDialog` explicando que não há o que
>   salvar; dia em rascunho → "Confirma fechar a contagem desse dia?";
>   dia fechado → "Esse dia já tem uma contagem salva..." no salvar e o
>   aviso reforçado no "Nova contagem". `EditingBanner` aparece ao fechar e
>   continua após limpar. Nenhum `confirm()`/`alert()` nativo (RNF02).
>
> **Bug corrigido no caminho:** o `status` do dia ficava defasado no estado
> local — depois do primeiro PATCH o backend criava o rascunho (RN16), mas
> a página continuava tratando o dia como `nao_iniciado` e recusava fechar.
> `useInventarioDoDia` agora promove `nao_iniciado` → `rascunho` ao aplicar
> a resposta do PATCH (um dia já `fechado` continua fechado, RN19).

**Dependências:** Sprint 2.
**Ponto em aberto — RESOLVIDO em 2026-08-03** (ver log de decisões): limpar
um dia já fechado pede confirmação reforçada, e o dia continua fechado.
**Texto original do ponto em aberto:** se limpar um
dia já fechado deve pedir confirmação extra (`docs/rascunho-inventario.md`
seção 6) — perguntar à pessoa antes de decidir sozinho.

---

## Sprint 4 — Importação de XML (a mais complexa)

Sub-tarefas na ordem do `docs/fluxo-de-telas.md` seção 4:

- [ ] Backend: validação de upload + XML bem formado (`422` se inválido) — RNF08
- [ ] Backend: parsing dos elementos `<Dados>` (Coluna1/2/4/6/7)
- [ ] Backend: detecção de códigos duplicados dentro do arquivo (RN14)
- [ ] Backend: cruzamento com `itens` por código (RN10)
- [ ] Backend: atualização de óleos/graxas conhecidos — só `quantidade_sistema` (RN11)
- [ ] Backend: upsert de peças novas/já vistas, preservando físico em reimportação (RN12, RN13)
- [ ] Backend: gravação em `importacoes_xml` para auditoria (RN15)
- [ ] Backend: tudo dentro de uma única transação com rollback em falha (4.8)
- [ ] Frontend: `ImportXMLButton` (upload cru, sem parsing no navegador — RF07)
- [ ] Frontend: `ImportSummaryDialog` mostrando o resumo retornado
- [ ] Frontend: `PecaListItem` + `InventariosPage` completa
- [ ] Frontend: `SearchInput` filtrando a lista de peças (RF13, RNF03)
- [ ] Teste manual: importar o mesmo XML duas vezes, confirmar que não duplica e que o físico já preenchido não é sobrescrito

**Dependências:** Sprint 2 (reaproveita a lógica de "criar inventário do dia").
**Atenção:** este sprint concentra a maior parte da regra de negócio —
não paralelizar as sub-tarefas de backend entre pessoas diferentes, é mais
seguro uma pessoa/uma sessão só levar do início ao fim.

---

## Sprint 5 — Histórico

- [ ] Frontend: hook `useHistorico()`
- [ ] Frontend: `HistoricoListItem` + `HistoricoPage`
- [ ] Frontend: "Abrir" um dia do histórico carrega Contagem/Inventários com os dados daquele dia (RF21, RN26)
- [ ] Teste manual: abrir um dia fechado, editar um valor, salvar de novo, confirmar que `fechado_em` original não mudou (RN18)

**Dependências:** Sprints 1, 2 e 3.

---

## Sprint 6 — Impressão e polimento

- [ ] Frontend: `PrintInventoryButton` (busca dados do dia antes de montar o HTML de impressão)
- [ ] Revisão de consistência visual (RNF01) entre as três telas
- [ ] Revisão de acessibilidade básica dos modais (`ConfirmDialog`/`AlertDialog`)
- [ ] `GET /inventarios/{data}/importacoes` consumido de fato em alguma tela (hoje só existe a rota)

**Dependências:** Sprints 1–5.

---

## Sprint 7 — Docker e implantação

- [ ] Dockerfile do backend (produção)
- [ ] Dockerfile multi-stage do frontend (dev com Vite / produção com Nginx)
- [ ] Confirmar healthcheck do `db` funcionando com `depends_on: condition: service_healthy`
- [ ] Decidir e documentar onde as migrações do Alembic rodam (`docs/docker-compose.md` seção 8) — **perguntar à pessoa antes de implementar**
- [ ] Teste de ponta a ponta: `docker compose up` do zero, sem nenhum ambiente pré-configurado, até conseguir importar um XML e fechar um dia

**Dependências:** todos os sprints anteriores funcionando localmente sem Docker.

> **Nota:** já existem `backend/Dockerfile` e `frontend/Dockerfile` no
> repositório (não avaliados a fundo nesta sessão, pois o Sprint 7 depende
> de todos os anteriores estarem prontos primeiro). Não marquei nenhum
> checkbox deste sprint — fica para quando chegarmos nele na ordem correta.

---

## Log de decisões tomadas durante a implementação

> Preencha aqui sempre que uma tarefa exigir uma decisão que não estava
> fechada nos documentos de `docs/`. Formato: `[Sprint X] Pergunta → decisão → data`.

- [Sprint 0] `backend/requirements.txt` fixava `psycopg[binary]==3.4.0`
  (versão inexistente no PyPI, bug técnico, não decisão de negócio) →
  corrigido para `psycopg[binary]==3.2.10` (mais antiga da série 3.2.x
  estável com wheel binário disponível, compatível com `SQLAlchemy==2.0.32`)
  → 2026-08-03.
- [Sprint 0] `backend/app/database.py` e `.env.example` usavam
  `DATABASE_URL=postgresql://...` (dialeto padrão `psycopg2`, não
  instalado) → corrigido para `postgresql+psycopg://...` (dialeto do
  `psycopg` v3, que é o que está no `requirements.txt`) → 2026-08-03.
- [Sprint 0] `backend/app/main.py` chamava `.split(",")` numa `list`
  em vez de numa string, quebrando o parsing de `CORS_ORIGINS` →
  corrigido para ler a variável como string e só depois dar `.split(",")`
  → 2026-08-03.
- [Sprint 0] `backend/app/seed_items.py` tinha um catálogo fixo de 9 óleos
  + 2 graxas com códigos/descrições inventados, divergentes do catálogo
  real já documentado em `docs/contagem_oleo.html` (constantes
  `OLEOS`/`GRAXAS`) e confirmado por `docs/banco-de-dados.md` seção 8
  (exemplo do item `E7`, código `45-3247280`) → corrigido para usar
  exatamente a lista do protótipo (E7, LDF3, LDF4, LDF5, STO MINERAL
  85W140, STO SINTÉTICO 80W90, MTF 75W80, STO 75W90, STO2 75W140; GRAXA
  CARDAN, GRAXA USO GERAL) → 2026-08-03.
- [Sprint 0/1] Verificação completa via `docker compose up` (Sprint 0,
  último checkbox) e via `npm install`/build do frontend não pôde ser
  feita nesta sessão porque o ambiente de execução não tem Docker nem
  Node/npm instalados. A verificação backend foi feita via `pip install` +
  import dos módulos Python (`app.main`, `app.routers.inventarios`) com
  sucesso, e leitura de código comparada aos documentos de `docs/`. A
  verificação final de ponta a ponta depende da pessoa rodar
  `docker compose up` na própria máquina → 2026-08-03.
- [Sprint 0] `frontend/tsconfig.node.json` era referenciado por
  `tsconfig.json` (`references`) mas não tinha `"composite": true`,
  quebrando `npm run build` com `TS6306` e derrubando o build da imagem →
  adicionado `"composite": true` e `"skipLibCheck": true`, alinhando com o
  template padrão do Vite (bug técnico, não decisão de negócio)
  → 2026-08-03.
- [Sprint 0] `frontend/Dockerfile` é multi-stage terminando no estágio
  `production` (Nginx), mas o `docker-compose.override.yml` mandava rodar
  `npm run dev` — o contêiner morria com `npm: not found` (exit 127) →
  adicionado `build.target: build` ao serviço `frontend` no override, que
  é exatamente o comportamento que `docs/docker-compose.md` seção 7
  descreve ("rodar o frontend no modo Vite em vez do build de produção")
  → 2026-08-03.
- [Sprint 0] `backend/alembic.ini` tinha `script_location = backend/alembic`,
  caminho válido só a partir da raiz do repositório; dentro do contêiner o
  `WORKDIR` já é o próprio `backend/` (`/app`), então o Alembic falhava com
  `Path doesn't exist: '/app/backend/alembic'` → corrigido para
  `script_location = alembic` (layout padrão do Alembic, relativo ao
  `alembic.ini`) → 2026-08-03.
- [Sprint 0] `backend/alembic/env.py` montava o `sys.path` com
  `os.path.join(config.config_file_name, "..", "..")`, que resolve para `/`
  em vez de `/app`, causando `ModuleNotFoundError: No module named
  'app.database'` → corrigido para
  `sys.path.insert(0, os.path.dirname(os.path.abspath(config.config_file_name)))`
  → 2026-08-03.
- [Sprint 0] Não existia `.env` na raiz, só `.env.example`. O Compose
  interpola `$POSTGRES_USER` (healthcheck do `db`) e `${POSTGRES_USER}`
  (`DATABASE_URL` do `.env.example`) a partir de um `.env` na raiz, que não
  existia → criado `.env` local (já coberto pelo `.gitignore`) a partir do
  `.env.example`. **Fica em aberto** se o `docker-compose.yml` deveria
  apontar `env_file` para `.env` em vez de `.env.example`, que é o mais
  convencional → 2026-08-03.
- [Sprint 1] `GET /inventarios/{data}` montava a resposta de duas formas
  diferentes: o caminho "nao_iniciado" partia do catálogo fixo, o caminho
  "dia existe" partia só das linhas de `inventario_itens`. Resultado: após
  o primeiro autosave, a tela de Contagem perdia 10 dos 11 óleos ao
  recarregar (bug técnico, não decisão de negócio) → extraídos
  `catalogo_oleos_graxas`, `ultimas_quantidades_sistema_fechadas` e
  `montar_item_sem_linha`, usados agora pelos dois caminhos. Óleos/graxas
  sempre saem do catálogo completo; peças continuam vindo só do que existe
  no dia (RN12/RN13). Itens do catálogo sem linha herdam
  `quantidade_sistema` do último fechamento (RN27), e a busca desse último
  fechamento exclui o próprio inventário do dia, para um dia já fechado não
  herdar de si mesmo → 2026-08-03.
- [Sprint 2] `App.tsx` inicializava a data com
  `new Date().toISOString().slice(0, 10)`, que devolve a data em UTC: no
  horário de Brasília, das 21h em diante o sistema abria no dia seguinte
  (bug técnico, não decisão de negócio) → criado
  `frontend/src/utils/data.ts` com `dataLocalHoje()` e `formatarDataISO()`,
  usando os componentes locais do `Date`. O helper existe para que o mesmo
  erro não se repita nas telas que ainda vão manipular datas
  → 2026-08-03.
- [Sprint 3] **Ponto que estava em aberto** (`docs/rascunho-inventario.md`
  seção 6): "Nova contagem" num dia já fechado deveria exigir confirmação
  extra? → **Sim.** Decisão da pessoa em 2026-08-03: dia em rascunho recebe
  uma confirmação simples; dia fechado recebe um `ConfirmDialog` que diz
  explicitamente que a contagem já salva será apagada e que as quantidades
  de sistema são mantidas. Motivo: protege contra apagar dado consolidado
  por engano, sem impedir a correção legítima que a RN19 permite.
- [Sprint 3] **Ponto derivado do anterior:** qual o status do dia depois de
  limpar um dia que estava fechado? → **Continua fechado**, com o
  `fechado_em` original preservado (RN18). Decisão da pessoa em 2026-08-03.
  É a leitura mais direta de `docs/rascunho-inventario.md` seção 6, que
  fala em manter a linha de `inventarios`. Implementado em
  `limpar_itens` — a rota não toca em `status` nem em `fechado_em`.
- [Sprint 3] `EditingBanner` precisava de um `onCancelar()` (props definidas
  em `docs/componentes-react.md`), mas o fluxo de "abrir um dia do
  Histórico" só existe no Sprint 5. Por ora o botão volta para a data de
  hoje, via `dataLocalHoje()`. Quando o Sprint 5 chegar, reavaliar se
  cancelar deve voltar para o Histórico em vez de para hoje → 2026-08-03.
- [Infra/dev] O bind mount do Windows não propaga eventos de arquivo para
  o contêiner, então o HMR do Vite não recompila sozinho ao editar
  `frontend/src/` — foi preciso `docker compose restart frontend` para ver
  a mudança. Não corrigido (não afeta o produto, só o ciclo de
  desenvolvimento). Se incomodar, a saída usual é
  `server.watch.usePolling: true` no `vite.config.ts` → 2026-08-03.
