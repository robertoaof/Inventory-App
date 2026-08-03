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
| `backend` | API (FastAPI) | `Dockerfile` próprio, em `backend/` | `8000` |
| `frontend` | Interface (React) | `Dockerfile` próprio, em `frontend/` | `5173` (dev) / `80` (produção) |

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
- **Migrações do banco (Alembic):** este documento não define ainda se as
  migrações rodam automaticamente na subida do container (`entrypoint` que
  roda `alembic upgrade head` antes de iniciar o servidor) ou como um passo
  manual/separado — ver ponto em aberto na seção 8.

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
  (HTML/CSS/JS), que depois são servidos por algo simples como Nginx (ou
  nem por container nenhum — ver observação importante na seção 5).

Por isso, o `Dockerfile` do frontend deve ser **multi-stage**: um estágio
que instala dependências e builda o projeto, e outro (só usado em produção)
que copia o resultado do build para uma imagem final mínima, baseada em
Nginx, sem o Node.js e as dependências de desenvolvimento presentes na
imagem final.

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

Para produção, a prática comum é rodar com `docker compose -f
docker-compose.yml up` (ignorando o override), ou manter um terceiro
arquivo `docker-compose.prod.yml` explícito — a decisão entre essas duas
formas fica registrada como ponto em aberto (seção 8).

---

## 8. Pontos em aberto para quem for implementar

- **Onde as migrações do Alembic rodam** — automaticamente na subida do
  `backend`, ou como um comando manual/`job` separado. Rodar
  automaticamente é mais conveniente no dia a dia, mas mais arriscado em
  produção (uma migração com problema derruba a subida do serviço todo).
- **Formato exato do arquivo de produção** — `docker-compose.prod.yml`
  separado, ou só rodar o `docker-compose.yml` base ignorando o override.
- **Onde os backups do volume do Postgres são guardados**, e com que
  frequência — não é escopo deste documento (é operação, não arquitetura),
  mas precisa de uma resposta antes de qualquer ambiente ir pra produção de
  verdade.
- **Se o `frontend` continua existindo como serviço Docker em produção**,
  ou se — no caso de hospedagem gerenciada tipo Vercel/Netlify (opção "b"
  já discutida) — ele simplesmente deixa de fazer parte do Compose de
  produção, ficando só no Compose de desenvolvimento.

---

## 9. Comandos esperados (para referência de quem for usar, depois de pronto)

```bash
docker compose up              # sobe tudo (usa .yml + override automaticamente)
docker compose up -d           # mesma coisa, em segundo plano
docker compose down            # derruba tudo (mantém os volumes)
docker compose down -v         # derruba tudo E apaga os volumes (cuidado: apaga o banco)
docker compose logs -f backend # acompanha só os logs do backend
docker compose build           # reconstrói as imagens depois de mudanças nos Dockerfiles
```

Com este documento, mais `visao-geral.md` (estrutura de pastas e stack) e
`document-rest-API.md` (o que o `backend` precisa expor), quem for montar o
ambiente Docker do zero tem todas as decisões de arquitetura já tomadas —
falta só escrever os arquivos.
