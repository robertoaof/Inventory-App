# Banco de Dados — Sistema de Inventário de Óleo e Peças (Scania)

Documentação da estrutura de banco de dados em PostgreSQL para substituir o
armazenamento atual (chave-valor via `window.storage`, dentro do navegador)
por um banco relacional de verdade.

---

## 0. Antes das tabelas: uma mudança importante de arquitetura

Hoje o sistema é **um único arquivo HTML** que salva tudo sozinho, direto do
navegador, usando o armazenamento de chave-valor do Claude (`window.storage`).
Isso funciona sem precisar de servidor.

PostgreSQL **não pode ser acessado diretamente pelo navegador** por segurança
— não existe "abrir uma conexão com o banco" a partir de JavaScript rodando
na página. Isso significa que, a partir do momento em que decidirmos usar
Postgres de verdade, o sistema deixa de ser "só um arquivo HTML" e passa a
precisar de:

1. Um **servidor/API** — já definimos que será em **FastAPI** (Python) —
   que recebe os pedidos do frontend em React ("salvar contagem do dia",
   "me dê o histórico de tal mês") e conversa com o Postgres.
2. Um lugar para **hospedar** esse servidor e o banco (pode ser bem simples e
   barato, mas precisa existir — deixa de rodar só "abrindo o arquivo").

Os detalhes de como o frontend (React) e o backend (FastAPI) se encaixam com
essas tabelas estão no arquivo `visao-geral.md`. Não precisa decidir isso
agora — é só um ponto que quero deixar registrado aqui, porque muda a forma
como o projeto vai ser implantado no dia a dia.
As tabelas abaixo já são desenhadas pensando nesse próximo estágio.

---

## 1. Visão geral das tabelas

```
itens                 (catálogo de tudo que já foi visto: óleos, graxas e peças)
   │
   │ 1
   │
   │ N
inventario_itens ───── N : 1 ── inventarios   (um registro por dia)
   │
   │ N : 1
   │
importacoes_xml ──── N : 1 ── inventarios
   │
   │ 1 : N (opcional)
importacoes_xml_itens
```

Quatro tabelas principais (`itens`, `inventarios`, `inventario_itens`,
`importacoes_xml`) e uma opcional para auditoria fina
(`importacoes_xml_itens`). Nada de tabelas separadas para "óleos" e "peças" —
explico o porquê logo abaixo.

---

## 2. Tabela `itens`

Catálogo único de tudo que o sistema já conhece: os 9 óleos e 2 graxas fixos,
e qualquer peça que já apareceu em algum XML importado.

```sql
CREATE TABLE itens (
    id                          BIGSERIAL PRIMARY KEY,
    codigo                      VARCHAR(20)  NOT NULL UNIQUE,
    descricao                   VARCHAR(255) NOT NULL,
    unidade                     VARCHAR(10),
    categoria                   VARCHAR(10)  NOT NULL DEFAULT 'peca'
                                CHECK (categoria IN ('oleo', 'graxa', 'peca')),
    possui_quebra_estoque_oficina BOOLEAN     NOT NULL DEFAULT FALSE,
    localizacao_padrao         VARCHAR(50),
    ativo                       BOOLEAN      NOT NULL DEFAULT TRUE,
    criado_em                   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    atualizado_em               TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_itens_categoria ON itens (categoria);
```

**Por que uma tabela só, e não `oleos` + `pecas` separadas?**
Porque, na prática, um óleo, uma graxa e uma peça guardam exatamente os
mesmos tipos de informação (código, descrição, unidade). O que muda é só
*onde aparecem na tela* e *se têm a quebra estoque/oficina*. Resolvo isso com
a coluna `categoria` e a flag `possui_quebra_estoque_oficina`, em vez de
duplicar a estrutura em duas tabelas. Isso também deixa a consulta "todo item
que já vimos alguma vez, e como ele se comportou ao longo do tempo" muito
mais simples — um único `JOIN`, não uma junção de duas tabelas parecidas.

**Coluna por coluna:**

- `codigo` — é a **chave de negócio** (a mesma usada para casar com o XML,
  no atributo `Coluna6`). `UNIQUE` porque é assim que evitamos duplicar um
  item que já existe.
- `categoria` — decide em qual aba o item aparece: `oleo`/`graxa` → aba
  Contagem; `peca` → aba Inventários. Usei `VARCHAR` + `CHECK` em vez de um
  `ENUM` nativo do Postgres de propósito: se um dia você quiser adicionar uma
  quarta categoria, um `CHECK` se altera com um `ALTER TABLE` simples; um
  `ENUM` do Postgres exige um comando à parte e mais cuidado.
- `possui_quebra_estoque_oficina` — só é `TRUE` para os 9 óleos que têm a
  divisão em "tambores/contêineres" + "bombas da oficina". Graxas e peças
  ficam `FALSE` (têm um valor físico único). Isso preserva a regra de
  negócio que já existe no HTML atual.
- `ativo` — em vez de apagar um item que a Scania parou de vender, ele é
  marcado como inativo. **Justificativa:** se apagássemos a linha, todo o
  histórico de inventários que referenciava aquele item seria perdido (ou
  quebraria a referência). Com `ativo = false`, o item some das telas de
  lançamento mas o histórico continua intacto.
- `localizacao_padrao` — a última localização conhecida no estoque (vinda do
  `Coluna1` do XML). É só informativo, não entra em nenhum cálculo.

---

## 3. Tabela `inventarios`

Representa **um dia** de inventário — o equivalente a uma linha na aba
"Histórico" de hoje.

```sql
CREATE TABLE inventarios (
    id               BIGSERIAL PRIMARY KEY,
    data             DATE        NOT NULL UNIQUE,
    status           VARCHAR(10) NOT NULL DEFAULT 'rascunho'
                      CHECK (status IN ('rascunho', 'fechado')),
    fechado_em       TIMESTAMPTZ,
    observacao_geral TEXT,
    criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- `data UNIQUE` — reflete exatamente a regra que você já pediu: só existe
  **um** inventário por data. Isso empurra pro próprio banco a mesma
  trava que hoje é feita "na mão" pelo aviso de "já existe uma contagem
  salva, deseja substituir?" — o banco nunca deixaria existir duas linhas
  com a mesma data, mesmo que a aplicação tivesse algum bug.
- `observacao_geral` — não existe no app ainda; é uma sugestão minha, um
  campo livre pra anotações do dia inteiro (ex: "faltou conferir o
  contêiner 2, sem acesso"). Fica de fora se você não quiser usar.
- `status` e `fechado_em` — resolvem o ponto que tinha ficado em aberto na
  seção 7 (versão anterior deste documento): decidimos que o rascunho
  **também** vai para o banco (Opção B), então a mesma linha nasce como
  `rascunho` (na primeira alteração do dia) e depois vira `fechado` quando
  o usuário aperta "Salvar contagem do dia" — sem precisar de uma tabela
  separada para rascunhos. O detalhamento completo dessa decisão está em
  `rascunho-inventario.md`.

---

## 4. Tabela `inventario_itens`

O coração do sistema: quanto tinha de cada item, em cada dia.

```sql
CREATE TABLE inventario_itens (
    id                  BIGSERIAL PRIMARY KEY,
    inventario_id       BIGINT NOT NULL REFERENCES inventarios(id) ON DELETE CASCADE,
    item_id             BIGINT NOT NULL REFERENCES itens(id),
    quantidade_estoque  INTEGER,
    quantidade_oficina  INTEGER,
    quantidade_fisica   INTEGER NOT NULL DEFAULT 0,
    quantidade_sistema  INTEGER NOT NULL DEFAULT 0,
    diferenca           INTEGER GENERATED ALWAYS AS (quantidade_fisica - quantidade_sistema) STORED,
    status              VARCHAR(10) GENERATED ALWAYS AS (
                            CASE
                                WHEN quantidade_fisica - quantidade_sistema = 0 THEN 'correto'
                                WHEN quantidade_fisica - quantidade_sistema > 0 THEN 'sobra'
                                ELSE 'falta'
                            END
                        ) STORED,
    observacao          TEXT,
    criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (inventario_id, item_id)
);

CREATE INDEX idx_inventario_itens_inventario ON inventario_itens (inventario_id);
CREATE INDEX idx_inventario_itens_item       ON inventario_itens (item_id);
CREATE INDEX idx_inventario_itens_status     ON inventario_itens (status) WHERE status <> 'correto';
```

- `UNIQUE (inventario_id, item_id)` — é a trava que garante, **no banco**, a
  regra que você pediu lá no início: um item não pode aparecer duas vezes no
  mesmo dia. Continua sendo responsabilidade da aplicação decidir se
  atualiza ou soma quando reimporta o XML, mas o banco impede a duplicação
  acidental de qualquer forma.
- `quantidade_estoque` / `quantidade_oficina` — ficam `NULL` para tudo que
  não tem a quebra (graxas e peças). Só os 9 óleos usam essas duas colunas.
- `quantidade_fisica` — o total físico. Decidi **não** calculá-la
  automaticamente a partir de `quantidade_estoque + quantidade_oficina`,
  porque isso só vale pros óleos com quebra — pra graxas e peças, o valor
  físico é digitado direto, sem quebra nenhuma. Deixar o valor final vir
  pronto da aplicação (que já sabe fazer essa conta, como já faz hoje em
  JavaScript) é mais simples do que ensinar o banco a fazer essa conta
  condicional.
- `diferenca` e `status` como **colunas geradas** (`GENERATED ALWAYS AS ...
  STORED`) — isso é diferente de calcular no JavaScript: aqui, o próprio
  Postgres garante que a diferença e o status **nunca fiquem
  desatualizados** em relação aos valores físico/sistema, e ainda permite
  fazer perguntas direto em SQL, tipo:
  ```sql
  SELECT * FROM inventario_itens WHERE status = 'falta';
  ```
  sem precisar recalcular nada em código. O índice parcial
  `idx_inventario_itens_status` deixa esse tipo de busca ("me mostra só o
  que está errado") rápida mesmo com anos de histórico acumulado.
- Índice em `item_id` — permite consultas do tipo "como o LDF4 se comportou
  nos últimos 6 meses?" cruzando com `inventarios.data`. Isso é uma
  possibilidade nova que a estrutura em JSON de hoje não permite sem reler
  todo o histórico manualmente.

---

## 5. Tabela `importacoes_xml`

Registro de cada vez que um arquivo XML foi importado — o "log" da
importação, servindo de auditoria.

```sql
CREATE TABLE importacoes_xml (
    id                              BIGSERIAL PRIMARY KEY,
    inventario_id                   BIGINT NOT NULL REFERENCES inventarios(id) ON DELETE CASCADE,
    nome_arquivo                    VARCHAR(255) NOT NULL,
    importado_em                    TIMESTAMPTZ NOT NULL DEFAULT now(),
    itens_conhecidos_atualizados    INTEGER NOT NULL DEFAULT 0,
    itens_novos                     INTEGER NOT NULL DEFAULT 0,
    itens_atualizados               INTEGER NOT NULL DEFAULT 0,
    codigos_duplicados              TEXT[],
    conteudo_arquivo                TEXT
);

CREATE INDEX idx_importacoes_xml_inventario ON importacoes_xml (inventario_id);
```

- Por que guardar isso, já que o resultado final já está em
  `inventario_itens`? Porque hoje, se você importar o XML três vezes no
  mesmo dia (ex: esqueceu um item, gerou de novo), o sistema mescla tudo em
  cima do mesmo registro — e depois não dá pra saber quantas vezes isso
  aconteceu, nem o que mudou em cada importação. Essa tabela guarda **o
  histórico das próprias importações**, não só o resultado final.
- `codigos_duplicados` como **array nativo do Postgres** (`TEXT[]`) — pra um
  detalhe pequeno como "quais códigos vieram repetidos nesse arquivo", criar
  uma tabela separada seria exagero. Um array resolve sem complicar o
  desenho.
- `conteudo_arquivo` — guardar o XML inteiro é opcional (ocupa espaço). A
  vantagem: se um dia houver uma dúvida tipo "o sistema disse que tínhamos
  164 litros de tal óleo, mas isso está errado — o problema foi na
  importação ou o dado já veio errado do sistema da Scania?", dá pra
  conferir o arquivo original exatamente como foi lido, sem depender da
  memória de ninguém. Se preferir não guardar (por espaço em disco), é só
  tirar essa coluna.

---

## 6. Tabela opcional `importacoes_xml_itens`

Auditoria linha a linha — o que exatamente veio em cada arquivo, item por
item, antes de qualquer mesclagem.

```sql
CREATE TABLE importacoes_xml_itens (
    id                        BIGSERIAL PRIMARY KEY,
    importacao_id             BIGINT NOT NULL REFERENCES importacoes_xml(id) ON DELETE CASCADE,
    codigo                    VARCHAR(20) NOT NULL,
    descricao                 VARCHAR(255),
    unidade                   VARCHAR(10),
    localizacao               VARCHAR(50),
    quantidade_sistema        INTEGER,
    reconhecido_como_catalogo BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_importacoes_xml_itens_importacao ON importacoes_xml_itens (importacao_id);
```

Marquei como **opcional** porque é um nível de detalhe a mais do que o
necessário pra o sistema funcionar — é útil se um dia você quiser investigar
"o que exatamente esse arquivo trouxe, linha por linha", mas para o
funcionamento do dia a dia a tabela `importacoes_xml` (o resumo) já é
suficiente. Posso deixar de fora da primeira versão e adicionar depois, sem
quebrar nada do resto.

---

## 7. Pontos em aberto (preciso da sua decisão mais pra frente)

1. ~~Rascunho também vai para o banco?~~ **Resolvido:** sim (Opção B) — ver
   `rascunho-inventario.md` para o detalhamento completo de como isso
   funciona com as colunas `status`/`fechado_em` adicionadas na tabela
   `inventarios`.
2. **Múltiplos usuários.** O desenho acima ainda não tem conceito de
   "quem" fez a contagem. Se um dia mais de uma pessoa for lançar dados,
   vale adicionar uma tabela `usuarios` e uma coluna `usuario_id` em
   `inventarios` e/ou `inventario_itens`. Não incluí isso agora para não
   complicar sem necessidade.
3. **Particionamento por data.** Com anos de uso diário, a tabela
   `inventario_itens` cresce rápido (uma linha por item por dia). Postgres
   aguenta tranquilamente milhões de linhas sem problema nenhum — isso só
   viraria pauta daqui a muitos anos de uso, então não é algo para
   resolver agora, só deixo registrado.

---

## 8. Exemplos de consultas que essa estrutura passa a permitir

```sql
-- Itens da aba "Contagem" (óleos e graxas ativos)
SELECT * FROM itens WHERE categoria IN ('oleo', 'graxa') AND ativo;

-- Inventário completo de um dia específico
SELECT it.codigo, it.descricao, ii.quantidade_fisica, ii.quantidade_sistema, ii.status
FROM inventario_itens ii
JOIN itens it ON it.id = ii.item_id
JOIN inventarios inv ON inv.id = ii.inventario_id
WHERE inv.data = '2026-07-16';

-- Resumo (quantos faltando/sobrando/corretos) de cada dia salvo
SELECT inv.data, ii.status, COUNT(*)
FROM inventario_itens ii
JOIN inventarios inv ON inv.id = ii.inventario_id
GROUP BY inv.data, ii.status
ORDER BY inv.data DESC;

-- Histórico de um item específico ao longo do tempo (ex: E7)
SELECT inv.data, ii.quantidade_fisica, ii.quantidade_sistema, ii.diferenca
FROM inventario_itens ii
JOIN inventarios inv ON inv.id = ii.inventario_id
JOIN itens it ON it.id = ii.item_id
WHERE it.codigo = '45-3247280'
ORDER BY inv.data;
```

---

## 9. Resumo das justificativas principais

| Decisão | Por quê |
|---|---|
| Uma tabela `itens` só, com `categoria` | Óleo, graxa e peça têm a mesma forma; separar em tabelas duplicaria estrutura à toa |
| `codigo` único em `itens` | É a chave real de negócio, é o que casa com o XML |
| `ativo` em vez de apagar item | Preserva histórico de inventários antigos |
| `data` única em `inventarios` | Só pode existir um inventário fechado por dia — regra vinda do próprio app |
| `diferenca`/`status` como colunas geradas | Postgres garante consistência automática e permite filtrar direto em SQL |
| `UNIQUE (inventario_id, item_id)` | Impede duplicar um item no mesmo dia, reforçando no banco a regra que já existe na aplicação |
| Tabela própria para importações de XML | Sem ela, perde-se o histórico de quantas vezes e o que mudou a cada reimportação no mesmo dia |
