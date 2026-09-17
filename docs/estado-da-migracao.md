# Estado da migração Vercel + Supabase — retomada em outra máquina

Documento de continuidade, escrito em **2026-09-16** para permitir retomar
o trabalho num computador diferente daquele onde a migração começou.

Ele responde três perguntas: **o que já está pronto**, **o que precisa ser
feito na máquina nova antes de continuar**, e **qual é exatamente o próximo
passo**.

Documentos relacionados:
- `docs/deploy-vercel-supabase.md` — o roteiro completo, passo a passo
- `docs/migracao-vercel-supabase.md` — a análise da mudança de arquitetura

---

## 1. Decisões já tomadas (não reabrir)

| Decisão | Valor | Quando |
|---|---|---|
| Opção de hospedagem | **Opção A** — frontend e backend FastAPI ambos na Vercel, banco no Supabase | 2026-09-16 |
| Projeto Supabase | `fcmmshbwedjqtgnqutsn`, região **São Paulo** (`sa-east-1`), plano **Free** — projeto recriado do zero em 2026-09-17 (o anterior, `fodtdcdratwglkmbvnia`, foi descartado porque a senha havia passado pelo chat; ver seção 5) | 2026-09-17 |
| Região da função Vercel | `gru1` (São Paulo), para ficar junto do banco | a aplicar |
| Tamanho dos XMLs | Abaixo de 1 MB — o teto de 4,5 MB da Vercel não é problema prático | confirmado |

Consequências aceitas ao escolher a Opção A, já registradas no
`SPRINTS.md`: limite real de upload cai para 4,5 MB, existe cold start no
primeiro autosave após ociosidade, e a migração do Alembic deixa de ser
automática (passa a ser passo manual antes de cada deploy que mexa em
schema).

---

## 2. O que já está pronto

### 2.1 Código (commitado e no GitHub)

Commit `8648fe9` — *Prepara o codigo para deploy serverless na Vercel + Supabase*:

| Arquivo | Mudança |
|---|---|
| `backend/app/database.py` | Modo serverless opcional, ativado por `DB_MODO_SERVERLESS=1`: `NullPool` + `prepare_threshold=None`. **Desligado por padrão**, então dev/Docker/VPS seguem idênticos |
| `frontend/vercel.json` | Novo. Reescreve qualquer rota para `/index.html`, para o `react-router` não dar 404 ao abrir `/historico` direto ou no F5 |
| `.env.example` | Documenta a variável `DB_MODO_SERVERLESS` |

Commit `be6b869` — o roteiro `docs/deploy-vercel-supabase.md`.

### 2.2 Banco de dados Supabase — **schema aplicado e catálogo populado**

O projeto original (`fodtdcdratwglkmbvnia`) chegou a ter o schema criado e o
catálogo populado em 2026-09-16, mas foi **descartado** em 2026-09-17 porque
a senha do banco havia passado pelo chat durante a depuração da seção 5. Um
projeto novo (`fcmmshbwedjqtgnqutsn`) foi criado no lugar, e o `.mcp.json`
já foi atualizado para apontar para ele.

O projeto novo nasceu vazio, e **a migração e o seed foram rodados nele em
2026-09-17**, via `scripts/migrar-supabase.ps1` (session pooler, porta
5432). Estado confirmado via MCP do Supabase:

| Verificação | Resultado |
|---|---|
| Tabelas | `itens`, `inventarios`, `inventario_itens`, `importacoes_xml` + `alembic_version` |
| `alembic_version` | `0001_initial` |
| Catálogo (`itens`) | 11 linhas — 9 óleos + 2 graxas |
| `inventario_itens.diferenca` / `.status` | `GENERATED ALWAYS`, expressões corretas (RN01–RN03) |
| `GET /inventarios/{data}` contra o Supabase | `nao_iniciado` com 11 óleos, zero escrita no banco |
| RLS | ligada pelo Supabase nas 5 tabelas, sem políticas — ver nota abaixo |

> **Sobre a RLS:** o Supabase liga *row level security* por padrão em
> tabelas novas do schema `public`. Sem políticas, isso fecha a API REST
> automática (PostgREST) para a chave anônima — o que é desejável aqui,
> já que este projeto não usa PostgREST: todo acesso passa pelo FastAPI.
> O backend não é afetado porque conecta como `postgres`, dono das
> tabelas, e o Postgres não aplica RLS ao dono a menos que a tabela use
> `FORCE ROW LEVEL SECURITY`. **Não mexer.**

> **`list_migrations` do MCP continua vazio, e isso está certo.** Ele lê a
> tabela de migrações *do Supabase* (`supabase_migrations.schema_migrations`),
> preenchida pelo CLI deles. Quem controla o schema aqui é o Alembic, que
> usa a própria tabela `alembic_version` — a verificação válida é a linha
> `0001_initial` dela, não a saída do `list_migrations`.

Para uma migração futura (schema novo num banco que já tem catálogo), use
`scripts/migrar-supabase.ps1 -SomenteMigracao` — seção 8.2 do roteiro.

### 2.3 Ferramental

- `.mcp.json` na raiz registra o servidor MCP do Supabase, já apontando
  para o projeto novo (`fcmmshbwedjqtgnqutsn`). Na máquina nova ele vai
  pedir aprovação na primeira sessão e depois autenticação OAuth.

---

## 3. O que falta fazer

> **Atualizado em 2026-09-17:** tudo desta lista foi feito, menos a região
> `gru1` (travada pelo plano Hobby) e o upgrade para Pro (dispensado
> enquanto o uso for portfólio pessoal — ver seção 6). O sistema está no ar:
> API em `https://inventario-scania-api.vercel.app` e frontend em
> `https://inventario-scania-web.vercel.app`, com CORS fechado entre os
> dois e autosave gravando no Supabase. Detalhe de cada item no
> `SPRINTS.md`, Sprint 8.

- [x] ~~Rodar `alembic upgrade head` + `python -m app.seed_items` contra o
      projeto Supabase novo (`fcmmshbwedjqtgnqutsn`)~~ — **feito em
      2026-09-17**, ver seção 2.2 acima
- [ ] Criar a conta/time na Vercel (ver seção 6 sobre o plano Pro)
- [ ] Criar o **projeto da API** na Vercel (Root Directory = `backend`)
- [ ] Apontar a função para a região `gru1`
- [ ] Criar o **projeto do frontend** na Vercel (Root Directory = `frontend`)
- [ ] Configurar `VITE_API_URL` no frontend e `CORS_ORIGINS` no backend
- [ ] Rodar o checklist de verificação de ponta a ponta (seção 6 do roteiro)

O passo a passo detalhado de cada um está em
`docs/deploy-vercel-supabase.md`, seções 2.5, 4A e 5.

---

## 4. Preparando a máquina nova

### 4.1 Clonar e atualizar

```bash
git clone https://github.com/robertoaof/Inventory-App.git
cd Inventory-App
```

Se o repositório já existir na máquina, basta `git pull origin main`.

### 4.2 Criar o `.env` local

O `.env` **não vem no git** (está no `.gitignore`, como deve ser). Crie a
partir do exemplo:

```bash
cp .env.example .env
```

Os valores padrão servem para desenvolvimento local com Docker. Você só
precisa editar se for rodar algo contra o Supabase — e nesse caso veja a
seção 5.

### 4.2b O arquivo `backend/.env.supabase` (só para rodar migração)

`scripts/migrar-supabase.ps1` — que roda `alembic upgrade head` e o seed na
ordem obrigatória — lê a URL de conexão deste arquivo, e **não** do `.env`.
Ele existe para a senha do banco não passar por linha de comando nem por
chat. Está coberto pelo `.gitignore` (padrão `.env.*`), então **nunca vem
no `git clone` nem no `git pull`**.

Conteúdo: uma linha só, com o **session pooler (porta 5432)**:

```
DATABASE_URL=postgresql+psycopg://postgres.fcmmshbwedjqtgnqutsn:SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
```

Você só precisa dele se for mexer no schema a partir desta máquina. Para
só rodar o sistema local com Docker, o `.env` basta.

#### ⚠️ Se a máquina **já tiver** esse arquivo

Um `git pull` não toca nele — arquivo ignorado não entra em conflito nem é
sobrescrito. O risco é outro: se esta máquina participou da migração
**antes de 2026-09-17**, o arquivo (ou o `DATABASE_URL` do `.env`) pode ter
a URL do projeto Supabase **antigo**, `fodtdcdratwglkmbvnia`, que foi
descartado. Rodar migração contra ele não dá erro óbvio — dá falha de
autenticação sem explicação, ou pior, sucesso no projeto errado.

O script protege contra isso: ele recusa qualquer URL que não aponte para
o projeto atual (`fcmmshbwedjqtgnqutsn`) e diz o que fazer. Se o projeto
mudar de novo um dia, atualize a variável `$refEsperado` no topo do
script — o *ref* não é segredo, ele já está no `.mcp.json`.

Mesmo cuidado vale para o `.env` da raiz: ele deve apontar para o Postgres
do Docker (`@db:5432`), não para o Supabase. Ver a nota no fim da seção 5.

### 4.3 Ambiente Python (opcional, mas recomendado)

Só é necessário se você for rodar migrações do Alembic a partir da máquina.
Note que `backend/.venv` **não vem no git**:

```bash
cd backend
py -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
```

Testado e funcionando no **Python 3.14** (a imagem Docker usa 3.12, mas o
`psycopg 3.2.10` instala e roda nas duas).

### 4.4 Sobre Docker e Node

Na máquina onde a migração começou, **nenhum dos dois estava disponível** —
o Docker Desktop não estava rodando e o Node não estava instalado. Nada
disso bloqueou o trabalho, porque:

- As migrações rodaram pelo venv Python, sem Docker.
- A Vercel compila o frontend na nuvem dela, então o Node local não é
  necessário para o deploy.

Se na máquina nova eles existirem, ótimo — o `docker compose up` continua
funcionando para desenvolvimento local. Se não existirem, a migração
continua possível pelo venv.

---

## 5. ⚠️ Credenciais — leia antes de continuar

**A senha do banco não está neste repositório, e não deve estar.** Este é
um repositório público.

O que você precisa levar para a máquina nova, por um meio seguro
(gerenciador de senhas, não e-mail nem chat):

- A senha do papel `postgres` do projeto Supabase **novo**,
  `fcmmshbwedjqtgnqutsn`. É a senha **definida na criação deste projeto**
  (o projeto anterior, `fodtdcdratwglkmbvnia`, foi descartado — ver o aviso
  abaixo — e sua senha não vale mais para nada).

Com ela, as duas strings de conexão se montam assim (confirme o host exato
no painel do projeto novo, seção **Connect** — o número após `aws-` pode
mudar de projeto para projeto):

```
# Session pooler (porta 5432) — migrações do Alembic a partir da sua máquina
postgresql+psycopg://postgres.fcmmshbwedjqtgnqutsn:SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres

# Transaction pooler (porta 6543) — é esta que vai na Vercel
postgresql+psycopg://postgres.fcmmshbwedjqtgnqutsn:SENHA@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
```

Host e usuário estão confirmados como corretos por teste direto. O prefixo
`postgresql+psycopg://` (em vez do `postgresql://` que o painel mostra) é
obrigatório — é o que diz ao SQLAlchemy qual driver usar.

### ⚠️ O botão "Reset database password" não funcionava no projeto anterior

> **Atualização 2026-09-17:** o problema abaixo era do projeto
> `fodtdcdratwglkmbvnia`, que foi descartado. O projeto atual
> (`fcmmshbwedjqtgnqutsn`) nasceu já com a senha nova e nunca teve essa
> senha exposta em chat — não há necessidade de repetir a troca nele.
> Fica registrado abaixo como referência, caso o mesmo sintoma apareça de
> novo em outro projeto.

Isso custou seis tentativas de conexão e vale registrar em detalhe, para
ninguém repetir:

Quatro resets consecutivos pelo painel (**Settings → Database → Reset
database password**) **não foram aplicados ao banco**. O painel exibia a
senha nova, mas o `pg_authid` continuava com a senha original da criação do
projeto — e o pooler, que valida via `pgbouncer.get_auth`, seguia
recusando todas as senhas novas com `password authentication failed`.

O `ALTER USER postgres WITH PASSWORD ...` pelo SQL Editor **também não
funciona**: neste projeto o papel `postgres` não é superusuário, e a
tentativa devolve `42501: permission denied to alter role`.

Consequência prática: **a senha vigente é a da criação do projeto e não há
como trocá-la pela interface.** Para trocar, as opções são abrir um ticket
no Supabase ou recriar o projeto do zero (o que, enquanto não houver dado
real, custa 2 minutos e é o caminho mais rápido).

Como a senha do projeto anterior passou pelo chat durante a depuração,
recriar o projeto (feito em 2026-09-17) resolveu isso — a migração roda de
novo em segundos.

### Onde guardar a URL nesta máquina

A partir de 2026-09-17 o lugar certo é **`backend/.env.supabase`** (seção
4.2b), não o `.env` da raiz. Motivo: o `.env` é o arquivo que o
`docker compose` lê, então deixar a URL do Supabase ali faz o ambiente
local inteiro — inclusive o serviço `migrate` — apontar para o banco de
produção sem ninguém perceber.

### Disjuntor do pooler

Tentativas repetidas de autenticação falha ativam um disjuntor no
Supavisor: `(ECIRCUITBREAKER) too many authentication failures, new
connections are temporarily blocked`. Ele se resolve sozinho em alguns
minutos. Se aparecer, **pare de tentar** — insistir prolonga o bloqueio.

### Conexão direta não funciona nesta rede

O host `db.<project-ref>.supabase.co` (Direct connection) é
**IPv6-only** e o DNS nem resolve em rede sem IPv6 — foi o caso da máquina
original. Use sempre o pooler (`aws-0-sa-east-1.pooler.supabase.com`).

---

## 6. ⚠️ Vercel: plano Pro era tido como obrigatório — revisto em 2026-09-17

> **Decisão da pessoa em 2026-09-17:** o sistema fica como **portfólio
> pessoal**, sem outras pessoas usando e sem virar o sistema de trabalho da
> concessionária. Com isso o **Hobby atende** — a restrição do contrato da
> Vercel é a uso comercial — e o deploy foi feito nele. O que está escrito
> abaixo continua sendo o gatilho de reavaliação: **se a empresa passar a
> usar o sistema de verdade, o Pro volta a ser obrigatório.**
>
> Efeito colateral aceito de ficar no Hobby: a região da função não sai de
> `iad1` (Washington) — ver `docs/deploy-vercel-supabase.md` seção 4A.3 —
> o que custa ~1,5 s por consulta ao banco.

### O texto original (premissa de uso comercial)

O plano Hobby da Vercel é restrito por contrato a **uso pessoal e não
comercial**. Este é um sistema de empresa, então a conta precisa ser
**Pro — US$ 20/mês por usuário**, independentemente de ser só o frontend
que está hospedado lá.

Isso muda a conta e não estava previsto na proposta original. A seção 11 de
`docs/deploy-vercel-supabase.md` faz a comparação completa de custos.

### Premissa corrigida: não existe VPS

Durante boa parte desta sessão os documentos trataram a migração como a
substituição de um sistema em produção numa VPS Hostinger. **Isso estava
errado**, e foi corrigido em 2026-09-16: a VPS nunca foi contratada, o
roteiro de `docs/preparativos-vps.md` nunca foi executado, e até hoje o
sistema só rodou em `localhost`.

Consequências práticas:

- **Não há cutover no sentido clássico.** Não existem usuários ativos,
  dados reais nem dois ambientes em paralelo. "Ir ao ar" é simplesmente
  passar o endereço para as pessoas pela primeira vez.
- **Não há rollback para um ambiente anterior.** Se a Vercel não servir, a
  alternativa é montar a VPS do zero, não voltar para uma que já roda.
- **A comparação de custo é entre dois caminhos igualmente novos:** Vercel
  (~US$ 20/mês, quase nenhum trabalho de administração) contra VPS
  (~R$ 30–50/mês, com toda a configuração e manutenção por sua conta).
  Nenhuma das duas é obviamente certa — depende de quanto seu tempo vale
  frente à diferença de preço.

O código é compatível com os dois caminhos: o modo serverless vem desligado
por padrão e o `docker-compose` nunca deixou de funcionar. Se a escolha
mudar, nada do que já foi feito se perde — inclusive o banco do Supabase,
que pode ser descartado sem prejuízo.

---

## 7. Retomando com o Claude Code na máquina nova

Abra o Claude Code na pasta do projeto e diga algo como:

> Leia `docs/estado-da-migracao.md` e continue a migração de onde parou.

O `CLAUDE.md` já é carregado automaticamente. Na primeira sessão, o
`.mcp.json` vai pedir aprovação do servidor MCP do Supabase — aceite, e
depois autorize via OAuth no navegador. Com o MCP conectado, dá para
inspecionar o banco sem precisar da senha.

Tenha a senha do banco novo (`fcmmshbwedjqtgnqutsn`) em mãos antes de
começar, se for rodar migrações — a próxima ação pendente é justamente
`alembic upgrade head` + `python -m app.seed_items` contra ele (seção 2.2).

---

## 8. Histórico resumido

### Sessão de 2026-09-16

1. Escrito o roteiro `docs/deploy-vercel-supabase.md` cobrindo as três
   opções de hospedagem (commit `be6b869`).
2. Escolhida a Opção A e aplicadas as três mudanças de código que ela
   exige (commit `8648fe9`).
3. Criado o projeto no Supabase (`fodtdcdratwglkmbvnia`) e registrado o
   servidor MCP.
4. Seis tentativas de conectar ao banco falharam por autenticação. A
   investigação descartou, por teste direto, que fosse host, usuário,
   porta, rede, IPv6 ou integridade do projeto — o tenant era encontrado
   pelo pooler, apenas a senha era recusada. A causa real: os resets de
   senha do painel não estavam sendo aplicados, e a senha válida era a
   original da criação do projeto.
5. Migração e seed aplicados com sucesso e verificados via MCP.

### Sessão de 2026-09-17

1. Como a senha do projeto `fodtdcdratwglkmbvnia` havia passado pelo chat
   durante a depuração acima, o projeto foi **descartado e recriado do
   zero** como `fcmmshbwedjqtgnqutsn` (mesma região, São Paulo).
2. `.mcp.json` atualizado para apontar para o projeto novo.
3. Confirmado via MCP (`list_tables`, `list_migrations`) que o projeto
   novo está vazio — schema e seed ainda não foram aplicados nele. Essa é
   a próxima ação pendente, registrada no Sprint 8 de `SPRINTS.md`.

O que **não** foi feito: nada na Vercel. A conta foi criada, mas nenhum
projeto foi importado ainda.
