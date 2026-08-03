# Fluxo de Telas — Importação de XML

Este documento detalha, passo a passo, o que acontece desde o clique em
"Importar XML do dia" até os dados estarem gravados no PostgreSQL — cruzando
o que aparece na tela (React) com o que acontece no servidor (FastAPI) e no
banco, em cada etapa. Ele complementa o `Componentes React.md` (que lista os
componentes envolvidos) e o `regras-de-negocios.md` (que já detalha as
regras RN10 a RN15 e RN27, aplicadas aqui na prática).

**Nota sobre o nome do documento:** como o pedido foi analisar o fluxo
completo (upload → banco) e chamar o arquivo de "fluxo de telas", organizei
o conteúdo em torno das transições de tela/estado que o usuário vê durante
o processo — mas indo fundo também na parte de servidor e banco em cada
etapa, já que é isso que efetivamente acontece "por trás" de cada tela.

---

## 1. Visão geral do fluxo

```
┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ 1. Tela ociosa│──▶│ 2. Seleção do │──▶│ 3. Envio +   │──▶│ 4. Processamento│──▶│ 5. Resultado │
│  (Inventários)│   │    arquivo    │   │   carregando  │   │   no backend   │   │   na tela    │
└──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘
                                                                  │
                                                                  ▼
                                                    ┌───────────────────────────┐
                                                    │ Banco de dados (PostgreSQL)│
                                                    │ itens / inventarios /      │
                                                    │ inventario_itens /         │
                                                    │ importacoes_xml            │
                                                    └───────────────────────────┘
```

As cinco etapas do topo são o que o usuário efetivamente vê. A etapa 4
(processamento no backend) é onde a maior parte da lógica de negócio
acontece, e é detalhada nas seções 3 a 6.

---

## 2. Etapa 1 e 2 — Tela ociosa e seleção do arquivo

**O que o usuário vê:** na aba Inventários, o botão "Importar XML do dia"
(componente `ImportXMLButton`, já listado em `Componentes React.md`). Ao
clicar, o navegador abre o seletor de arquivos nativo do sistema
operacional — essa parte não é uma tela do próprio sistema, é o próprio
SO/navegador quem desenha essa janela.

**O que acontece tecnicamente:** o clique dispara um `<input type="file"
accept=".xml">` escondido (o mesmo padrão já usado no protótipo
`contagem_oleo.html`). Nada é enviado ao servidor ainda — só depois que o
usuário efetivamente escolhe um arquivo.

**Validações do lado do navegador, antes de qualquer envio:**
- Se nenhum arquivo for escolhido (usuário cancelou o seletor), nada
  acontece — o componente simplesmente volta ao estado ocioso.
- O atributo `accept=".xml"` já filtra a maioria dos arquivos errados na
  hora de escolher, mas **isso não é validação de verdade** — só uma
  facilidade de interface. A validação que importa acontece no backend
  (RNF08), na etapa 4.

---

## 3. Etapa 3 — Envio do arquivo e estado de carregando

**O que o usuário vê:** o botão "Importar XML do dia" passa a um estado
desabilitado/carregando (ex: texto muda para "Importando...", ou um
indicador de progresso simples), para deixar claro que uma ação está em
andamento e evitar cliques duplicados enquanto o envio não termina.

**O que acontece tecnicamente:**
1. O React monta um `FormData` com o arquivo selecionado.
2. Envia via `POST /inventarios/{data}/importar-xml` (rota já prevista em
   `visao-geral.md`, seção 5), como `multipart/form-data`, usando a data
   selecionada no `DateSelector` compartilhado (RF16).
3. Diferente do protótipo atual (onde o `DOMParser` lê o XML inteiro no
   navegador), aqui o frontend **não abre nem interpreta o conteúdo do
   arquivo** — só o envia cru. Essa mudança de responsabilidade já estava
   registrada em `visao-geral.md` (seção 4) e é o que torna esta etapa tão
   simples do lado do React.

---

## 4. Etapa 4 — Processamento no backend (o coração do fluxo)

Esta é a etapa que efetivamente muda dados no banco. Ela é dividida em
sub-passos, executados **dentro de uma única transação** — se qualquer
sub-passo falhar, nada do que foi processado até ali é gravado (evita
deixar o banco num estado "pela metade").

### 4.1 — Validação do arquivo recebido
Antes de tentar interpretar qualquer conteúdo, o backend confere:
- Se o arquivo foi realmente enviado (não veio vazio).
- Se o conteúdo é um XML bem formado (não corrompido, não outro tipo de
  arquivo com extensão trocada).

Se falhar aqui, o processamento para imediatamente e o backend responde com
erro — nada chega a ser gravado. *(Relacionado: RNF08)*

### 4.2 — Extração dos itens do XML
O backend percorre os elementos `<Dados>` do arquivo e extrai, de cada um:
`Coluna1` (localização), `Coluna2` (quantidade de sistema), `Coluna4`
(unidade), `Coluna6` (código) e `Coluna7` (descrição) — a mesma leitura que
hoje é feita em JavaScript pela função `extrairItensXML` do protótipo,
apenas reescrita em Python no lado do servidor.

### 4.3 — Detecção de códigos duplicados dentro do próprio arquivo
Ainda em memória (antes de tocar o banco), o backend verifica se algum
código aparece mais de uma vez no arquivo importado. Se sim, guarda essa
lista para incluir no aviso de retorno e usa o último valor de cada código
duplicado a partir daqui. *(RN14)*

### 4.4 — Cruzamento com o catálogo (`itens`)
Para cada item extraído, o backend consulta a tabela `itens` pelo campo
`codigo` (RN04/RN10) e separa em dois grupos:

- **Já pertence ao catálogo fixo de óleos/graxas** (`categoria IN ('oleo',
  'graxa')`) → segue para 4.5.
- **É uma peça, nova ou já vista antes** (`categoria = 'peca'`, ou código
  ainda não existe em `itens` nenhuma) → segue para 4.6.

### 4.5 — Atualização dos óleos/graxas já conhecidos
Para cada item do primeiro grupo:
1. Garante que já existe uma linha em `inventarios` para a data recebida
   (cria com `status = 'rascunho'` se ainda não existir — RN16), já
   semeando a quantidade de sistema dos óleos que **não** vieram nesse XML
   com o último valor fechado conhecido, conforme detalhado em
   `rascunho-inventario.md` (seção 3.1) e RN27.
2. Atualiza (`UPDATE`) a `quantidade_sistema` do `inventario_itens`
   correspondente — **nunca mexe na `quantidade_fisica`**, que continua
   exclusivamente sob controle do usuário. *(RN11)*
3. Não cria nenhuma linha nova em `itens` — esses códigos já existiam.

### 4.6 — Itens novos ou peças já vistas antes
Para cada item do segundo grupo:
1. Se o código ainda não existe em `itens`, o backend cria a linha
   (`categoria = 'peca'`, `possui_quebra_estoque_oficina = false`,
   `localizacao_padrao` vinda do `Coluna1`). Se já existe (peça vista em
   dia anterior), apenas atualiza `descricao`/`localizacao_padrao` se
   tiverem mudado. *(RN04, RN12)*
2. Garante a linha de `inventarios` da data (mesma lógica do 4.5.1, sem a
   semeadura de sistema — que só se aplica a óleo/graxa, RN27).
3. Faz um **upsert** em `inventario_itens`: se o item já existe no
   inventário desse dia (reimportação), atualiza `quantidade_sistema`
   preservando a `quantidade_fisica` já preenchida; se não existe ainda,
   cria a linha com `quantidade_sistema` do XML e `quantidade_fisica = 0`.
   *(RN12, RN13)*

### 4.7 — Registro da importação para auditoria
Ao final do processamento (ainda dentro da mesma transação), o backend
grava uma linha em `importacoes_xml`: nome do arquivo, data/hora, contagem
de itens novos, contagem de itens atualizados, e os códigos duplicados
encontrados no passo 4.3. *(RN15, RNF16)*

### 4.8 — Confirmação da transação
Se todos os passos acima terminaram sem erro, a transação é confirmada
(`COMMIT`) — é só nesse momento que as mudanças passam a existir de fato no
banco. Se qualquer passo falhar antes disso, tudo é desfeito (`ROLLBACK`) e
nenhuma alteração parcial fica registrada.

---

## 5. Etapa 5 — Resultado na tela

**O que o usuário vê:** o backend responde com um resumo (itens novos,
itens atualizados, óleos/graxas com sistema atualizado, códigos
duplicados encontrados). O React usa esse resumo para:

1. Abrir o `ImportSummaryDialog` (já listado em `Componentes React.md`),
   mostrando os números do resumo — o mesmo texto de confirmação que já
   existe no protótipo (“Importação concluída: X óleo(s)/graxa(s)
   atualizados...”).
2. Atualizar a lista de peças na aba Inventários e os campos de sistema na
   aba Contagem — seja re-buscando os dados atualizados do backend (`GET
   /inventarios/{data}`), seja aplicando a resposta da importação
   diretamente ao estado local, sem precisar de uma segunda chamada.
3. Devolver o botão "Importar XML do dia" ao estado normal, liberando para
   uma nova importação (RN13 — reimportar é permitido e esperado).

---

## 6. O que acontece quando algo dá errado

| Onde falha | O que o backend faz | O que a tela mostra |
|---|---|---|
| Arquivo não é XML válido / corrompido | Rejeita antes de processar qualquer item (4.1); nada é gravado | `AlertDialog`: "Não foi possível ler esse arquivo XML. Verifique se o arquivo é válido." |
| XML válido, mas sem nenhum item reconhecível | Retorna sem erro, mas com contagem zerada | `AlertDialog`: aviso de que nenhum item foi encontrado no arquivo |
| Falha de conexão durante o envio (sem internet, backend fora do ar) | Nenhuma alteração chega a ser processada | `AlertDialog` de erro de conexão; o botão volta ao estado normal para nova tentativa |
| Falha no meio do processamento (ex: erro inesperado gravando no banco) | `ROLLBACK` da transação inteira (4.8) — nenhuma alteração parcial fica salva | `AlertDialog` de erro genérico; nada muda na tela, já que nada foi de fato persistido |
| Código duplicado dentro do próprio arquivo | Não é um erro — é tratado (4.3) e informado no resumo | O aviso de duplicados aparece dentro do próprio `ImportSummaryDialog`, não como um erro separado |

O ponto central dessa tabela: **ou a importação inteira é aplicada, ou
nenhuma parte dela é** — não existe cenário de "metade dos itens
importados, metade não", graças à transação única da etapa 4.

---

## 7. Tabelas do banco envolvidas em cada etapa

| Etapa | Tabela | Operação |
|---|---|---|
| 4.4 | `itens` | `SELECT` por `codigo`, para separar conhecidos de novos/peças |
| 4.5 | `inventarios` | `INSERT ... ON CONFLICT DO NOTHING` (cria o dia se ainda não existir) |
| 4.5 | `inventario_itens` | `UPDATE` da `quantidade_sistema` dos óleos/graxas |
| 4.6 | `itens` | `INSERT`/`UPDATE` de peças novas ou já vistas |
| 4.6 | `inventario_itens` | `UPSERT` (cria ou atualiza, preservando físico) |
| 4.7 | `importacoes_xml` | `INSERT` do registro de auditoria |

---

## 8. Resumo do contrato entre frontend e backend nesta operação

| | Detalhe |
|---|---|
| Rota | `POST /inventarios/{data}/importar-xml` |
| Corpo da requisição | `multipart/form-data` com o arquivo XML |
| O que o frontend NÃO faz mais | Não interpreta o XML, não decide o que é duplicado, não decide o que é item conhecido — só envia o arquivo e exibe o resultado |
| O que o backend devolve | Resumo com: itens novos, itens atualizados, óleos/graxas com sistema atualizado, lista de códigos duplicados (se houver) |
| Regras de negócio aplicadas | RN04, RN10 a RN15, RN27 |

Com este documento, a importação de XML deixa de ser só "o botão que já
funciona no protótipo" e passa a ter o caminho completo — desde o clique do
usuário até a linha gravada no PostgreSQL — registrado para orientar a
implementação tanto do endpoint no FastAPI quanto do componente no React.
