# Docker Compose — Sistema de Inventário de Óleo e Peças (Scania)

Este documento é a especificação para quem (ou qual agente) for escrever o
`docker-compose.yml` e os `Dockerfile`s do projeto de verdade — não contém
o YAML final, mas define serviços, variáveis, portas, volumes e
comportamento esperado com detalhe suficiente para a implementação não
precisar tomar decisão de arquitetura por conta própria.

Parte da estrutura de pastas já definida em `visao-geral.md` (seção 6):
`frontend/`, `backend/` e `docs/` na raiz de `sistema-inventario-scania/`.
Os arquivos deste documento devem ser criados assim:

```
sistema-inventario-scania/
├── docker-compose.yml
├── docker-compose.override.yml   # ajustes específicos de desenvolvimento
├── docker-compose.prod.yml       # ajustes explícitos de produção
├── .env.example                  # modelo de variáveis, sem segredos reais
├── frontend/
│   └── Dockerfile
└── backend/
    └── Dockerfile
```

---

## 1. Serviços — visão geral

| Serviço | Papel | Baseado em | Porta padrão |
|---|---|---|---|
| `db` | Banco de dados | Imagem oficial `postgres` | `5432` |
| `migrate` | Roda a migração Alembic + seed do catálogo e sai | Mesma imagem do `backend` (`Dockerfile` de `backend/`), comando diferente | nenhuma |
| `backend` | API (FastAPI) | `Dockerfile` próprio, em `backend/` | `8000` |
| `frontend` | Interface (React) | `Dockerfile` próprio, em `frontend/` | `5173` (dev) / `80` (produção) |
| `backup` | Backup diário do Postgres (`pg_dump`), só em produção | Imagem `postgres:16` + `scripts/backup-postgres.sh` | nenhuma |

Os três sobem numa mesma rede interna criada automaticamente pelo Compose,
e se enxergam pelo **nome do serviço** (`db`, `backend`) em vez de
`localhost` — é assim que o `backend` vai encontrar o `db`, por exemplo.

---

## 2. Serviço `db` (PostgreSQL)

- **Imagem:** `postgres:16` (ou a versão estável mais recente disponível no
  momento da implementação — não há motivo de negócio para travar numa
  versão específica, mas registrar a versão usada no `docker-compose.yml`
  para manter previsibilidade entre ambientes).
- **Variáveis de ambiente esperadas:** `POSTGRES_USER`, `POSTGRES_PASSWORD`,
  `POSTGRES_DB` — todas vindas do arquivo `.env` (seção 6), nunca escritas
  diretamente no `docker-compose.yml`.
- **Volume nomeado** para persistir os dados fora do ciclo de vida do
  container (sem isso, um `docker compose down` apagaria o banco inteiro).
- **Porta exposta:** `5432`, mapeada para a mesma porta na máquina host —
  útil para conectar um cliente de banco (DBeaver, TablePlus, etc.)
  diretamente durante o desenvolvimento, mesmo com tudo rodando em
  container.
- **Healthcheck:** deve existir (ex: `pg_isready`), porque o `depends_on`
  do Compose, sozinho, só espera o container *iniciar* — não que o
  Postgres já esteja *pronto para aceitar conexões*. Sem o healthcheck, o
  `backend` pode subir antes do banco estar realmente disponível e falhar
  na primeira tentativa de conexão.

### 2.1 Backups — decidido em 2026-08-09

- **Frequência e retenção:** diário, mantendo os últimos **7 dias** — depois
  disso o backup mais antigo é apagado automaticamente. Cobre o caso comum
  de "percebi o erro alguns dias depois" sem acumular espaço em disco
  indefinidamente.
- **Onde ficam guardados hoje:** só em disco local, no volume nomeado
  `backup_data` (serviço `backup`, `docker-compose.prod.yml`) — mesmo
  padrão do `db_data`. **Cópia externa (S3/Backblaze/outro servidor) ainda
  não foi decidida** — fica para quando a hospedagem final for definida
  (seção 5); a rotina local já funciona sozinha, então adicionar um passo
  de upload externo depois é aditivo, não uma reescrita.
- **Como funciona:** `scripts/backup-postgres.sh` roda dentro do serviço
  `backup` (imagem `postgres:16`, que já tem `pg_dump`), gera
  `invcontra_AAAA-MM-DD_HHMMSS.sql.gz` em `/backups` e apaga o que passou
  de 7 dias. O serviço faz um dump assim que sobe e repete a cada 24h
  (`while true; do ...; sleep 86400; done`) — **não é um agendamento de
  horário fixo** (a imagem `postgres:16` não tem `cron` instalado); se um
  horário específico do dia importar, trocar por um cron do host chamando
  `docker compose exec backup sh /scripts/backup-postgres.sh`.
- **Restaurar um backup:** `gunzip -c invcontra_AAAA-MM-DD_HHMMSS.sql.gz |
  docker compose exec -T db psql -U $POSTGRES_USER -d $POSTGRES_DB`
  (comentado também no topo do próprio script).
- **Verificado em 2026-08-09:** `docker compose -f docker-compose.yml -f
  docker-compose.prod.yml up -d db migrate backup` gerou um dump válido em
  segundos (`pg_dump`/`gunzip` confirmados na prática), salvo no volume
  `backup_data`.

---

## 3. Serviço `backend` (FastAPI)

- **Build:** a partir de um `Dockerfile` em `backend/`, não de uma imagem
  pronta — o código da aplicação faz parte da imagem.
- **Variáveis de ambiente esperadas:**
  - `DATABASE_URL` — string de conexão apontando para o serviço `db` pelo
    nome (não por IP fixo), montada a partir das mesmas credenciais do
    `.env`.
  - `CORS_ORIGINS` — lista de origens permitidas (o endereço onde o
    `frontend` roda), conforme já registrado como pendente em
    `visao-geral.md` (seção 7).
  - `API_ENV` — algo como `development` / `production`, usado pelo próprio
    FastAPI para decidir comportamento (ex: expor ou não a documentação
    automática do Swagger).
- **Porta exposta:** `8000`.
- **Depende de:** `db`, com a condição de que o healthcheck do banco tenha
  passado (`condition: service_healthy`), não apenas que o container tenha
  iniciado.
- **Migrações do banco (Alembic) — decidido em 2026-08-09:** rodam num
  serviço `migrate` separado, não no `entrypoint`/`CMD` do próprio
  `backend`. Esse serviço usa a mesma imagem do `backend` (mesmo
  `Dockerfile`, em `backend/`), mas sobrescreve o comando para `alembic
  upgrade head && python -m app.seed_items` — nessa ordem, porque as
  colunas geradas `diferenca`/`status` (`docs/banco-de-dados.md`) só
  existem de fato via `sa.Computed(...)` depois da migração; se o seed
  rodasse antes, o banco ficaria sem essas colunas geradas corretamente. O
  `migrate` roda uma única vez e sai (`restart: "no"`); o `backend` só sobe
  depois, com `depends_on: migrate: condition: service_completed_successfully`
  (além de continuar dependendo de `db: condition: service_healthy`).
  Motivo de ser um serviço à parte, em vez de rodar no `entrypoint` do
  `backend`: isola uma falha de migração de uma falha de subida da API —
  se o `alembic upgrade head` falhar, o `backend` nunca chega a subir com
  um schema incompleto, em vez de subir "quebrado" e falhar só na primeira
  query. Isso também resolve, de graça, o problema de `docker compose up`
  do zero subir com o banco vazio (antes, migração e seed precisavam ser
  rodados à mão depois do primeiro `up`).
- **Número de workers do Uvicorn — decidido em 2026-08-09:** `5` em
  produção, dimensionado para até 5 usuários simultâneos (a pessoa, o
  colega de setor e a supervisora usariam o sistema hoje — sem
  autenticação ainda —, mais uma folga). Definido só em
  `docker-compose.prod.yml` (`command: uvicorn ... --workers 5`), não no
  `CMD` do `Dockerfile`, que continua com 1 worker (padrão adequado para
  dev). Se o número de usuários simultâneos crescer no futuro, é só
  ajustar esse valor.

---

## 4. Serviço `frontend` (React)

Esse serviço se comporta de dois jeitos bem diferentes dependendo do
ambiente, e o `Dockerfile` precisa refletir isso:

- **Em desenvolvimento:** roda o servidor de desenvolvimento do Vite (ou
  equivalente), com *hot reload* — o container fica "vivo", reagindo a
  mudanças no código sem precisar reconstruir a imagem a cada alteração.
  Isso é o que o `docker-compose.override.yml` (seção 7) deve configurar.
- **Em produção:** o React não roda como um servidor de verdade — ele é
  **compilado** (`npm run build`) para um punhado de arquivos estáticos
  (HTML/CSS/JS), servidos por **Caddy** (decidido em 2026-08-09 — ver
  `docs/preparativos-vps.md`, seção 7).

Por isso, o `Dockerfile` do frontend é **multi-stage**: um estágio que
instala dependências e builda o projeto, e outro (só usado em produção)
que copia o resultado do build para uma imagem final mínima, baseada em
Caddy (`caddy:2-alpine`), sem o Node.js e as dependências de
desenvolvimento presentes na imagem final. O Caddy, além de servir os
arquivos estáticos, também faz proxy reverso de `/api/*` para o `backend`
(pelo nome do serviço, rede interna do Docker) e cuida do certificado
HTTPS automaticamente via Let's Encrypt quando a variável `DOMAIN` está
preenchida no `.env` — sem `DOMAIN`, serve HTTP puro na porta `80`. Config
em `frontend/Caddyfile`.

Como o frontend passa a ser o único ponto de entrada externo, o `backend`
e o `db` **não publicam mais porta nenhuma no host em produção**
(`docker-compose.prod.yml` zera `ports` dos dois com `!override []`) — só
são alcançáveis pela rede interna do Compose, coerente com o que a seção 3
de `docs/preparativos-vps.md` já exigia do firewall.

---

## 5. Observação importante — Compose não é a mesma coisa em toda hospedagem

Vale registrar isso agora para não gerar confusão mais tarde: o Compose
descrito neste documento é pensado para **desenvolvimento local** e para
**hospedagem em VPS própria** (opção "c" que já foi discutida em conversa
anterior sobre hospedagem). Plataformas gerenciadas como Render ou Railway
**não leem o `docker-compose.yml` diretamente** — cada uma tem seu próprio
jeito de receber a aplicação (um `Dockerfile` por serviço, ou até
detecção automática do framework, sem Docker nenhum). Se a decisão final de
hospedagem for uma dessas plataformas gerenciadas, o Compose continua útil
**só para o ambiente local** de desenvolvimento — não seria o que roda em
produção nesse cenário.

---

## 6. Variáveis de ambiente e arquivo `.env`

Nenhuma credencial deve existir escrita diretamente no
`docker-compose.yml`. Um arquivo `.env` (fora do controle de versão) fica
na raiz do projeto, e um `.env.example` (esse sim versionado) documenta
quais variáveis existem, sem valores reais:

```
# .env.example
POSTGRES_USER=
POSTGRES_PASSWORD=
POSTGRES_DB=
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
CORS_ORIGINS=http://localhost:5173
API_ENV=development
```

---

## 7. Ambientes diferentes: `docker-compose.yml` + `override`

Em vez de manter dois arquivos completos e parecidos (um pra dev, outro pra
produção), o padrão recomendado é:

- **`docker-compose.yml`** — a base, com o que é comum aos dois ambientes
  (os três serviços, a rede, os volumes).
- **`docker-compose.override.yml`** — carregado **automaticamente** junto
  com o base quando você roda só `docker compose up`, sem precisar
  especificar nada. Nele entram os ajustes específicos de desenvolvimento:
  montar o código-fonte como volume (pra o hot reload funcionar), rodar o
  frontend no modo Vite em vez do build de produção, expor portas extras
  úteis só em dev.
- **`docker-compose.prod.yml`** — decidido em 2026-08-09: um terceiro
  arquivo explícito para produção, carregado só quando pedido
  (`docker compose -f docker-compose.yml -f docker-compose.prod.yml up`),
  nunca automaticamente. Nele entram os ajustes específicos de produção
  que não fazem sentido como padrão em dev: `restart: unless-stopped` em
  `db`/`backend`/`frontend` (em dev, um container que morre geralmente
  significa um bug que você quer *ver*, não um restart automático
  escondendo o problema), `API_ENV=production` e o número de workers do
  Uvicorn (seção 3).
  Motivo de ser um arquivo à parte, em vez de só rodar `docker compose -f
  docker-compose.yml up` ignorando o override: a base já é seguro o
  suficiente para subir sozinha (porta 80 via Nginx, sem bind mount de
  código), mas alguns ajustes só fazem sentido em produção de verdade —
  `restart: unless-stopped`, por exemplo, esconderia um container
  reiniciando sozinho durante o desenvolvimento, quando o comportamento
  desejado é o container morrer visivelmente para o bug aparecer. Manter
  esses ajustes só na base misturaria comportamento de produção com o de
  dev; manter só no override os deixaria fora do alcance da base sozinha.
  Um arquivo nomeado explicitamente `.prod.yml`, carregado só por escolha
  deliberada (`-f docker-compose.prod.yml`), documenta a intenção no
  próprio comando de deploy — quem lê o script de subida em produção vê
  exatamente quais arquivos foram usados.

---

## 8. Pontos em aberto para quem for implementar

- ~~Onde as migrações do Alembic rodam~~ — **resolvido em 2026-08-09**, ver
  seção 3: serviço `migrate` separado, com `backend` dependendo dele.
- ~~Formato exato do arquivo de produção~~ — **resolvido em 2026-08-09**,
  ver seção 7: `docker-compose.prod.yml` explícito.
- ~~Onde os backups do volume do Postgres são guardados, e com que
  frequência~~ — **parcialmente resolvido em 2026-08-09**, ver seção 2.1:
  diário, retenção de 7 dias, disco local (volume `backup_data`). **Ainda
  em aberto:** se/quando adicionar cópia externa (S3/Backblaze/outro
  servidor) — só decidido junto com a hospedagem final.
- **Se o `frontend` continua existindo como serviço Docker em produção**,
  ou se — no caso de hospedagem gerenciada tipo Vercel/Netlify (opção "b"
  já discutida) — ele simplesmente deixa de fazer parte do Compose de
  produção, ficando só no Compose de desenvolvimento.

---

## 9. Comandos esperados (para referência de quem for usar, depois de pronto)

```bash
docker compose up              # dev: sobe tudo (usa .yml + override automaticamente)
docker compose up -d           # dev, em segundo plano
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
                                # produção: ignora o override, aplica os ajustes de prod
docker compose down            # derruba tudo (mantém os volumes)
docker compose down -v         # derruba tudo E apaga os volumes (cuidado: apaga o banco)
docker compose logs -f backend # acompanha só os logs do backend
docker compose build           # reconstrói as imagens depois de mudanças nos Dockerfiles
```

Com este documento, mais `visao-geral.md` (estrutura de pastas e stack) e
`document-rest-API.md` (o que o `backend` precisa expor), quem for montar o
ambiente Docker do zero tem todas as decisões de arquitetura já tomadas —
falta só escrever os arquivos.
