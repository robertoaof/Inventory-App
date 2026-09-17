# Deploy na nuvem: Vercel + Supabase — roteiro passo a passo

Este documento é um **roteiro prático**, escrito para quem nunca usou
Vercel nem Supabase e ainda não tem conta em nenhuma das duas. Ele cobre
desde criar as contas até o sistema no ar e funcionando, incluindo a
rotina do dia a dia depois da migração.

Ele é o complemento prático de `docs/migracao-vercel-supabase.md`, que faz
a **análise** da mudança (o que quebra, o que conflita com decisões já
tomadas). Se você quer entender *por que* migrar é uma mudança de
arquitetura e não só de hospedagem, leia aquele primeiro. Se você já
decidiu e quer executar, este aqui é o passo a passo.

> **Status:** roteiro preparado, migração ainda não executada. O deploy
> oficial atual continua sendo o de `docs/preparativos-vps.md` (VPS
> Hostinger + Docker + Caddy), e nada no repositório foi alterado ainda.
> Este documento diz exatamente quais arquivos alterar quando você
> decidir seguir em frente.

---

## 0. O essencial antes de qualquer clique

### 0.1 O que é cada uma dessas plataformas

**Vercel** é uma hospedagem que pega o código do seu repositório GitHub,
compila e publica sozinha, com HTTPS já configurado. Todo `git push` vira
um deploy automático. Ela é excelente para o **frontend** (o React, que
vira um monte de arquivos estáticos) e também sabe rodar backend Python,
mas de um jeito diferente do que você tem hoje — ver 0.2.

**Supabase** é um **Postgres gerenciado**: o mesmo banco de dados que hoje
roda no seu container `db`, só que hospedado, com backup, painel web para
ver as tabelas e sem você precisar cuidar de disco, atualização ou senha
de sistema operacional.

### 0.2 O ponto que costuma confundir: "backend no Supabase" não existe

Isso é importante e vale a pena parar aqui um minuto.

O Supabase **não roda Python**. Ele te dá o banco de dados (e alguns
extras que este projeto não usa: autenticação, storage, edge functions em
JavaScript). O seu backend é uma aplicação **FastAPI**, em Python — ela
precisa rodar em algum lugar que execute código Python.

Então a migração se parte em duas perguntas independentes:

| Camada | Para onde vai |
|---|---|
| Banco Postgres | **Supabase** (igual nas três opções abaixo) |
| Frontend React | **Vercel** (igual nas três opções abaixo) |
| Backend FastAPI | **é aqui que existe escolha** — ver 0.3 |

### 0.3 As três opções para o backend

> **Correção de premissa (2026-09-16):** este documento foi escrito
> assumindo que o sistema já rodava numa VPS Hostinger e que a migração
> substituiria um ambiente em produção. **Isso não é verdade** — a VPS
> nunca foi contratada, o roteiro de `docs/preparativos-vps.md` nunca foi
> executado, e até hoje o sistema só rodou em `localhost`. Portanto:
> qualquer opção abaixo é o **primeiro deploy de produção** do projeto, não
> uma troca de hospedagem. A Opção C deixa de ser "aproveitar o que já
> existe" e passa a significar "contratar e configurar uma VPS do zero".
> As seções 10 e 11 já foram corrigidas; trechos que falem em "VPS atual"
> ou em rollback para ela devem ser lidos com essa ressalva.

| | Opção A — Tudo na Vercel | Opção B — Vercel + Render | Opção C — Vercel + VPS |
|---|---|---|---|
| Frontend | Vercel | Vercel | Vercel |
| Backend FastAPI | Vercel (função serverless) | Render (processo sempre ligado) | VPS Hostinger (Docker, a contratar) |
| Banco | Supabase | Supabase | Supabase |
| Uma plataforma só? | Sim | Não (duas) | Não (duas + VPS) |
| Limite de upload de XML | 4,5 MB (teto da plataforma) | Sem teto da plataforma | Sem teto da plataforma |
| Demora no primeiro acesso após ociosidade | Sim, alguns segundos ("cold start") | Só no plano grátis (30–60s) | Não |
| Migração do Alembic | Manual, antes do deploy | Manual, antes do deploy | Continua automática (serviço `migrate`) |
| Custo mensal aproximado | ~US$ 20 | ~US$ 27 | ~US$ 20 + a VPS que você já paga |
| Seções deste documento | 1, 2, 3, **4A**, 5, 6+ | 1, 2, **4B**, 5, 6+ | 1, 2, **4C**, 5, 6+ |

Os detalhes de custo estão na seção 11. Leia a 0.4 antes de escolher pelo
preço.

### 0.4 ⚠️ Uso comercial: o plano grátis da Vercel não serve

> **Atualização 2026-09-17 — esta seção deixou de valer para o uso atual.**
> A pessoa decidiu que **o sistema fica como portfólio pessoal**: ninguém
> mais vai usar, não é o sistema de trabalho da concessionária. Nesse
> cenário o **Hobby serve**, porque a restrição do contrato é a uso
> comercial, e o projeto seguiu nele (ver `SPRINTS.md`, Sprint 8).
> O texto abaixo continua válido e vira o gatilho para reavaliar: **se um
> dia a empresa passar a usar o sistema de verdade no dia a dia, o upgrade
> para Pro deixa de ser opcional.** Consequência já sentida por estar no
> Hobby: a região da função não sai de `iad1` (ver seção 4A.3).

O plano **Hobby** da Vercel é gratuito, mas a política de uso justo da
própria Vercel diz, com todas as letras, que ele é restrito a **uso
pessoal e não comercial**. Um sistema de inventário usado por uma
concessionária no dia a dia é uso comercial — independentemente de ser
"só" o frontend que está lá.

Na prática isso significa que, **nas três opções**, a conta da Vercel
precisa ser **Pro: US$ 20 por mês, por usuário** (você sozinho = US$ 20).
Não é uma taxa que aparece só quando o tráfego cresce; é a condição de uso
desde o primeiro dia.

Isso não invalida a migração — só muda a conta de chegada. Vale comparar
com o que você paga hoje de VPS antes de decidir, e a seção 11 faz essa
comparação. **Se o custo for o fator decisivo, é perfeitamente legítimo
concluir que a VPS que já está montada e funcionando continua sendo a
melhor opção** — e nesse caso este documento fica arquivado como plano B.

O Supabase **não** tem essa restrição: o plano gratuito dele pode ser
usado comercialmente (com as limitações de backup descritas na seção 9).

### 0.5 O que você precisa ter em mãos

- Conta no **GitHub** com o repositório já publicado — você já tem:
  `https://github.com/robertoaof/Inventory-App`
- **Docker Desktop** instalado (você já usa) — vamos reaproveitá-lo para
  rodar a migração do banco. Alternativa sem Docker na seção 2.5.
- Um **cartão de crédito** (para o plano Pro da Vercel; o Supabase grátis
  não pede cartão).
- Uns 90 minutos tranquilos para a primeira vez.

### 0.6 Regra de ouro

Como não existe ambiente antigo no ar (ver a correção acima), não há o
cuidado usual de manter dois sistemas em paralelo. A regra que sobra é
mais simples: **só divulgue o endereço para as pessoas depois de rodar o
checklist da seção 6 inteiro.** Enquanto ninguém estiver usando, o banco só
tem dado de teste e qualquer coisa pode ser refeita do zero sem prejuízo —
inclusive recriar o projeto do Supabase. Depois que as contagens reais
começarem, isso deixa de ser verdade.

---

## 1. Preparar o repositório

Antes de qualquer conta, confirme que o que está no GitHub é o que você
quer publicar. Vercel e Render **leem do GitHub**, não do seu computador —
código que só existe na sua máquina não vai pro ar.

```bash
cd C:/Users/roberto.filho/Desktop/projetos/InventoryApp/Inventory-App
git status
git push origin main
```

Se `git status` disser "nothing to commit, working tree clean" e o `push`
não tiver nada para enviar, está tudo sincronizado.

> **Sobre segredos:** o `.gitignore` já ignora o arquivo `.env`, então
> suas senhas nunca foram pro GitHub. Isso continua valendo: na nuvem,
> senhas entram como **variáveis de ambiente pelo painel** de cada
> plataforma, nunca dentro do código.

---

## 2. Parte 1 — Banco de dados no Supabase

Esta parte é **idêntica nas três opções**. Faça ela primeiro.

### 2.1 Criar a conta

1. Acesse <https://supabase.com> e clique em **Start your project**.
2. Escolha **Continue with GitHub** — é o caminho mais simples, porque
   você já tem conta lá e não precisa inventar mais uma senha.
3. Autorize o Supabase a ver sua conta do GitHub. Isso **não** dá a ele
   acesso de escrita ao seu código; é só para login.

### 2.2 Criar o projeto

No painel, clique em **New project** e preencha:

- **Name:** `inventario-scania` (só um rótulo, pode ser o que você quiser).
- **Database Password:** clique em **Generate a password** e **copie a
  senha antes de sair da tela** — ela não é mostrada de novo. Cole num
  lugar seguro (gerenciador de senhas, ou o seu `.env` local, que é
  ignorado pelo git).

  > ⚠️ **Se for inventar a senha você mesmo, use só letras e números.**
  > Caracteres como `@`, `:`, `/`, `#` e `?` têm significado especial
  > dentro de uma URL de conexão e quebram a conexão de um jeito difícil
  > de diagnosticar (a mensagem de erro não fala nada sobre senha). A
  > senha gerada pelo Supabase é segura nesse aspecto.

- **Region:** a escolha depende da opção que você escolheu em 0.3:
  - **Opção A (backend na Vercel):** `South America (São Paulo)` — e na
    seção 4A você aponta a função da Vercel para a região `gru1`, também
    em São Paulo.
  - **Opção B (backend no Render):** escolha a região do Supabase **igual
    à região que você vai usar no Render** (o Render não tem região no
    Brasil; use `East US (North Virginia)` nos dois). O que importa para a
    velocidade do sistema é o backend estar perto do **banco**, não perto
    de você — cada tela dispara várias consultas ao banco e só uma
    resposta para o navegador.
  - **Opção C (backend na VPS):** escolha a região mais próxima da sua
    VPS Hostinger.

- **Plan:** comece no **Free**. A seção 9 explica quando o Pro (US$ 25/mês)
  passa a valer a pena — resumidamente, é sobre backup automático.

Clique em **Create new project** e espere uns 2 minutos enquanto o banco é
provisionado.

### 2.3 Pegar as strings de conexão

Uma "string de conexão" (*connection string*) é o endereço completo do
banco, com usuário e senha embutidos. O Supabase te dá **três variantes** e
usar a errada é a causa mais comum de dor de cabeça — então vale entender
a diferença:

| Variante | Porta | Para que serve aqui |
|---|---|---|
| **Direct connection** | 5432 | Não vamos usar. Só funciona por IPv6, e a maioria das redes brasileiras (e a Vercel, e o Render) sai por IPv4 — ela simplesmente não conecta. |
| **Session pooler** | 5432 | **Rodar as migrações do Alembic e o seed** (seção 2.5), e o backend nas opções **B** e **C** (processo que fica ligado). Funciona por IPv4. |
| **Transaction pooler** | 6543 | Backend na opção **A** (serverless — muitas conexões curtinhas). Funciona por IPv4, mas **não aceita *prepared statements***, e por isso a opção A exige um ajuste no código (seção 3). |

Para copiá-las:

1. No topo do painel do projeto, clique no botão **Connect**.
2. A janela mostra as três variantes. **Copie o host exatamente como
   aparece** — ele tem um formato tipo
   `aws-1-sa-east-1.pooler.supabase.com` e o número do meio não dá para
   adivinhar, muda de projeto para projeto.
3. Onde aparecer `[YOUR-PASSWORD]`, substitua pela senha que você guardou
   no passo 2.2.

Você vai terminar com duas URLs parecidas com estas (os valores são
exemplo, use os seus):

```
# Session pooler — porta 5432 — para migrações, e para o backend nas opções B e C
postgresql://postgres.abcdefghijklmnop:SUA_SENHA@aws-1-sa-east-1.pooler.supabase.com:5432/postgres

# Transaction pooler — porta 6543 — para o backend na opção A
postgresql://postgres.abcdefghijklmnop:SUA_SENHA@aws-1-sa-east-1.pooler.supabase.com:6543/postgres
```

### 2.4 Adaptar a URL para o formato que este projeto usa

O projeto usa **psycopg 3** como driver, e o SQLAlchemy descobre isso pelo
prefixo da URL. O Supabase entrega no formato genérico `postgresql://`;
você precisa trocar por `postgresql+psycopg://`:

```
postgresql+psycopg://postgres.abcdefghijklmnop:SUA_SENHA@aws-1-sa-east-1.pooler.supabase.com:5432/postgres
```

Esse é o formato que vai em **toda** variável `DATABASE_URL` daqui pra
frente. Só muda a porta (5432 ou 6543) conforme o uso.

### 2.5 Criar as tabelas e popular o catálogo de óleos

Agora o banco existe, mas está vazio. Dois comandos precisam rodar, **nesta
ordem exata**:

1. `alembic upgrade head` — cria as tabelas, índices e as colunas geradas.
2. `python -m app.seed_items` — insere os 9 óleos e 2 graxas fixos.

> ⚠️ **A ordem não é negociável.** O `seed_items.py` chama
> `Base.metadata.create_all()`, que cria tabelas a partir de `models.py` —
> e o `models.py` **não** declara as colunas geradas `diferenca` e
> `status` como `GENERATED ALWAYS AS`; quem faz isso é a migração
> `0001_initial.py`. Se o seed rodar primeiro num banco vazio, você acaba
> com tabelas onde `diferenca` e `status` são colunas comuns que ninguém
> preenche — e o cálculo de diferença, que por decisão do projeto **nunca**
> é feito no frontend (RN01–RN03), simplesmente para de funcionar. Esse é
> exatamente o motivo pelo qual o `docker-compose.yml` tem um serviço
> `migrate` separado rodando os dois na ordem.

#### Jeito 0 — pelo script `scripts/migrar-supabase.ps1` (recomendado)

O script roda os dois comandos na ordem certa e, principalmente, **evita
que a senha do banco passe pela linha de comando ou por uma conversa de
chat** — que foi exatamente o problema que obrigou a recriar o projeto do
Supabase em 2026-09-17 (ver `docs/estado-da-migracao.md`, seção 5).

1. Crie `backend/.env.supabase` (ignorado pelo git) com uma linha só,
   usando o **session pooler, porta 5432**:

   ```
   DATABASE_URL=postgresql+psycopg://postgres.<ref>:<SENHA>@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
   ```

2. Rode, da raiz do repositório:

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts/migrar-supabase.ps1
   ```

O script recusa a execução se a URL vier com `postgresql://` em vez de
`postgresql+psycopg://`, ou com a porta `6543` (essa é a da Vercel, não a
da migração), e **não roda o seed se a migração falhar**. Qualquer saída —
inclusive stack trace do driver — sai com a senha trocada por `***`.

Para uma migração futura num banco que já tem o catálogo populado
(seção 8.2), acrescente `-SomenteMigracao` e o seed é pulado.

#### Jeito 1 — com Docker (recomendado, você já tem tudo instalado)

O serviço `migrate` do `docker-compose.yml` já roda exatamente esses dois
comandos na ordem certa. Dá para reaproveitá-lo apontando para o Supabase,
sem subir o Postgres local:

```bash
cd C:/Users/roberto.filho/Desktop/projetos/InventoryApp/Inventory-App
docker compose run --rm --no-deps -e DATABASE_URL="postgresql+psycopg://postgres.abcdefghijklmnop:SUA_SENHA@aws-1-sa-east-1.pooler.supabase.com:5432/postgres" migrate
```

O que cada pedaço faz:
- `run --rm` — roda uma vez e apaga o container depois.
- `--no-deps` — **não** sobe o serviço `db` local junto. É o pulo do gato:
  sem isso, o compose subiria seu Postgres de desenvolvimento à toa.
- `-e DATABASE_URL=...` — sobrescreve, só nesta execução, o valor que
  viria do `.env`. Use a URL do **session pooler (porta 5432)**.

Se der certo, a saída termina com algo como
`Running upgrade -> 0001, initial schema`, seguido do seed sem erros.

#### Jeito 2 — sem Docker, com Python local

```powershell
cd C:\Users\roberto.filho\Desktop\projetos\InventoryApp\Inventory-App\backend
py -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:DATABASE_URL = "postgresql+psycopg://postgres.abcdefghijklmnop:SUA_SENHA@aws-1-sa-east-1.pooler.supabase.com:5432/postgres"
alembic upgrade head
python -m app.seed_items
```

> Rode obrigatoriamente de dentro da pasta `backend/` — o `alembic.ini`
> aponta `script_location = alembic` em caminho relativo, então de outra
> pasta o Alembic não acha as migrações.

### 2.6 Conferir que deu certo

No painel do Supabase, menu lateral → **Table Editor**. Você deve ver as
tabelas do schema (`itens`, `inventarios`, `inventario_itens`,
`importacoes` — conforme `docs/banco-de-dados.md`) e, dentro de `itens`,
**11 linhas**: os 9 óleos e 2 graxas de `seed_items.py`.

Se `itens` estiver vazia ou as tabelas não existirem, **pare aqui** e
resolva antes de seguir; nada adiante funciona sem isso.

---

## 3. Ajuste no código do backend — **só na Opção A**

> **Opções B e C: pule esta seção inteira.** Nelas o backend é um processo
> de longa duração usando o session pooler, e o código atual já funciona
> sem mudança nenhuma.

Na Opção A o backend vira uma **função serverless**: cada requisição pode
cair num processo novo, que vive alguns segundos e morre. Isso quebra duas
premissas do `backend/app/database.py` de hoje:

1. **O pool de conexões não ajuda e atrapalha.** Um pool guarda conexões
   abertas para reaproveitar entre requisições — mas não há "entre
   requisições" aqui. Cada função abriria seu próprio pool e o limite de
   conexões do Supabase estoura rápido.
2. **O transaction pooler (porta 6543) não aceita *prepared statements*.**
   O psycopg 3 usa esse recurso por padrão, então a conexão falha com
   erros do tipo `prepared statement "_pg3_0" already exists` — uma falha
   intermitente, que aparece só sob concorrência e é chata de diagnosticar.

A correção é trocar `backend/app/database.py` por:

```python
import os
from sqlalchemy import create_engine
from sqlalchemy.pool import NullPool
from sqlalchemy.orm import declarative_base, sessionmaker
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg://postgres:postgres@db:5432/scania")

# Em runtime serverless (Vercel) cada invocação é um processo curto e
# isolado: manter um pool de conexões não reaproveita nada e ainda estoura
# o limite de conexões do Supabase. Além disso, o pooler do Supabase em
# modo "transaction" (porta 6543) não suporta prepared statements, que o
# psycopg 3 usa por padrão — daí o prepare_threshold=None.
#
# A flag fica desligada por padrão para não mudar o comportamento em
# desenvolvimento nem na VPS, onde o processo é de longa duração e o pool
# é justamente o que se quer.
_MODO_SERVERLESS = os.getenv("DB_MODO_SERVERLESS", "").lower() in ("1", "true", "sim")

if _MODO_SERVERLESS:
    engine = create_engine(
        DATABASE_URL,
        future=True,
        poolclass=NullPool,
        connect_args={"prepare_threshold": None},
    )
else:
    engine = create_engine(DATABASE_URL, future=True)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

Aproveite e documente a variável nova no `.env.example`:

```
# Só em deploy serverless (Vercel). Vazio/ausente = processo de longa
# duração (dev, Docker, VPS), que usa pool normal de conexões.
DB_MODO_SERVERLESS=
```

Depois faça commit e push — a Vercel só enxerga o que está no GitHub:

```bash
git add backend/app/database.py .env.example
git commit -m "Adiciona modo serverless de conexão ao banco (Vercel + Supabase)"
git push origin main
```

> ⚠️ **Este ajuste precisa de teste real, não só de leitura.** O
> comportamento do psycopg 3 com o pooler do Supabase em modo transaction
> é conhecido por falhar de forma intermitente. O checklist da seção 6 foi
> escrito pensando nisso: repita a importação de XML e o autosave várias
> vezes seguidas, não uma vez só. Esse é o mesmo ponto levantado na seção
> 4.5 de `docs/migracao-vercel-supabase.md`.

---

## 4A. Backend na Vercel (Opção A)

> Faça as seções 2 e 3 antes desta.

### 4A.1 Criar a conta na Vercel

1. Acesse <https://vercel.com> → **Sign Up** → **Continue with GitHub**.
2. Autorize a Vercel. Na tela de instalação do app do GitHub, você pode
   escolher **Only select repositories** e marcar só `Inventory-App` — é
   mais seguro que dar acesso a tudo.
3. Como visto em 0.4, para uso comercial é preciso estar no plano **Pro**.
   Você pode criar o time agora ou usar o período de teste do Pro e
   regularizar antes de colocar em produção — mas **antes do cutover**
   (seção 7) isso precisa estar resolvido.

### 4A.2 Criar o projeto do backend

A boa notícia: a Vercel hoje detecta FastAPI **sem configuração nenhuma**.
Ela procura uma instância chamada `app` em caminhos conhecidos — e
`app/main.py` é um deles, que é exatamente onde o seu backend está.

1. No painel, **Add New… → Project**.
2. Escolha o repositório `Inventory-App` → **Import**.
3. Configure:
   - **Project Name:** `inventario-scania-api`
   - **Root Directory:** clique em **Edit** e selecione **`backend`**.
     Esse é o passo mais importante da tela — sem ele a Vercel olha a raiz
     do repositório, não acha `requirements.txt` e o build falha.
   - **Framework Preset:** deve aparecer **FastAPI** sozinho. Se aparecer
     "Other", pode seguir mesmo assim.
4. Ainda antes de clicar em Deploy, abra **Environment Variables** e
   adicione as três:

   | Nome | Valor |
   |---|---|
   | `DATABASE_URL` | a URL do **transaction pooler**, porta **6543**, no formato `postgresql+psycopg://…` |
   | `DB_MODO_SERVERLESS` | `1` |
   | `CORS_ORIGINS` | deixe `http://localhost:5173` por enquanto — você volta aqui na seção 5.5 com a URL real do frontend |

5. **Deploy**. O primeiro build leva 1–2 minutos.

### 4A.3 Apontar a função para São Paulo

Por padrão as funções rodam em `iad1` (Washington, EUA). Se você criou o
Supabase em São Paulo, deixar assim significa que **toda** consulta ao
banco atravessa o continente duas vezes.

Em **Settings → Functions → Function Region**, escolha **`gru1` (São
Paulo)**. Depois redeploy (Deployments → o último → menu `…` →
**Redeploy**).

> ⚠️ **No plano Hobby isso não pega (testado em 2026-09-17).** A caixa do
> `gru1` marca e o Save não reclama, mas ao recarregar a página a região
> volta para `iad1`. Tentado três vezes, inclusive desmarcando o `iad1`
> antes — o painel avisa "Regions for Hobby projects are limited to 1",
> mas na prática a escolha não persiste. **Custo medido:** cada
> `GET /inventarios/{data}` na API publicada leva ~1,5 s, que é a ida e
> volta Virgínia ↔ São Paulo a cada consulta. Se o projeto for para o Pro,
> refazer este passo; se continuar travado, testar `"regions": ["gru1"]`
> num `backend/vercel.json`.

### 4A.4 Testar

Sua API está numa URL do tipo
`https://inventario-scania-api.vercel.app`. Teste o endpoint de saúde,
que não depende de banco:

```bash
curl https://inventario-scania-api.vercel.app/api/v1/health
```

Resposta esperada: `{"status":"ok"}`.

Agora um que **depende** do banco (troque a data por hoje):

```bash
curl https://inventario-scania-api.vercel.app/api/v1/inventarios/2026-09-16
```

Esperado: um JSON com `"status": "nao_iniciado"` se o dia ainda não
existe. Lembrando que, por decisão do projeto, esse `GET` **nunca escreve
no banco** — se ele retornar `nao_iniciado`, está correto, não é erro.

Se este segundo comando falhar mas o primeiro funcionar, o problema é a
conexão com o banco — vá para a seção 12.

### 4A.5 O que você aceitou ao escolher a Opção A

Três consequências reais, documentadas aqui para não te pegarem de
surpresa depois:

1. **Upload de XML limitado a 4,5 MB.** É um teto da plataforma, não do
   seu código: a Vercel devolve `413 FUNCTION_PAYLOAD_TOO_LARGE` antes da
   requisição chegar no FastAPI, então a validação de 10 MB do
   `inventarios.py` nem chega a rodar, e o erro que a pessoa vê não segue
   o envelope `{ "erro": {...} }` do projeto. **No seu caso isso é
   teórico** — você confirmou que os XMLs de peças ficam abaixo de 1 MB.
   Mas o limite formal de 10 MB de `docs/document-rest-API.md` deixa de
   ser verdade na prática, e vale corrigir o número no documento se você
   seguir por aqui.
2. **Cold start.** Depois de um tempo sem uso, a primeira requisição
   demora alguns segundos a mais. Com autosave por item (debounce de
   500ms, RNF11), isso aparece como uma lentidão no primeiro campo editado
   depois do café. As requisições seguintes são normais.
3. **Migração deixou de ser automática.** O serviço `migrate` do compose
   não existe mais aqui. Toda vez que houver migração nova, você roda à
   mão **antes** do deploy — a rotina está na seção 8.2.

---

## 4B. Backend no Render (Opção B)

> Faça a seção 2 antes desta. **Não** faça a seção 3 — aqui o código atual
> funciona sem alteração.

O Render hospeda aplicações em containers de longa duração — bem mais
parecido com o que você tem hoje na VPS, mas gerenciado. O backend
continua sendo um processo Uvicorn no ar o tempo todo.

### 4B.1 Criar a conta

1. Acesse <https://render.com> → **Get Started** → **GitHub**.
2. Autorize e, na tela de permissões do GitHub, prefira **Only select
   repositories** → `Inventory-App`.

### 4B.2 Criar o Web Service

1. No painel: **Add new → Web Service**.
2. Escolha o repositório `Inventory-App` → **Connect**.
3. Configure:

   | Campo | Valor |
   |---|---|
   | **Name** | `inventario-scania-api` |
   | **Region** | a mesma que você escolheu no Supabase (ex.: `Ohio` / `Virginia`) |
   | **Branch** | `main` |
   | **Root Directory** | `backend` |
   | **Runtime / Language** | `Python 3` |
   | **Build Command** | `pip install -r requirements.txt` |
   | **Start Command** | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
   | **Instance Type** | ver 4B.3 |

   > O `$PORT` no start command não é opcional: o Render escolhe a porta e
   > informa por essa variável. Fixar `8000` faz o serviço subir mas nunca
   > receber tráfego, e o deploy fica preso em "in progress".

4. Em **Environment Variables**, adicione:

   | Nome | Valor |
   |---|---|
   | `DATABASE_URL` | a URL do **session pooler**, porta **5432**, no formato `postgresql+psycopg://…` |
   | `CORS_ORIGINS` | `http://localhost:5173` por enquanto — você volta na seção 5.5 |
   | `PYTHON_VERSION` | `3.12` (mesma versão do `backend/Dockerfile`) |

5. **Create Web Service**. O primeiro deploy leva uns 3–5 minutos.

### 4B.3 Plano grátis ou pago?

O plano **Free** do Render desliga o serviço depois de **15 minutos sem
requisição**, e religar leva **30 a 60 segundos** para uma aplicação
Python. Para um sistema usado em pulsos ao longo do dia — abre de manhã,
volta depois do almoço — isso significa uma espera de quase um minuto com
a tela travada em várias dessas retomadas.

Para uso real, o **Starter (US$ 7/mês)** não hiberna. Sugestão: crie no
Free para validar o roteiro sem gastar, e suba para Starter antes do
cutover (seção 7).

### 4B.4 Testar

```bash
curl https://inventario-scania-api.onrender.com/api/v1/health
curl https://inventario-scania-api.onrender.com/api/v1/inventarios/2026-09-16
```

(A URL exata aparece no topo do painel do serviço.) Se estiver no plano
Free, a **primeira** chamada pode demorar até um minuto — é a hibernação,
não um erro.

### 4B.5 O que muda em relação a hoje

- **Nada de limite de payload** da plataforma: os 10 MB de
  `docs/document-rest-API.md` continuam valendo de verdade.
- **Sem cold start** no plano Starter.
- **Workers do Uvicorn:** o start command acima sobe **1 worker**, não os
  5 configurados em `docker-compose.prod.yml` (decisão de 2026-08-09).
  Para até 5 pessoas simultâneas, 1 worker dá conta com folga — mas se
  quiser manter o dimensionamento anterior, acrescente `--workers 5` ao
  start command **e** use uma instância com memória suficiente (cada
  worker é uma cópia do processo).
- **Migração manual**, igual à Opção A: seção 8.2.

---

## 4C. Backend numa VPS (Opção C)

> Faça a seção 2 antes desta. **Não** faça a seção 3.

> ⚠️ **Esta seção pressupõe uma VPS já montada — e ela não existe.** Antes
> de qualquer passo daqui, você precisa contratar a VPS e executar
> `docs/preparativos-vps.md` por inteiro (contratar, Ubuntu, SSH, Docker,
> firewall, domínio, Caddy). Só depois o que está descrito abaixo faz
> sentido. Os comandos a seguir assumem esse ambiente pronto.

Nesta opção o banco fica no Supabase e o backend roda em Docker na VPS.

### 4C.1 Apontar o backend para o Supabase

Na VPS, edite o `.env` e troque a linha do `DATABASE_URL` pela URL do
**session pooler (porta 5432)**:

```bash
ssh root@SEU_IP
cd /caminho/do/projeto
nano .env
```

```
DATABASE_URL=postgresql+psycopg://postgres.abcdefghijklmnop:SUA_SENHA@aws-1-sa-east-1.pooler.supabase.com:5432/postgres
```

### 4C.2 Desativar o Postgres local

Com o banco no Supabase, o container `db` vira peso morto — e pior,
continua ocupando disco com dados que ninguém mais lê. Mas os serviços
`migrate` e `backend` dependem dele via `depends_on: db:
condition: service_healthy`, então não dá para simplesmente apagar o
serviço: o compose recusa a subir com uma dependência inexistente.

Duas saídas:

- **Mais simples e reversível:** deixe tudo como está. O `db` sobe, fica
  ocioso e ninguém o usa. Desperdiça memória, mas voltar atrás é só
  reverter a linha do `.env`. Boa escolha para o período de convivência.
- **Definitiva:** edite `docker-compose.yml` e `docker-compose.prod.yml`
  removendo o serviço `db`, o volume `db_data`, o serviço `backup` e
  **todos** os blocos `depends_on` que citam `db`. Faça isso só depois de
  semanas de operação estável no Supabase.

### 4C.3 Subir

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose logs -f backend
```

O serviço `migrate` vai rodar contra o Supabase e encontrar as migrações
já aplicadas na seção 2.5 — ele não faz nada, o que é o comportamento
correto.

### 4C.4 Vale a pena?

Sendo honesto: **esta é a opção com pior relação custo/benefício das três**.
Você monta uma VPS inteira — com todo o trabalho de administração que isso
implica — e ainda assim deixa o banco fora dela, ganhando latência de rede
em toda consulta e uma peça a mais para monitorar.

Se você vai administrar uma VPS de qualquer jeito, faz mais sentido rodar
o Postgres nela também (é o que `docs/preparativos-vps.md` descreve, com
backup diário via `scripts/backup-postgres.sh`) e dispensar o Supabase.
E se você não quer administrar servidor, as opções A e B resolvem isso
melhor.

O caso em que ela se justifica é estreito: você quer o painel do Supabase
para inspecionar dados sem SSH, e aceita pagar latência por isso.

---

## 5. Frontend na Vercel — comum às três opções

### 5.1 Criar a conta (se ainda não criou)

Se você fez a Opção A, a conta já existe — pule para 5.2. Caso contrário,
siga o passo 4A.1.

### 5.2 Criar o arquivo `frontend/vercel.json`

O app usa `react-router` com `BrowserRouter`, ou seja, `/contagem`,
`/inventarios` e `/historico` **não são arquivos** — são rotas que só
existem depois que o JavaScript carrega. Sem configuração, abrir
`https://seu-site.vercel.app/historico` direto na barra de endereços (ou
apertar F5 nessa tela) devolve **404**, porque a Vercel procura um arquivo
`/historico` que não existe.

A correção é a mesma ideia do `try_files {path} /index.html` que já existe
no seu `frontend/Caddyfile`. Crie o arquivo `frontend/vercel.json`:

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

Isso só vale quando **nenhum arquivo estático corresponde** ao caminho, então
CSS, JS e imagens continuam sendo servidos normalmente.

```bash
git add frontend/vercel.json
git commit -m "Adiciona vercel.json com fallback de SPA para o react-router"
git push origin main
```

### 5.3 Criar o projeto

1. No painel da Vercel: **Add New… → Project** → `Inventory-App` →
   **Import**.

   > Sim, é o **mesmo repositório** que você já importou na Opção A. Isso
   > é normal e esperado: dois projetos Vercel apontando para o mesmo
   > repo, cada um com um **Root Directory** diferente.

2. Configure:
   - **Project Name:** `inventario-scania`
   - **Root Directory:** **`frontend`**
   - **Framework Preset:** **Vite** (detectado sozinho)
   - **Build Command** e **Output Directory:** deixe como vieram
     (`npm run build` e `dist`)

3. Em **Environment Variables**, adicione **uma**:

   | Nome | Valor |
   |---|---|
   | `VITE_API_URL` | a URL pública do seu backend, **sem barra no final** |

   Conforme a opção escolhida:
   - **A:** `https://inventario-scania-api.vercel.app`
   - **B:** `https://inventario-scania-api.onrender.com`
   - **C:** `https://api.seudominio.com.br` (ou `http://SEU_IP` se ainda
     não tem domínio — mas veja o aviso em 5.4)

4. **Deploy**.

> **Por que essa variável importa tanto:** o
> `frontend/src/api/inventarios.ts` monta cada chamada como
> `${API_BASE_URL}/api/v1/...`, e o valor padrão, quando a variável não
> existe, é `http://localhost:8000`. Se você esquecer de defini-la, o site
> sobe bonitinho e **toda** chamada à API falha, porque o navegador de
> cada pessoa vai tentar falar com o computador *dela*.

### 5.4 ⚠️ Conteúdo misto (HTTPS → HTTP)

A Vercel serve tudo em **HTTPS**. Um navegador se recusa a fazer chamadas
em **HTTP puro** a partir de uma página HTTPS — é o bloqueio de *mixed
content*, e ele acontece silenciosamente no console, sem mensagem de erro
na tela.

Consequência prática: `VITE_API_URL` **precisa** começar com `https://`.
Nas opções A e B isso já vem de graça. Na **Opção C**, isso significa que a
VPS precisa de um **domínio com certificado** — o Caddy já resolve isso
sozinho assim que `DOMAIN` estiver definido (ver `docs/preparativos-vps.md`,
seções 5 e 7). Apontar o frontend para `http://SEU_IP` não vai funcionar.

### 5.5 Fechar o ciclo do CORS

Até aqui o backend ainda não autoriza o frontend a falar com ele. Agora que
você tem a URL final do frontend (algo como
`https://inventario-scania.vercel.app`, mostrada no topo do projeto),
volte no backend e ajuste `CORS_ORIGINS`:

- **Opção A:** projeto `inventario-scania-api` → **Settings → Environment
  Variables** → edite `CORS_ORIGINS` → **Redeploy**.
- **Opção B:** painel do Render → serviço → **Environment** → edite
  `CORS_ORIGINS` → salve (o Render reinicia sozinho).
- **Opção C:** edite o `.env` na VPS e rode
  `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`.

O valor é a URL do frontend, **sem barra no final**:

```
CORS_ORIGINS=https://inventario-scania.vercel.app
```

Se você for usar domínio próprio (seção 7), liste os dois separados por
vírgula — o `main.py` já faz o split e o strip:

```
CORS_ORIGINS=https://inventario-scania.vercel.app,https://inventario.suaempresa.com.br
```

> **Nota sobre deploys de preview:** cada branch e cada PR ganha uma URL
> nova e aleatória na Vercel, que **não** vai estar em `CORS_ORIGINS` —
> então previews do frontend não conseguem falar com a API de produção.
> Isso é o esperado e até saudável (evita que um teste escreva no banco
> real). Para testar uma branch de ponta a ponta, teste localmente com
> `docker compose up` apontando para o Supabase.

---

## 6. Verificação de ponta a ponta

Antes de considerar a migração feita, abra o site e percorra **todos** os
fluxos abaixo. Eles cobrem justamente as regras que dependem do backend e
do banco — que é exatamente o que a migração mexeu.

| # | O que fazer | O que precisa acontecer |
|---|---|---|
| 1 | Abrir a tela **Contagem** num dia novo | Os 9 óleos e 2 graxas aparecem; status geral `nao_iniciado` |
| 2 | Digitar uma quantidade física e esperar ~1s | O indicador de salvamento confirma; **diferença e status mudam sozinhos** (vieram do backend — RN01–RN03) |
| 3 | Apertar **F5** | O valor digitado continua lá (virou rascunho no banco) |
| 4 | Abrir `/historico` **direto na barra de endereços** | Carrega a tela, **não** um 404 (é o `vercel.json` da seção 5.2 funcionando) |
| 5 | Ir em **Inventários** e importar um XML de peças | Diálogo de resumo aparece com os totais corretos |
| 6 | Importar **o mesmo XML de novo** | Faz *merge*, **não duplica** itens (RN13/RN04) |
| 7 | **Fechar o dia** | Status vira `fechado`; a data aparece no Histórico |
| 8 | Abrir a **Contagem do dia seguinte** | Quantidade física zerada; **quantidade de sistema herdada** do dia anterior (RN27) |
| 9 | Clicar em **Nova contagem** num dia já fechado | Aparece o `ConfirmDialog` reforçado; o dia continua `fechado` com o `fechado_em` original (RN18) |
| 10 | Navegar pelo **Histórico** e paginar | Página de 30 itens; rascunhos nunca fechados **não** aparecem (RN25) |
| 11 | Usar o botão de **impressão** | O layout de impressão sai correto |
| 12 | **Só na Opção A:** repetir os passos 2 e 5 umas 5 vezes seguidas, rápido | Nenhum erro intermitente de `prepared statement` (é o teste do ajuste da seção 3) |

Deu erro em algum? Veja a seção 12 antes de mexer no código.

---

## 7. Domínio próprio (opcional)

As URLs `*.vercel.app` funcionam perfeitamente bem. Um domínio próprio
(`inventario.suaempresa.com.br`) é só apresentação — a não ser na Opção C,
onde ele é **obrigatório** por causa do HTTPS (seção 5.4).

1. Projeto do frontend na Vercel → **Settings → Domains → Add**.
2. Digite o domínio. A Vercel mostra o registro DNS a criar (um `CNAME`
   apontando para `cname.vercel-dns.com`, ou um `A` se for domínio raiz).
3. Crie esse registro no painel de quem administra seu domínio (Registro.br,
   Hostinger, Cloudflare — onde ele estiver).
4. Espere a propagação (minutos a algumas horas). O certificado HTTPS a
   Vercel emite sozinha.
5. **Volte na seção 5.5** e acrescente o domínio novo ao `CORS_ORIGINS` do
   backend — esquecer disso é a causa clássica de "funcionava no
   `.vercel.app` e parou no domínio próprio".

---

## 8. A rotina depois da migração

### 8.1 Publicar uma mudança de código

Não existe mais `docker compose up` em servidor nenhum (exceto na Opção
C). O deploy é:

```bash
git add .
git commit -m "descrição da mudança"
git push origin main
```

Vercel e Render detectam o push e publicam sozinhos em 1–3 minutos.
Acompanhe em **Deployments**. Se o build quebrar, a versão anterior
**continua no ar** — a nova só substitui a antiga quando o build termina
bem.

### 8.2 Publicar uma mudança de **banco** (migração nova)

Esta é a parte que exige disciplina, porque a rede de proteção do
`docker-compose` (o serviço `migrate` bloqueando o `backend`) não existe
mais nas opções A e B.

**A ordem é sempre: migrar primeiro, publicar depois.**

```bash
# 1. Rode a migração contra o Supabase (session pooler, porta 5432)
cd C:/Users/roberto.filho/Desktop/projetos/InventoryApp/Inventory-App
docker compose run --rm --no-deps -e DATABASE_URL="postgresql+psycopg://…@…:5432/postgres" migrate

# 2. Só depois que ela terminar sem erro:
git push origin main
```

Inverter isso coloca no ar um código que espera colunas que ainda não
existem — e o sistema quebra para quem estiver usando naquele momento. Na
Opção C isso continua automático via serviço `migrate`, e você não precisa
se preocupar.

### 8.3 Ver logs quando algo dá errado

- **Vercel:** projeto → **Logs** (ou Deployments → o deploy → **Runtime
  Logs**). No plano Pro ficam 1 dia de histórico.
- **Render:** serviço → aba **Logs**, em tempo real.
- **Supabase:** projeto → **Logs** → `Postgres Logs`.

---

## 9. Backups

Este é o ponto onde o plano gratuito do Supabase deixa a desejar, e vale
encarar de frente: hoje você tem backup diário automático com 7 dias de
retenção (`scripts/backup-postgres.sh` + serviço `backup` do
`docker-compose.prod.yml`). Depois da migração, esse script **não faz mais
sentido**, porque o banco que ele copia não é mais o banco em uso.

Três caminhos:

| Caminho | Custo | O que você ganha |
|---|---|---|
| **Supabase Pro** | US$ 25/mês | Backup diário automático, retenção de 7 dias, restauração pelo painel |
| **Supabase Free + `pg_dump` seu** | US$ 0 | Você mantém o controle, mas precisa lembrar de rodar (ou agendar) |
| **Supabase Free sem backup** | US$ 0 | Nada. **Não faça isso** com dados de inventário de uma empresa |

Para o caminho do meio, o comando (rode no seu computador, com Docker):

```bash
docker run --rm postgres:16 pg_dump "postgresql://postgres.abcdefghijklmnop:SUA_SENHA@aws-1-sa-east-1.pooler.supabase.com:5432/postgres" > backup-$(date +%F).sql
```

Dá para agendar isso no **Agendador de Tarefas do Windows** para rodar
todo dia — mas atenção: só roda com o computador ligado, o que é uma rede
de proteção mais frágil que a de hoje (a VPS ficava ligada 24h). Se o
inventário é registro fiscal/operacional da concessionária, o Supabase Pro
provavelmente é o caminho mais sensato.

---

## 10. Como voltar atrás

> **Corrigido em 2026-09-16:** esta seção descrevia um rollback para a VPS
> e um período de convivência entre dois ambientes. **Nada disso se
> aplica** — não existe ambiente antigo. O sistema nunca foi ao ar; este
> deploy é o primeiro.

Como não há sistema em produção, também não há o risco que normalmente
torna um cutover delicado: ninguém perde acesso, nenhum dado existente
corre risco, e não há dois bancos divergindo em paralelo. Isso simplifica
bastante a virada — na prática, "ir ao ar" é só passar o endereço para as
pessoas pela primeira vez.

O que ainda vale cuidar:

- **Antes de divulgar o endereço**, rode o checklist da seção 6 inteiro.
  Depois que as pessoas começarem a registrar contagens de verdade, o banco
  passa a ter dado que importa.
- **Recriar o projeto do Supabase é barato agora e caro depois.** Enquanto
  o banco só tem dado de teste, apagar e refazer custa dois minutos. Se
  você pretende trocar a senha do banco (ver `docs/estado-da-migracao.md`,
  seção 5), faça isso **antes** de divulgar.
- **Se a Vercel não te agradar**, o caminho de volta não é a VPS que
  existe — é a VPS que você contrataria, seguindo `docs/preparativos-vps.md`.
  O código continua compatível com os dois: o modo serverless vem desligado
  por padrão, e o `docker-compose` nunca deixou de funcionar.

---

## 11. Custos, lado a lado

Valores de setembro de 2026, em dólar e sem impostos (a Vercel cobra em
USD; some IOF e variação cambial no cartão).

| Item | Opção A | Opção B | Opção C (VPS) |
|---|---|---|---|
| Vercel Pro (obrigatório para uso comercial — ver 0.4) | US$ 20 | US$ 20 | — |
| Backend | incluso na Vercel | Render Starter US$ 7 | incluso na VPS |
| Banco | Supabase Free US$ 0 | Supabase Free US$ 0 | Postgres na própria VPS |
| Hospedagem própria | — | — | VPS Hostinger ~R$ 30–50 |
| **Total/mês (sem backup gerenciado)** | **US$ 20** | **US$ 27** | **~R$ 30–50** |
| Supabase Pro (backup diário — seção 9) | +US$ 25 | +US$ 25 | não se aplica |
| **Total/mês (com backup gerenciado)** | **US$ 45** | **US$ 52** | **~R$ 30–50** |

> **Premissa corrigida em 2026-09-16:** versões anteriores desta tabela
> tratavam a VPS como um custo que você já pagava. **Isso estava errado** —
> a VPS nunca foi contratada e o sistema nunca foi ao ar; até hoje ele só
> rodou em `localhost`. Então nenhuma das opções é "manter o que já existe":
> **todas** são o primeiro deploy de produção do projeto, e a comparação é
> entre caminhos igualmente novos.

Com a premissa certa, a leitura muda bastante:

- **A VPS é mais barata em dinheiro** (uma conta em reais, sem dólar nem
  IOF), mas cobra em trabalho: contratar, configurar Ubuntu, SSH, firewall,
  apontar domínio, cuidar de atualizações e monitorar disco. O roteiro está
  pronto em `docs/preparativos-vps.md`, mas nunca foi executado — então o
  tempo de aprendizado ainda está todo pela frente.
- **A Vercel é mais cara e quase não cobra trabalho**: `git push` publica,
  HTTPS e domínio saem de graça, e não há servidor para administrar.
- O que **não** existe mais como argumento: "já tenho a VPS montada, mudar
  seria desperdício". Não há nada montado.

Se o orçamento for o critério dominante e você topar a curva de
aprendizado, a VPS ganha. Se o seu tempo vale mais que a diferença de
preço, a Vercel ganha. Nenhuma das duas é obviamente errada.

---

## 12. Problemas comuns

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Build falha com `Could not find requirements.txt` | **Root Directory** não foi ajustado | Settings → General → Root Directory = `backend` (ou `frontend`) |
| Tela abre mas nada carrega; console mostra erro de CORS | `CORS_ORIGINS` não tem a URL do frontend | Seção 5.5. Confira que **não** tem barra no final |
| Console mostra chamadas para `localhost:8000` | `VITE_API_URL` não foi definida | Seção 5.3. Variável de build: depois de definir, **redeploy** — mudar a variável sozinha não republica |
| Console mostra "blocked: mixed content" | Frontend em HTTPS chamando API em HTTP | Seção 5.4 — a API precisa de HTTPS |
| `/historico` dá 404 ao recarregar | Falta o `frontend/vercel.json` | Seção 5.2 |
| Erro de conexão com o banco, mas o `/health` funciona | URL errada (direct connection em vez de pooler), senha com caractere especial, ou falta `+psycopg` | Seções 2.3 e 2.4 |
| `prepared statement "_pg3_0" already exists` (intermitente) | Transaction pooler sem o ajuste do psycopg | Seção 3 — confira que `DB_MODO_SERVERLESS=1` está setada **e** que houve redeploy depois |
| `413 FUNCTION_PAYLOAD_TOO_LARGE` ao importar XML | XML acima de 4,5 MB na Opção A | Seção 4A.5 |
| Diferença/status aparecem vazios ou sempre zerados | Seed rodou antes da migração | Seção 2.5. Correção: apague as tabelas pelo Table Editor e refaça **na ordem certa** |
| Primeiro acesso do dia demora ~1 minuto | Render Free hibernando | Seção 4B.3 — suba para Starter |
| Projeto Supabase "pausado" | Free pausa após 1 semana sem uso | Despause pelo painel. Uso diário não chega perto disso |

---

## 13. O que atualizar no repositório depois da migração

Só faça isso **depois** do cutover consolidado (seção 10), não durante o
período de convivência — enquanto os dois ambientes existem, a
documentação dos dois precisa continuar válida.

- [ ] `README.md` — atualizar a linha deste arquivo e das entradas que
      viraram histórico
- [ ] `docs/preparativos-vps.md` e `docs/docker-compose.md` — mover para
      `docs/arquivo/` em vez de apagar (preserva o histórico de decisões)
- [ ] `docs/document-rest-API.md` — **só na Opção A:** corrigir o limite
      de upload de 10 MB para 4,5 MB
- [ ] `CLAUDE.md` — atualizar a tabela de documentos e a decisão de
      2026-08-09 sobre o serviço `migrate` (que deixa de existir nas
      opções A e B)
- [ ] `SPRINTS.md` — registrar a migração no "Log de decisões", com a data
      e a opção escolhida
- [ ] `docker-compose*.yml`, `backend/Dockerfile`, `frontend/Dockerfile`,
      `frontend/Caddyfile`, `scripts/backup-postgres.sh` — perdem a função
      nas opções A e B. Sugestão: manter no repositório durante a
      convivência e remover num commit único depois, para o rollback
      continuar sendo um `git revert`

---

## 14. Referências consultadas

Verificadas em 2026-09-16 — painéis dessas plataformas mudam de layout com
frequência, então se um botão não estiver onde o texto diz, procure pelo
nome dele.

- [Deploy a FastAPI app on Vercel](https://vercel.com/docs/frameworks/backend/fastapi)
- [Vercel Functions Limits](https://vercel.com/docs/functions/limitations) — o teto de 4,5 MB de corpo de requisição
- [Vercel Hobby Plan](https://vercel.com/docs/plans/hobby) — a restrição de uso não comercial
- [Supabase — Connecting to Postgres](https://supabase.com/docs/guides/database/connecting-to-postgres) — os três tipos de string de conexão
- [Supabase — Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing)
- [Supabase — Disabling prepared statements](https://supabase.com/docs/guides/troubleshooting/disabling-prepared-statements-qL8lEL)
- [Supabase — Pricing](https://supabase.com/pricing)
- [Render — Deploy for Free](https://render.com/docs/free) — hibernação após 15 min
- [Render — Pricing](https://render.com/pricing)
