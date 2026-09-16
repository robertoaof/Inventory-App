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
| Projeto Supabase | `fodtdcdratwglkmbvnia`, região **São Paulo** (`sa-east-1`), plano **Free** | 2026-09-16 |
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

### 2.2 Banco de dados Supabase — **pronto e verificado**

O schema foi criado e o catálogo populado em 2026-09-16. Verificado via
MCP, com estes resultados:

| Verificação | Resultado |
|---|---|
| Tabelas | `itens`, `inventarios`, `inventario_itens`, `importacoes_xml`, `alembic_version` |
| Catálogo fixo | 11 itens — 9 óleos + 2 graxas |
| Versão do Alembic | `0001_initial` |
| Colunas geradas | `diferenca=ALWAYS`, `status=ALWAYS` ✅ |

**Não é preciso rodar a migração de novo.** Ela já está aplicada no banco
remoto, e o Alembic sabe disso (`alembic_version = 0001_initial`).

### 2.3 Ferramental

- `.mcp.json` na raiz registra o servidor MCP do Supabase. Na máquina nova
  ele vai pedir aprovação na primeira sessão e depois autenticação OAuth.

---

## 3. O que falta fazer

Nada disso foi iniciado ainda:

- [ ] Criar a conta/time na Vercel (ver seção 6 sobre o plano Pro)
- [ ] Criar o **projeto da API** na Vercel (Root Directory = `backend`)
- [ ] Apontar a função para a região `gru1`
- [ ] Criar o **projeto do frontend** na Vercel (Root Directory = `frontend`)
- [ ] Configurar `VITE_API_URL` no frontend e `CORS_ORIGINS` no backend
- [ ] Rodar o checklist de verificação de ponta a ponta (seção 6 do roteiro)
- [ ] Trocar a senha do banco (ver seção 5)

O passo a passo detalhado de cada um está em
`docs/deploy-vercel-supabase.md`, seções 4A e 5.

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

- A senha do papel `postgres` do projeto Supabase `fodtdcdratwglkmbvnia`.
  É a senha **definida na criação do projeto** — ver o aviso abaixo.

Com ela, as duas strings de conexão se montam assim:

```
# Session pooler (porta 5432) — migrações do Alembic a partir da sua máquina
postgresql+psycopg://postgres.fodtdcdratwglkmbvnia:SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres

# Transaction pooler (porta 6543) — é esta que vai na Vercel
postgresql+psycopg://postgres.fodtdcdratwglkmbvnia:SENHA@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
```

Host e usuário estão confirmados como corretos por teste direto. O prefixo
`postgresql+psycopg://` (em vez do `postgresql://` que o painel mostra) é
obrigatório — é o que diz ao SQLAlchemy qual driver usar.

### ⚠️ O botão "Reset database password" não funciona neste projeto

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

Como a senha atual passou pelo chat durante a depuração, **trocá-la antes
do cutover é recomendável** — recriar o projeto e rodar a migração de novo
resolve, e a migração leva segundos.

### Disjuntor do pooler

Tentativas repetidas de autenticação falha ativam um disjuntor no
Supavisor: `(ECIRCUITBREAKER) too many authentication failures, new
connections are temporarily blocked`. Ele se resolve sozinho em alguns
minutos. Se aparecer, **pare de tentar** — insistir prolonga o bloqueio.

### Conexão direta não funciona nesta rede

O host `db.fodtdcdratwglkmbvnia.supabase.co` (Direct connection) é
**IPv6-only** e o DNS nem resolve em rede sem IPv6 — foi o caso da máquina
original. Use sempre o pooler (`aws-0-sa-east-1.pooler.supabase.com`).

---

## 6. ⚠️ Vercel: plano Pro é obrigatório

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

Tenha a senha do banco em mãos antes de começar, se for rodar migrações.

---

## 8. Histórico resumido da sessão de 2026-09-16

Para contexto de quem retomar:

1. Escrito o roteiro `docs/deploy-vercel-supabase.md` cobrindo as três
   opções de hospedagem (commit `be6b869`).
2. Escolhida a Opção A e aplicadas as três mudanças de código que ela
   exige (commit `8648fe9`).
3. Criado o projeto no Supabase e registrado o servidor MCP.
4. Seis tentativas de conectar ao banco falharam por autenticação. A
   investigação descartou, por teste direto, que fosse host, usuário,
   porta, rede, IPv6 ou integridade do projeto — o tenant era encontrado
   pelo pooler, apenas a senha era recusada. A causa real: os resets de
   senha do painel não estavam sendo aplicados, e a senha válida era a
   original da criação do projeto.
5. Migração e seed aplicados com sucesso e verificados via MCP.

O que **não** foi feito: nada na Vercel. A conta foi criada, mas nenhum
projeto foi importado ainda.
