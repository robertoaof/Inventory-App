# Rascunho do Inventário — Persistência no Backend (Opção B)

Este documento detalha a decisão tomada no ponto 8 do `visao-geral.md`:
o rascunho do dia (o que está sendo digitado antes de "Salvar a contagem do
dia") vai ser persistido no backend/banco desde o início, em vez de viver só
na memória do navegador. Isso também resolve o ponto em aberto nº 1 do
`banco-de-dados.md`.

---

## 1. O que muda em relação a só guardar localmente

Na opção descartada (rascunho só no React), se a pessoa fechasse a aba ou o
computador travasse antes de clicar em "Salvar contagem do dia", o que
tinha sido digitado seria perdido. Na opção B, cada alteração é enviada ao
backend (com um pequeno atraso, para não gerar uma chamada a cada tecla) e
gravada no banco imediatamente — então não existe, na prática, "trabalho não
salvo": existe só "trabalho ainda não fechado".

## 2. Ideia central: rascunho e contagem fechada são a mesma linha

Em vez de ter uma tabela separada para rascunhos, a tabela `inventarios`
(já definida em `banco-de-dados.md`) ganha uma coluna de status:

```sql
ALTER TABLE inventarios
    ADD COLUMN status      VARCHAR(10) NOT NULL DEFAULT 'rascunho'
                            CHECK (status IN ('rascunho', 'fechado')),
    ADD COLUMN fechado_em  TIMESTAMPTZ;
```

- `status = 'rascunho'` — o dia está sendo preenchido, ainda não foi
  confirmado.
- `status = 'fechado'` — o usuário clicou em "Salvar contagem do dia".
- `fechado_em` — quando o dia passou de rascunho para fechado pela primeira
  vez. Fica `NULL` enquanto ainda é rascunho.

**Por que não usar duas tabelas (uma para rascunho, outra para fechado)?**
Porque o rascunho de hoje é exatamente o que vira a contagem fechada de
hoje — é a mesma informação, só num estágio diferente. Ter duas tabelas
significaria mover os dados de uma para a outra na hora de fechar, com risco
de inconsistência no meio do caminho. Com uma coluna de status, "fechar o
dia" é só um `UPDATE status = 'fechado'` — os itens já lançados continuam
exatamente onde estavam.

## 3. Como a linha de `inventarios` nasce

Diferente de antes (onde a linha só existia depois de "salvar"), agora a
linha nasce **na primeira alteração que o usuário faz naquele dia** — não
quando a página é apenas aberta. Ou seja:

1. Usuário abre o sistema, no dia 17/07/2026, e ainda não existe nenhuma
   linha em `inventarios` com essa data.
2. Usuário digita a primeira quantidade física de um óleo.
3. O backend recebe essa alteração e faz um "cria se não existir" (`INSERT
   ... ON CONFLICT (data) DO NOTHING`) na tabela `inventarios` com
   `status = 'rascunho'`, e só então grava o valor em `inventario_itens`.

Isso evita acumular linhas vazias em `inventarios` para dias em que o
usuário só abriu o sistema e não fez nada.

### 3.1 Semeando a quantidade de sistema (continuidade entre dias — RN27)

Uma consequência importante do passo 3 acima, que só ficou clara depois de
usar o protótipo no dia a dia: quando a linha de `inventario_itens` nasce
para um óleo/graxa pela primeira vez num novo dia, ela **não deve nascer
com `quantidade_sistema = 0`**. Ela deve nascer com o último valor de
sistema conhecido daquele item — vindo do inventário fechado mais recente
que o contém.

Ou seja, o "cria se não existir" do passo 3 passa a ser, para os itens do
catálogo fixo de óleos/graxas:

```sql
INSERT INTO inventario_itens (inventario_id, item_id, quantidade_sistema, quantidade_fisica)
SELECT :novo_inventario_id, i.id,
       COALESCE(ultimo.quantidade_sistema, 0),
       0
FROM itens i
LEFT JOIN LATERAL (
    SELECT ii.quantidade_sistema
    FROM inventario_itens ii
    JOIN inventarios inv ON inv.id = ii.inventario_id
    WHERE ii.item_id = i.id AND inv.status = 'fechado'
    ORDER BY inv.data DESC
    LIMIT 1
) ultimo ON true
WHERE i.categoria IN ('oleo', 'graxa')
ON CONFLICT (inventario_id, item_id) DO NOTHING;
```

A quantidade física continua sempre nascendo em `0` — só a de sistema
herda o último valor fechado. Isso resolve o problema visto no protótipo,
onde abrir o sistema num novo dia sem nenhum XML ainda importado mostrava
todos os óleos com sistema zerado, mesmo os que não tiveram nenhum
movimento. Itens da categoria `peca` **não** entram nessa regra — eles só
existem no inventário do dia a partir de uma importação de XML (RN12), não
antes disso.

## 4. Autosave: como o React envia as alterações

O comportamento visto no protótipo (`contagem_oleo.html`) já seguia esse
princípio e deve continuar: esperar a pessoa parar de digitar por um
instante antes de enviar (chamado de *debounce*), em vez de mandar uma
requisição a cada letra digitada.

Um ponto importante a levar para a implementação: **agrupar o que for
enviado**. Em vez de uma requisição HTTP por campo alterado (uma para
quantidade física, outra para quantidade de sistema, outra para a
observação), o React deve juntar as mudanças recentes e mandar o item
inteiro numa única chamada. Isso reduz bastante o número de requisições em
uma tela com muitos itens sendo editados (a aba Inventários pode ter
dezenas deles).

Fluxo sugerido:
```
Usuário digita → debounce (± 500ms, igual ao protótipo) → 
PATCH /inventarios/{data}/itens/{item_id} com o item completo →
backend grava em inventario_itens (cria a linha de inventarios se preciso)
```

Se a chamada falhar (sem internet, backend fora do ar), o frontend deve
avisar (o mesmo tipo de aviso "não foi possível salvar" que já existe no
protótipo) — e o valor digitado continua visível na tela, para tentar de
novo, mesmo que ainda não tenha sido persistido.

## 5. O botão "Salvar contagem do dia"

Continua existindo — mas agora, em vez de criar o registro do zero, ele só
muda o status da linha que já existe:

```sql
UPDATE inventarios
SET status = 'fechado',
    fechado_em = COALESCE(fechado_em, now())
WHERE data = :data;
```

O `COALESCE` preserva o horário do **primeiro** fechamento, mesmo que o
usuário reabra e salve de novo depois (edição de um dia já fechado, como já
acontece na aba Histórico) — assim fica registrado quando o dia foi
fechado a primeira vez, sem perder esse dado em reedições futuras.

A confirmação "já existe uma contagem salva para essa data, deseja
substituir?" muda de sentido: antes ela existia para evitar sobrescrever um
registro inteiro sem querer; agora, como o rascunho já é gravado o tempo
todo, a pergunta passa a ser mais "confirma que quer fechar esse dia?" —
principalmente relevante quando o dia **já estava fechado** e o usuário quer
reabrir e alterar algo.

## 6. O que acontece com "Nova contagem"

Duas situações diferentes:

- **Usuário troca a data** para um dia ainda não existente: nada precisa
  ser apagado — uma nova linha em `inventarios` nasce naturalmente na
  primeira edição daquele novo dia (seção 3).
- **Usuário quer limpar os dados do dia atual** (mesma data, mas quer
  recomeçar): o backend apaga as linhas de `inventario_itens` daquele
  `inventario_id` (`DELETE FROM inventario_itens WHERE inventario_id = ...`),
  mantendo a linha de `inventarios` (que continua em `rascunho`, ou volta a
  ficar sem itens se já estava fechada — nesse caso, cabe decidir se isso
  deveria exigir uma confirmação extra, já que estaria apagando dados de um
  dia já fechado).

## 7. Dias com rascunho esquecido (nunca fechados)

Como cada data gera sua própria linha, é possível que um dia fique parado
em `status = 'rascunho'` para sempre, se o usuário começou a digitar mas
nunca clicou em salvar. Isso não quebra nada — mas é uma oportunidade de
melhoria de tela (não obrigatória agora): a aba Histórico poderia mostrar
também os dias com rascunho em aberto, com um indicador visual diferente
("rascunho, não fechado") para o usuário lembrar de finalizá-los.

## 8. Resumo da decisão

| Pergunta | Resposta |
|---|---|
| Onde mora o rascunho? | Nas mesmas tabelas `inventarios` / `inventario_itens`, com `status = 'rascunho'` |
| Quando a linha de `inventarios` é criada? | Na primeira alteração do dia, não ao só abrir a tela |
| Como funciona o autosave? | Debounce no React (± 500ms) + uma chamada por item alterado, não por campo |
| O que muda ao clicar "Salvar contagem do dia"? | Um `UPDATE` de status, não a criação de um novo registro |
| E se a internet cair no meio de uma edição? | O frontend avisa que não conseguiu salvar; o valor digitado continua visível para nova tentativa |
