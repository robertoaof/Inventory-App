# Migração de infraestrutura: VPS/Docker → Vercel + Supabase

> **Status: proposta, não implementada.** Este documento existe para
> preparar a decisão, não substitui `docs/preparativos-vps.md` nem
> `docs/docker-compose.md` até que a migração seja de fato decidida e
> executada. Enquanto isso não acontecer, o deploy oficial continua sendo o
> descrito nesses dois arquivos (VPS Hostinger + Docker + Caddy).
>
> Elaborado em 2026-09-15, a pedido da pessoa, junto de uma varredura por
> arquivos não utilizados no repositório (seção 1).

---

## 1. Arquivos não utilizados no repositório

Auditoria de todo o repositório (frontend, backend, configs e docs),
checando cada arquivo `.ts`/`.tsx`/`.py` por referências cruzadas
(imports) e cada arquivo de config/infra por uso real em algum serviço.

**Resultado: nenhum arquivo morto encontrado.** O código está enxuto —
todo componente, hook, página e módulo do backend tem pelo menos uma
referência real. Dois arquivos merecem nota, mas **não são lixo**, são
intencionais:

| Arquivo | Por que aparece "sem referência de código" | Ação |
|---|---|---|
| `docs/contagem_oleo.html` | Protótipo HTML original — não é importado por nada, é documentação de UX (ver `CLAUDE.md`: "referência de comportamento visual, NÃO de arquitetura") | Manter — é a fonte da verdade do catálogo de óleos/graxas e do comportamento visual esperado |
| `.claude/settings.local.json` | Config local do Claude Code, não do app | Manter — fora do escopo desta auditoria |

Também não há dependências não usadas em `backend/requirements.txt` (7
pacotes, todos importados em `app/`) nem em `frontend/package.json` (não
inspecionado pacote a pacote nesta rodada — se quiser, rode `npx depcheck`
no frontend para confirmar).

**Observação lateral, fora do escopo de "arquivos não usados":**
`backend/app/routers/inventarios.py` linha 3 ainda importa
`xml.etree.ElementTree as ET`, mas a linha 6 importa
`defusedxml.ElementTree as DefusedET`, que é o que o Sprint 6 decidiu usar
por segurança (RN/nota de segurança). Vale confirmar se `ET` ainda é usado
em algum ponto do arquivo (parsing de erro, talvez) ou se é um import
sobrando — não investiguei a fundo por estar fora do pedido original.

---

## 2. Por que isso é uma mudança de arquitetura, não só de hospedagem

O sistema foi desenhado e implantado (Sprint 7, decisões de
2026-08-09) como **três containers Docker num VPS**: Postgres com disco
próprio, backend FastAPI de longa duração (Uvicorn, 5 workers) e frontend
servido por Caddy com HTTPS automático — ver `docs/preparativos-vps.md` e
`docs/docker-compose.md`. Vercel + Supabase trocam **os dois pilares** ao
mesmo tempo:

- **Vercel** substitui o container do frontend/backend por **funções
  serverless sem estado**, sem processo persistente, sem cron, sem disco.
- **Supabase** substitui o Postgres do container `db` por um Postgres
  gerenciado, acessado por um **pooler de conexões** (Supavisor), não mais
  diretamente.

Isso não é uma troca de "onde roda", é uma troca do **modelo de execução**
do backend. Antes de migrar, veja a seção 4 (conflitos reais com regras já
decididas do projeto).

---

## 3. O que muda, arquivo por arquivo

### Fica obsoleto após a migração (não apagar agora — só perde função)

| Arquivo | Motivo |
|---|---|
| `docker-compose.yml`, `docker-compose.override.yml`, `docker-compose.prod.yml` | Não há mais containers próprios para orquestrar |
| `backend/Dockerfile`, `frontend/Dockerfile` | Vercel builda a partir do código-fonte, não de uma imagem Docker própria |
| `frontend/Caddyfile` | Vercel já fornece HTTPS automático e serve os estáticos — Caddy deixa de ter função |
| `scripts/backup-postgres.sh` + serviço `backup` do `docker-compose.prod.yml` | Supabase oferece backup gerenciado (diário nos planos pagos, PITR nos planos superiores) — o backup local em disco não existe mais (não há mais disco) |
| `docs/preparativos-vps.md` | Roteiro específico de VPS Hostinger, não se aplica a Vercel/Supabase |
| `docs/docker-compose.md` | Especificação dos serviços Docker, não se aplica |

### Precisa de mudança de código (não só de config)

| Arquivo | Mudança necessária |
|---|---|
| `backend/app/database.py` | `DATABASE_URL` passa a apontar para o pooler do Supabase (porta `6543`, modo *transaction*), com `NullPool`/`statement_cache_size: 0` no `create_engine` — sem isso, *prepared statements* do `psycopg` conflitam com o modo transaction do Supavisor |
| `backend/app/main.py` | `CORS_ORIGINS` passa a ser o domínio `*.vercel.app`/domínio próprio; se backend e frontend forem servidos do mesmo domínio Vercel via *rewrites*, CORS deixa de ser necessário nas chamadas internas |
| Todo o backend (`app/main.py`) | Precisa de um adaptador de entrada serverless (`vercel.json` apontando para `app/main.py` como uma Python Function, ou um handler dedicado) — ver seção 4 sobre limitações |
| `backend/alembic/env.py` | Migrações não podem mais rodar como serviço de container (`migrate` do compose); precisam rodar **fora** do runtime serverless — via GitHub Actions no CI/CD, ou manualmente, contra a *connection string* de sessão do Supabase (porta `5432`, não o pooler) |
| `backend/app/seed_items.py` | Mesma observação: vira um passo de CI/CD ou execução manual, não mais parte do boot de um container |

### Continua igual

Todo o frontend React (`frontend/src/**`) e a lógica de negócio do backend
(`app/models.py`, `app/schemas.py`, `app/routers/inventarios.py`) não
mudam — as regras RN01–RN27 e os contratos de `docs/document-rest-API.md`
são independentes de onde o código roda.

---

## 4. Conflitos reais com decisões já tomadas do projeto

Estes pontos **contradizem regras/decisões já fechadas** e precisam ser
resolvidos ou reabertos explicitamente com a pessoa antes de qualquer
implementação — não decidi nenhum deles por conta própria.

### 4.1 Limite de upload de XML (10 MB) vs. limite de payload da Vercel

`docs/document-rest-API.md`/Sprint 6 fixaram em **10 MB** o limite de
upload de `POST /inventarios/{data}/importacoes` (decisão confirmada pela
pessoa em 2026-08-05). O limite de corpo de requisição de uma **Vercel
Function é 4.5 MB** — um XML de peças um pouco maior que isso já não chega
nem a acionar a validação `422` que o backend implementa hoje, é
rejeitado pela própria plataforma antes.

**Isso é um ponto em aberto, não uma decisão minha.** Alternativas
possíveis (a escolher pela pessoa, não decidido aqui):
- Reduzir o limite de negócio para caber no teto da plataforma (muda uma
  regra já confirmada);
- Cliente faz upload direto pro Supabase Storage e o backend só processa
  a partir de lá (adiciona uma peça nova à arquitetura, mais complexidade);
- Manter o backend fora da Vercel (ex.: Vercel só para o frontend,
  backend continua num serviço com processo persistente — Render, Fly.io,
  ou o próprio VPS atual) — nesse caso não seria uma migração completa
  para Vercel, só do frontend.

### 4.2 Workers do Uvicorn (decisão de 2026-08-09) deixa de fazer sentido

A decisão de "5 workers" em `docker-compose.prod.yml` foi dimensionada
para um processo Uvicorn de longa duração atendendo até 5 pessoas
simultâneas. Em funções serverless não há esse conceito — cada
invocação é isolada, o dimensionamento vira sobre *concorrência de
funções* e *cold starts*, não sobre número de workers. Não é um problema
técnico, mas invalida uma decisão explícita já tomada — vale reconfirmar
com a pessoa se o raciocínio de capacidade (5 pessoas, sem autenticação
ainda) muda em algo relevante no novo modelo.

### 4.3 Cold start em fluxo de autosave (RNF11)

O autosave dá um `PATCH` por item alterado, debounce de ~500ms — RNF11 já
prevê isso como "uma requisição por item", não em lote. Em Vercel Functions
sem tráfego constante, a primeira requisição depois de um período ocioso
sofre *cold start* (a função "acorda"). Isso não quebra a regra de negócio,
mas pode ser perceptível como lentidão no primeiro campo editado depois de
um tempo parado — vale considerar antes de migrar se isso é aceitável para
quem usa o sistema no chão de fábrica.

### 4.4 Migração e seed deixam de ser automáticas no boot

A decisão de 2026-08-09 (Sprint 7) foi rodar `alembic upgrade head &&
python -m app.seed_items` **nessa ordem**, via serviço `migrate` que
bloqueia o `backend` até terminar (`condition:
service_completed_successfully`) — justamente para garantir que as colunas
`GENERATED ALWAYS AS` existam antes de qualquer escrita. Sem um serviço
de container, isso vira um passo manual ou de CI/CD **antes** do deploy do
backend — precisa de disciplina operacional equivalente (nunca fazer
deploy de uma mudança de schema sem rodar a migração antes), sem a garantia
automática que o `docker-compose` dava.

### 4.5 Segredo de que dialeto de driver usar

`DATABASE_URL` hoje usa `postgresql+psycopg://` (psycopg 3). O pooler do
Supabase em modo *transaction* (porta 6543) tem restrições conhecidas com
*prepared statements* — a comunidade recomenda `NullPool` +
`statement_cache_size=0` (para asyncpg) ou configuração equivalente para
psycopg. Isso precisa de teste real contra o Supabase antes de confiar em
produção, não é algo que dá pra garantir só lendo documentação.

---

## 5. Plano de migração proposto (alto nível, não decidido)

Ordem sugerida **se** a pessoa confirmar a migração, pensada para não
quebrar o ambiente VPS atual até o novo estar validado:

1. **Criar projeto Supabase**, obter a *connection string* de sessão
   (porta 5432, para migrações/seed) e a de pooler (porta 6543, para a
   aplicação).
2. **Rodar `alembic upgrade head` + `seed_items.py` manualmente** contra o
   Supabase, a partir de uma máquina local — sem tocar no VPS em produção.
3. **Ajustar `backend/app/database.py`** para usar a *connection string* de
   pooler com a configuração de `NullPool`/prepared statements desabilitado,
   e testar localmente (`docker compose up` apontando `DATABASE_URL` para
   o Supabase) antes de tocar na Vercel.
4. **Resolver o ponto 4.1 (limite de upload)** — decisão da pessoa,
   obrigatória antes do passo 5, porque muda código de validação.
5. **Criar `vercel.json`** definindo a função Python do backend e o build
   estático do frontend (ou dois projetos Vercel separados, um por
   camada — a decidir).
6. **Deploy de *preview*** na Vercel (branch, não produção), testar os
   fluxos críticos de ponta a ponta: autosave, importação de XML, fechar
   dia, histórico — o mesmo roteiro de verificação que os Sprints 2–6 já
   documentam.
7. **Cutover de DNS/domínio** só depois do preview validado — manter o VPS
   no ar em paralelo até confirmar que o novo ambiente está estável.
8. **Desligar o VPS e os serviços Docker** só depois de um período de
   observação (a pessoa decide quanto tempo).
9. **Atualizar `docs/`**: aposentar `docs/preparativos-vps.md` e
   `docs/docker-compose.md` (mover para uma pasta `docs/arquivo/` em vez de
   apagar, para manter o histórico de decisões), e promover este documento
   a `docs/deploy-vercel-supabase.md` definitivo.

---

## 6. Pontos que precisam de decisão explícita da pessoa antes de começar

Não decidi nenhum destes — são exatamente o tipo de ponto que
`CLAUDE.md` pede para parar e perguntar:

1. **Upload de XML de 10 MB vs. teto de 4.5 MB da Vercel** (seção 4.1) —
   qual caminho seguir?
2. **Backend inteiro na Vercel, ou só o frontend?** Dado o teto de payload
   e a ausência de processo persistente, pode fazer mais sentido manter o
   backend FastAPI num serviço com container/processo de longa duração
   (inclusive o VPS atual) e migrar só o frontend para Vercel, usando
   Supabase só como banco. Isso evita os pontos 4.1, 4.2 e 4.4 quase por
   inteiro.
3. **Plano do Supabase** — o plano gratuito tem limites de armazenamento,
   backup (sem PITR) e pausa o projeto após inatividade; para um sistema
   de uso diário isso provavelmente exige plano pago (Pro). Confirmar
   orçamento antes de migrar.
4. **O que fazer com o VPS Hostinger já configurado** (`docs/preparativos-vps.md`)
   — cancelar, manter como *fallback*, ou reaproveitar para outra coisa?
5. **Prazo de convivência entre os dois ambientes** durante o cutover
   (passo 7–8 do plano).

---

## 7. Referências consultadas nesta análise

- [Using the Python Runtime with Vercel Functions](https://vercel.com/docs/functions/runtimes/python)
- [Vercel Functions Limits](https://vercel.com/docs/functions/limitations)
- [Deploy a FastAPI app on Vercel](https://vercel.com/docs/frameworks/backend/fastapi)
- [Supabase — Connection pooling and limits](https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits)
- [Supabase — Using SQLAlchemy with Supabase](https://supabase.com/docs/guides/troubleshooting/using-sqlalchemy-with-supabase-FUqebT)
- [Supabase — Supavisor FAQ](https://supabase.com/docs/guides/troubleshooting/supavisor-faq-YyP5tI)
