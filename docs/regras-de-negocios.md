# Regras de Negócio — Sistema de Inventário de Óleo e Peças (Scania)

Este documento reúne, em um só lugar e com o detalhe necessário, a lógica de
negócio do sistema — coisas como "o que exatamente conta como duplicado",
"o que acontece passo a passo ao reimportar um XML", "quando um inventário
nasce e quando ele é considerado fechado". O `requisitos.md` já lista essas
regras de forma resumida (uma frase por item, com código RF/RNF); aqui elas
são detalhadas o suficiente para não sobrar dúvida na hora de programar.

Cada regra recebe um código **RN** (Regra de Negócio), e referencia o
requisito equivalente em `requisitos.md` quando existir um.

---

## 0. Sobre os exemplos usados como ponto de partida

Dois dos quatro exemplos que você trouxe não bateram com decisões já
tomadas antes neste projeto, e foram esclarecidos antes de eu escrever este
documento:

- **"Inventário não pode ser editado após finalizado"** — não foi adotada
  dessa forma. Ficou confirmado que um inventário fechado **pode** ser
  reaberto e corrigido (ver RN19), como já previa o RF21 e o
  `rascunho-inventario.md`.
- **"Um XML não pode ser importado duas vezes"** — não foi adotada dessa
  forma. Ficou confirmado que reimportar o mesmo XML no mesmo dia continua
  permitido, mesclando os dados (ver RN13), como já previa o RF11. Vale
  registrar que isso não significa risco de duplicação: o merge é
  desenhado para ser seguro mesmo se o mesmo arquivo for importado várias
  vezes (RN13 detalha o porquê).

Os outros dois exemplos batem exatamente com o que já estava implementado
no protótipo e foram incorporados como estão: **Diferença = Físico −
Sistema** (RN01) e **status calculado automaticamente** (RN02).

---

## 1. Cálculo de diferença e status

### RN01 — Fórmula da diferença
```
Diferença = Quantidade Física − Quantidade de Sistema
```
Aplica-se da mesma forma a óleos, graxas e peças — não existe uma fórmula
diferente por categoria de item.

### RN02 — Classificação automática do status
| Condição | Status |
|---|---|
| Diferença = 0 | **Correto** |
| Diferença > 0 | **Sobra** (tem mais no físico do que consta no sistema) |
| Diferença < 0 | **Falta** (tem menos no físico do que consta no sistema) |

*(Relacionado: RF04)*

**Exemplos:**

| Físico | Sistema | Diferença | Status |
|---|---|---|---|
| 150 | 150 | 0 | Correto |
| 160 | 150 | +10 | Sobra |
| 140 | 150 | −10 | Falta |
| 0 | 0 | 0 | Correto |

### RN03 — Onde o cálculo acontece
O status e a diferença são calculados em **um único lugar**: o backend (ou,
como já foi cogitado em `banco-de-dados.md`, uma coluna gerada no próprio
PostgreSQL). O React nunca recalcula isso por conta própria — apenas exibe
o valor que já vem pronto na resposta da API. Isso evita o risco de tela e
banco mostrarem números diferentes por causa de uma regra implementada de
dois jeitos diferentes. *(Relacionado: RNF07, RNF12)*

---

## 2. Catálogo de itens (óleo, graxa e peça)

### RN04 — Identidade única do item
Todo item — óleo, graxa ou peça — é identificado de forma única pelo seu
**código** (o mesmo valor do atributo `Coluna6` no XML). É esse código que
o sistema usa para decidir se um item do XML já existe no catálogo ou é
novo. Dois itens nunca podem coexistir com o mesmo código. *(Relacionado:
RF08, RNF05)*

### RN05 — Categoria decide o comportamento na tela, não o cálculo
A categoria do item (`oleo`, `graxa` ou `peca`) decide:
- em qual aba ele aparece (óleo/graxa → Contagem; peça → Inventários);
- se ele tem a quebra "estoque + oficina" (só óleos) ou um valor físico
  único (graxas e peças).

A categoria **não** muda a fórmula de diferença/status (RN01/RN02) — é só
uma questão de layout e de como o valor físico é composto.

### RN06 — Itens não são excluídos, são inativados
Um item que a Scania deixou de vender não é apagado do catálogo — ele é
marcado como inativo e some das telas de lançamento, mas continua existindo
para não quebrar o histórico de inventários antigos que o referenciam.
*(Relacionado: RNF09)*

---

## 3. Contagem diária de óleos e graxas

### RN07 — Composição do físico para itens com quebra de estoque
Para os 9 óleos (que têm `possui_quebra_estoque_oficina = true`):
```
Físico Total = Quantidade em Tambores/Contêineres + Quantidade nas Bombas da Oficina
```
As duas parcelas são lançadas separadamente pelo usuário; a soma é sempre
automática, nunca digitada diretamente. *(Relacionado: RF02)*

### RN08 — Físico direto para itens sem quebra de estoque
Para graxas e peças (`possui_quebra_estoque_oficina = false`), o físico é
um valor único, lançado diretamente — não existe conceito de "estoque" e
"oficina" separados para esses itens. *(Relacionado: RF03)*

### RN09 — Observação é sempre opcional
O campo de observação por item nunca é obrigatório para salvar o
inventário, em nenhuma categoria de item. *(Relacionado: RF06)*

### RN27 — Continuidade da quantidade de sistema entre dias
A quantidade física **sempre** começa zerada a cada novo dia de
inventário — ela representa uma contagem manual que precisa ser refeita
todo dia. A quantidade de sistema **não** segue essa regra: ela representa
o último valor conhecido vindo do sistema da empresa, e só muda por dois
motivos — (a) o item aparecer de novo num XML importado (RN10–RN13), ou
(b) edição manual do usuário. Um óleo que não teve movimento no dia (não
aparece no XML) **mantém a quantidade de sistema do último dia fechado**
em vez de zerar.

Na prática, isso significa que abrir o sistema num novo dia (sem nenhum
XML ainda importado) não deveria mostrar todos os óleos com sistema = 0 —
deveria mostrar o sistema que cada um tinha no último inventário fechado,
esperando apenas a atualização dos que tiveram movimento naquele dia.

Essa regra é uma extensão do mesmo princípio do RN13 (reimportação
mescla, não zera o que não veio no arquivo novo), só que aplicada entre um
dia fechado e o próximo, e não dentro do mesmo dia. *(Relacionado: RF25 —
ver `requisitos.md`)*

---

## 4. Importação de XML

### RN10 — Cruzamento por código
Ao importar um XML, cada item do relatório (atributo `Coluna6`) é
comparado com o catálogo de itens já conhecidos pelo sistema, usando o
código como chave — o mesmo identificador da RN04.

### RN11 — Item já pertence ao catálogo fixo de óleos/graxas
Se o código do XML já existe como óleo ou graxa no catálogo, o sistema
**não cria uma nova linha** — apenas atualiza a quantidade de sistema
daquele item na aba Contagem. A quantidade física nunca é alterada pela
importação; ela continua sendo preenchida manualmente. *(Relacionado: RF08,
RF09)*

### RN12 — Item novo ou já visto como peça
Se o código não pertence ao catálogo fixo de óleos/graxas, ele aparece (ou
continua aparecendo) na aba Inventários, com a quantidade de sistema vinda
do XML. A quantidade física dessa linha começa zerada na primeira vez que o
código é visto, e fica em aberto para preenchimento manual. *(Relacionado:
RF10)*

### RN13 — Reimportação no mesmo dia faz merge, nunca duplica
Importar um XML mais de uma vez no mesmo dia (seja o mesmo arquivo de novo,
seja uma versão atualizada do relatório) é permitido e esperado. Ao
reimportar:
- Itens cujo código já existe no inventário do dia têm **apenas** a
  quantidade de sistema, a descrição e a localização atualizadas — o valor
  físico já preenchido pelo usuário **nunca é sobrescrito** pela
  importação.
- Itens com código novo são adicionados normalmente.
- Nenhum item é duplicado: como a identidade é o código (RN04/RN10), reimportar
  o mesmo código só atualiza a linha existente, nunca cria uma segunda.

Esse comportamento é o que torna seguro reimportar o mesmo arquivo por
engano — o pior cenário possível é a quantidade de sistema ser "atualizada"
para o mesmo valor que já tinha. *(Relacionado: RF11)*

### RN14 — Código duplicado dentro do mesmo arquivo XML
Se o mesmo código aparecer mais de uma vez **dentro do mesmo arquivo**
importado (situação anômala, mas possível), o sistema usa o último valor
encontrado para aquele código e avisa o usuário quais códigos vieram
duplicados, para que ele possa conferir a origem do relatório se achar
necessário. *(Relacionado: RF12)*

### RN15 — Toda importação é registrada para auditoria
Cada importação de XML gera um registro próprio (nome do arquivo, data e
hora, quantidade de itens novos, quantidade de itens atualizados, códigos
duplicados encontrados) — independente de os dados importados também
aparecerem na Contagem/Inventários daquele dia. Esse registro nunca é
apagado, mesmo que o inventário do dia seja posteriormente esvaziado por
uma "Nova contagem" (RN21). *(Relacionado: RF15, RNF16)*

---

## 5. Ciclo de vida do inventário do dia

### RN16 — Quando um inventário "nasce"
Não existe um inventário para uma data só porque o usuário abriu o sistema
naquele dia. O registro do inventário só passa a existir **na primeira
alteração de fato** feita naquela data (digitar uma quantidade, importar um
XML) — evitando acumular registros vazios para dias em que nada foi feito.
*(Detalhado em `rascunho-inventario.md`, seção 3)*

### RN17 — Dois estados possíveis
Um inventário do dia está sempre em um destes dois estados:
- **Rascunho** — ainda sendo preenchido, autosave ativo, ainda não
  confirmado pelo usuário.
- **Fechado** — o usuário já clicou em "Salvar contagem do dia" pelo menos
  uma vez.

### RN18 — O que muda ao "fechar" o dia
Fechar um dia (botão "Salvar contagem do dia") **não cria um novo
registro** — apenas muda o status do inventário daquele dia de rascunho
para fechado, e registra a data/hora do **primeiro** fechamento. Fechar de
novo um dia que já estava fechado (depois de uma correção) não altera esse
horário original — ele é preservado. *(Detalhado em
`rascunho-inventario.md`, seção 5)*

### RN19 — Inventário fechado pode ser reaberto e corrigido
Confirmado neste documento: um inventário já fechado **pode** ser reaberto
a partir do Histórico, ter seus valores corrigidos, e ser salvo novamente.
Isso não é uma falha de controle — é o comportamento pretendido, pensado
para permitir corrigir um erro de digitação percebido depois do
fechamento. Para reduzir o risco de uma sobrescrita não intencional, a ação
de fechar/re-salvar sempre passa por uma confirmação explícita do usuário
antes de gravar. *(Relacionado: RF19, RF21)*

### RN20 — Reabrir e salvar não duplica o registro do dia
Como cada data corresponde a exatamente um inventário (RN22), reabrir e
salvar novamente sempre atualiza o mesmo registro — nunca cria um segundo
inventário para a mesma data.

### RN21 — "Nova contagem" não afeta dias já fechados anteriormente
A ação de limpar os campos para recomeçar a contagem do dia atual apaga
apenas os itens lançados **na data selecionada no momento**. Nenhum outro
dia do histórico é alterado por essa ação, esteja ele rascunho ou fechado.
*(Relacionado: RF22)*

---

## 6. Unicidade e integridade dos dados

### RN22 — Uma data, um inventário
Não pode existir mais de um inventário para a mesma data. Essa é uma regra
garantida estruturalmente pelo banco de dados (restrição de unicidade),
não apenas validada na tela. *(Relacionado: RNF04)*

### RN23 — Um item não se repete dentro do mesmo inventário
Dentro do inventário de um mesmo dia, um mesmo item (mesmo código) aparece
no máximo uma vez — tanto na Contagem quanto na Inventários. Essa restrição
também é garantida no banco, não só evitada pela lógica de importação (RN11
a RN13). *(Relacionado: RNF05)*

### RN24 — Validação sempre no backend
Toda informação que chega ao sistema — quantidades digitadas manualmente,
conteúdo de um XML importado — é validada no backend antes de ser gravada,
independentemente de qualquer validação que já exista na tela (React). A
tela pode (e deve) validar também, para dar retorno rápido ao usuário, mas
isso nunca substitui a validação do lado do servidor. *(Relacionado:
RNF08)*

---

## 7. Histórico

### RN25 — O que aparece no histórico
A aba Histórico lista os inventários com status **fechado**, do mais
recente para o mais antigo, cada um com um resumo rápido de quantos itens
estão corretos/sobrando/faltando naquele dia. Inventários que ficaram parados
em rascunho (o usuário começou a digitar mas nunca clicou em "Salvar
contagem do dia") não aparecem nessa lista por padrão — isso é um ponto em
aberto (ver seção 8). *(Relacionado: RF20)*

### RN26 — Abrir um dia do histórico
Abrir um dia a partir do Histórico carrega os dados daquele inventário
(óleos e peças) nas telas de Contagem e Inventários, no mesmo formato de
edição do dia corrente — e, a partir daí, segue as regras RN18/RN19 se o
usuário decidir salvar novamente. *(Relacionado: RF21)*

---

## 8. Pontos em aberto (ainda sem regra definida)

- **Rascunhos esquecidos.** Um dia pode ficar indefinidamente em status
  "rascunho" se o usuário nunca clicar em salvar. Ainda não decidimos se
  isso deveria aparecer de alguma forma no Histórico (com um indicador
  "não fechado"), ou se é aceitável que fique invisível até ser retomado.
- **Limite de tempo para reabrir um dia.** RN19 permite reabrir qualquer
  dia fechado, sem prazo. Não foi discutido se deveria existir um limite
  (por exemplo, não permitir corrigir um inventário de mais de X meses
  atrás) — hoje não há essa restrição.
- **Quem pode reabrir/corrigir.** Como o sistema ainda não tem autenticação
  (fora do escopo nesta fase, conforme `requisitos.md`), qualquer pessoa
  com acesso ao sistema pode reabrir e corrigir qualquer dia. Isso pode
  precisar de regra própria quando a autenticação for implementada.
- **Retenção do histórico de importações de XML (RN15).** Não foi definido
  se esses registros de auditoria devem ser mantidos indefinidamente ou se
  algum dia precisarão de uma política de limpeza.

---

## 9. Tabela-resumo

| Regra | Resumo | Requisito relacionado |
|---|---|---|
| RN01 | Diferença = Físico − Sistema | RF04 |
| RN02 | Status automático (correto/sobra/falta) | RF04 |
| RN03 | Cálculo sempre no backend | RNF07, RNF12 |
| RN04 | Item identificado por código único | RF08, RNF05 |
| RN05 | Categoria decide tela e composição do físico, não a fórmula | — |
| RN06 | Itens somem por inativação, não exclusão | RNF09 |
| RN07 | Físico do óleo = estoque + oficina | RF02 |
| RN08 | Físico de graxa/peça é direto | RF03 |
| RN09 | Observação sempre opcional | RF06 |
| RN27 | Sistema tem continuidade entre dias; só físico zera | RF25 |
| RN10 | Cruzamento do XML por código | — |
| RN11 | Item conhecido: só atualiza sistema, não duplica | RF08, RF09 |
| RN12 | Item novo: entra em Inventários, físico em aberto | RF10 |
| RN13 | Reimportação mescla, nunca duplica | RF11 |
| RN14 | Código duplicado no XML: usa o último, avisa o usuário | RF12 |
| RN15 | Toda importação é registrada para auditoria | RF15, RNF16 |
| RN16 | Inventário nasce na primeira alteração do dia | — |
| RN17 | Estados: rascunho / fechado | — |
| RN18 | Fechar preserva a data do primeiro fechamento | — |
| RN19 | Inventário fechado pode ser reaberto e corrigido | RF19, RF21 |
| RN20 | Reabrir e salvar não duplica o registro do dia | — |
| RN21 | "Nova contagem" só afeta a data atual | RF22 |
| RN22 | Uma data = um inventário | RNF04 |
| RN23 | Item não se repete no mesmo inventário | RNF05 |
| RN24 | Validação sempre no backend | RNF08 |
| RN25 | Histórico lista só dias fechados | RF20 |
| RN26 | Abrir um dia do histórico carrega para edição | RF21 |

Com este documento, as regras que antes estavam divididas entre o
`requisitos.md` (resumidas) e o comportamento do protótipo (implícito no
código) passam a ter um único lugar de referência, detalhado o suficiente
para orientar tanto o backend (FastAPI) quanto o frontend (React) sem
ambiguidade.
