# Componentes React — Sistema de Inventário de Óleo e Peças (Scania)

Este documento lista os componentes React necessários para as três telas já
definidas (Contagem, Inventários, Histórico), com base no que já está
funcionando no protótipo (`contagem_oleo.html`) e no que foi decidido em
`visao-geral.md`, `requisitos.md` e `rascunho-inventario.md`. A ideia é que,
na hora de programar, cada componente listado aqui já tenha uma
responsabilidade clara e um motivo para existir separado dos outros — em vez
de recriar o protótipo como um bloco só de JSX.

Cada componente é "burro" por padrão: recebe dados prontos via `props` e
avisa o componente pai quando algo muda (`onChange`, `onSalvar` etc.), sem
decidir sozinho o que é "faltando" ou "sobrando" — esse cálculo, como já
ficou definido em `visao-geral.md`, é responsabilidade do backend. Isso
mantém a divisão de responsabilidades das três camadas também dentro do
próprio frontend.

---

## 1. Estrutura geral

```
src/
├── pages/
│   ├── ContagemPage.jsx
│   ├── InventariosPage.jsx
│   └── HistoricoPage.jsx
├── components/
│   ├── layout/
│   │   ├── Header.jsx
│   │   ├── TabNav.jsx
│   │   ├── DateSelector.jsx
│   │   └── ActionsFooter.jsx
│   ├── comuns/
│   │   ├── StatusBadge.jsx
│   │   ├── SummaryBar.jsx
│   │   ├── SaveStatusIndicator.jsx
│   │   ├── EditingBanner.jsx
│   │   ├── SearchInput.jsx
│   │   ├── ConfirmDialog.jsx
│   │   └── AlertDialog.jsx
│   ├── contagem/
│   │   ├── OleoCard.jsx
│   │   ├── ComparisonBar.jsx
│   │   └── ObservacaoInput.jsx
│   ├── inventarios/
│   │   ├── ImportXMLButton.jsx
│   │   ├── ImportSummaryDialog.jsx
│   │   └── PecaListItem.jsx
│   ├── historico/
│   │   └── HistoricoListItem.jsx
│   └── impressao/
│       └── PrintInventoryButton.jsx
├── hooks/
│   ├── useDebouncedSave.js
│   ├── useInventarioDoDia.js
│   └── useHistorico.js
└── api/
    └── inventarios.js
```

Essa estrutura segue a pasta `frontend/src/` já esboçada em `visao-geral.md`
(seção 6), só detalhando o que vai dentro de `pages/` e `components/`.

---

## 2. Componentes de layout (usados em mais de uma página)

### `Header`
**O que faz:** mostra o logo da Scania e o título do sistema, fixo no topo,
igual ao cabeçalho do protótipo.
**Props:** nenhuma (conteúdo fixo) — ou `titulo` se quisermos reaproveitar o
componente para outra tela no futuro.
**Por quê separado:** não tem lógica nenhuma, é conteúdo estático. Separar
evita repetir o mesmo JSX em três páginas e centraliza qualquer ajuste
visual (ex: trocar o logo) num único lugar. Atende ao **RF23**.

### `TabNav`
**O que faz:** as três abas (Contagem, Inventários, Histórico). Usa rotas do
React Router (`/contagem`, `/inventarios`, `/historico`) em vez do
`switchTab()` manual do protótipo — assim a URL reflete a aba atual, e dá
pra favoritar/compartilhar um link direto pra aba de Histórico, por exemplo.
**Props:** nenhuma — lê a rota atual do próprio React Router para destacar a
aba ativa.

### `DateSelector`
**O que faz:** o campo de data único, compartilhado entre Contagem e
Inventários (**RF16**).
**Props:** `data` (string ISO), `onChange(novaData)`.
**Por quê separado:** hoje, no protótipo, existe um único `<input
type="date">` no cabeçalho, fora das abas — no React, como cada página é um
componente próprio, a data precisa ser um **estado elevado** (guardado no
componente pai comum, ex: `App` ou um contexto), e `DateSelector` só exibe e
avisa a mudança. Sem isso, cada página teria sua própria cópia da data e
elas dessincronizariam.

### `ActionsFooter`
**O que faz:** os botões "Salvar contagem do dia" e "Nova contagem",
reaproveitados tanto na página Contagem quanto na Inventários (**RF18**,
**RF22**).
**Props:** `onSalvar()`, `onNovaContagem()`, `salvando` (boolean, pra
desabilitar o botão durante o request).
**Por quê separado:** no protótipo, o mesmo botão físico aparecia duas
vezes (uma em cada aba) chamando a mesma função. Em React isso vira o mesmo
componente reaproveitado, evitando duplicar o JSX dos botões nas duas
páginas.

---

## 3. Componentes comuns (usados em várias telas)

### `StatusBadge`
**O que faz:** o selo colorido "Correto" / "Sobra" / "Falta" (**RF24**).
**Props:** `status` (`'correto' | 'sobra' | 'falta'`).
**Por quê separado:** é o componente mais reaproveitado do sistema —
aparece em cada card de óleo, cada linha de peça, e em cada linha do
histórico. Centralizar aqui garante que a cor de "falta" (por exemplo) seja
exatamente a mesma em qualquer lugar que apareça (**RNF01**), e que uma
mudança de paleta no futuro seja um ajuste em um arquivo só.

### `SummaryBar`
**O que faz:** os três cartões de contagem (Faltando / Sobrando /
Corretos), usados tanto na aba Contagem quanto na Inventários (**RF05**,
**RF14**).
**Props:** `falta`, `sobra`, `correto` (números já calculados, vindos do
backend).
**Por quê separado:** é visualmente idêntico nas duas abas, só muda o
conjunto de itens contado. Em vez de duplicar o JSX, cada página passa seus
próprios números.

### `SaveStatusIndicator`
**O que faz:** o texto pequeno "Salvando..." / "Rascunho salvo às 10:42" /
"Não foi possível salvar", que já existia no protótipo.
**Props:** `estado` (`'ocioso' | 'salvando' | 'salvo' | 'erro'`), `horario`
(opcional).
**Por quê separado:** com o rascunho agora indo para o backend
(`rascunho-inventario.md`), esse indicador passa a refletir o resultado de
uma chamada HTTP real (sucesso/falha), não só um `setTimeout` local — vale a
pena isolar essa lógica de exibição de estado num componente só, já
preparado para os três estados possíveis (RNF06).

### `EditingBanner`
**O que faz:** o aviso amarelo "Editando contagem já salva de 15/07/2026" —
que aparece quando o usuário abre um dia do Histórico para edição.
**Props:** `dataEditando` (string ou `null`), `onCancelar()`.
**Por quê separado:** é um elemento condicional (só aparece às vezes),
então isolar deixa o componente da página principal mais simples de ler —
ele só decide *se* mostra, não *como*.

### `SearchInput`
**O que faz:** o campo de busca por código/descrição da aba Inventários
(**RF13**, **RNF03**).
**Props:** `valor`, `onChange(texto)`, `placeholder` (opcional).
**Por quê separado:** é um input genérico sem nenhuma lógica de negócio —
só existe como componente próprio para manter consistência visual com os
outros campos de texto do sistema.

### `ConfirmDialog` e `AlertDialog`
**O que fazem:** substituem os `confirm()`/`alert()` nativos do navegador,
bloqueados no ambiente do protótipo — e que, por causa disso, já ficou
definido como requisito não depender deles (**RNF02**).
**Props (`ConfirmDialog`):** `aberto`, `mensagem`, `onConfirmar()`,
`onCancelar()`.
**Props (`AlertDialog`):** `aberto`, `mensagem`, `onFechar()`.
**Por quê dois componentes e não um só:** tecnicamente poderiam ser o
mesmo componente com um botão a mais ou a menos, mas separar deixa a
intenção mais clara no código de quem usa (`<ConfirmDialog ...>` já indica
que é uma pergunta com duas saídas possíveis) e evita passar props opcionais
que mudam o comportamento do componente por dentro.
**Observação técnica:** como agora existe um backend de verdade, o
`ConfirmDialog` de "já existe uma contagem salva para essa data, deseja
substituir?" muda um pouco de sentido — como explicado em
`rascunho-inventario.md` (seção 5), passa a ser mais "confirma que quer
fechar esse dia?", já que o rascunho já estava sendo salvo o tempo todo.

---

## 4. Página Contagem

### `ContagemPage`
**O que faz:** busca o inventário do dia atual (`GET /inventarios/{data}`,
conforme `visao-geral.md` seção 5), monta a lista dos 9 óleos + 2 graxas e
organiza `SummaryBar` + lista de `OleoCard` + `ActionsFooter`.
**Por quê separado:** é o componente "de página" — conecta a tela com a
API através do hook `useInventarioDoDia` (seção 6) e distribui os dados para
os componentes visuais, sem ele mesmo desenhar nenhum elemento complexo.

### `OleoCard`
**O que faz:** o card individual de um óleo ou graxa — os mesmos campos que
já existem no protótipo (Estoque, Oficina, Total físico, Sistema,
Diferença, `StatusBadge`, `ComparisonBar`, `ObservacaoInput`).
**Props:** `item` (objeto vindo da API: código, descrição, estoque, oficina,
sistema, diferença, status, observação), `possuiQuebraEstoqueOficina`
(boolean — vem do campo `categoria`/`possui_quebra_estoque_oficina` da
tabela `itens`), `onChange(campoAlterado, novoValor)`.
**Por quê um componente só para óleo e graxa, em vez de dois:** no banco de
dados (`banco-de-dados.md`, seção 2) óleos e graxas já são tratados como o
mesmo tipo de registro, diferenciados só pela flag
`possui_quebra_estoque_oficina`. Faz sentido o componente seguir a mesma
lógica: quando a flag é `false`, o card simplesmente não mostra os campos
"Estoque" e "Oficina" separados, mostrando um único campo "Físico" — em vez
de manter dois componentes quase idênticos.

### `ComparisonBar`
**O que faz:** a barrinha visual comparando físico x sistema, que já existe
no protótipo.
**Props:** `fisico`, `sistema` (números).
**Por quê separado:** é um elemento puramente visual e sem estado próprio —
isolar facilita reaproveitá-lo depois na aba Inventários também, já que a
mesma comparação física/sistema se aplica às peças (hoje o protótipo não
usa a barra lá, mas pode ser um ajuste futuro fácil de fazer justamente por
já ser um componente à parte).

### `ObservacaoInput`
**O que faz:** o campo de observação livre por item (**RF06**).
**Props:** `valor`, `onChange(texto)`.
**Por quê separado:** input de texto simples, sem lógica — como
`SearchInput`, existe como componente próprio só para manter o estilo
consistente.

---

## 5. Página Inventários

### `InventariosPage`
**O que faz:** busca os itens importados do dia (parte da mesma resposta de
`GET /inventarios/{data}`, filtrada por categoria `peca`), controla o texto
de busca, e organiza `ImportXMLButton` + `SummaryBar` + `SearchInput` +
lista de `PecaListItem` + `ActionsFooter`.
**Por quê separado:** mesmo papel do `ContagemPage`, mas para os itens
variáveis do XML.

### `ImportXMLButton`
**O que faz:** o botão "Importar XML do dia" + o input de arquivo
escondido. Ao selecionar um arquivo, envia para
`POST /inventarios/{data}/importar-xml` (**RF07**) e mostra o resultado.
**Props:** `data` (para saber em qual dia importar), `onImportado(resumo)`
— callback chamado quando a resposta da API chega, para a página atualizar
a lista.
**Por quê separado:** concentra toda a lógica de upload de arquivo (que tem
suas particularidades: `FormData`, estado de carregando, tratamento de
erro) longe do resto da tela, que só precisa saber "terminou, aqui está o
resumo".
**Mudança importante em relação ao protótipo:** hoje o parsing do XML
acontece no navegador (`DOMParser`); na nova arquitetura, como já decidido
em `visao-geral.md` (seção 4), esse componente só **envia o arquivo cru**
para o backend — quem lê, casa os códigos e mescla é o FastAPI. Isso deixa
o componente React bem mais simples do que a função `lerArquivoXML` +
`parseXMLDados` + `extrairItensXML` que existem hoje no HTML.

### `ImportSummaryDialog`
**O que faz:** mostra o resumo depois de uma importação — "X óleos
atualizados, Y itens novos, Z atualizados", e o aviso de códigos duplicados
quando existir (**RF12**, **RF15**).
**Props:** `aberto`, `resumo` (objeto vindo da resposta da API), `onFechar()`.
**Por quê separado, e não reaproveitar o `AlertDialog` genérico:** o
conteúdo desse aviso é mais estruturado (números, lista de códigos
duplicados) do que uma simples mensagem de texto — vale a pena ter um
componente que sabe formatar esse resumo especificamente, mesmo que por
baixo dos panos ele use a mesma "casca" visual de modal que o `AlertDialog`.

### `PecaListItem`
**O que faz:** uma linha da lista de peças (Locação, Código, Descrição,
Unidade, Sistema, campo de Físico, Diferença, `StatusBadge`) — o
equivalente em lista, não em card, do que o `OleoCard` é para óleos.
**Props:** `item` (código, descrição, localização, unidade, sistema,
físico, diferença, status), `onChangeFisico(novoValor)`.
**Por quê não reaproveitar o `OleoCard`:** você já foi claro que essa aba
deve ser uma lista compacta, não cards — visualmente são bem diferentes
(uma linha densa vs. um bloco com barra e várias seções). Forçar os dois a
serem o mesmo componente exigiria muitas props condicionais só para mudar a
aparência, o que tende a complicar mais do que ajudar.

---

## 6. Página Histórico

### `HistoricoPage`
**O que faz:** busca a lista de dias já fechados (`GET /inventarios`,
filtrando por `status = 'fechado'`) e renderiza uma lista de
`HistoricoListItem` (**RF20**).
**Por quê separado:** página simples, principalmente uma lista — pouca
lógica própria além de buscar os dados e (opcionalmente) paginar, se a
lista crescer muito ao longo dos meses.

### `HistoricoListItem`
**O que faz:** uma linha da lista — a data formatada e o resumo
(faltando/sobrando/corretos), com um botão "Abrir" que leva para a página
Contagem/Inventários carregada com os dados daquele dia (**RF21**).
**Props:** `data`, `resumo`, `onAbrir()`.
**Por quê separado:** mesmo raciocínio dos outros itens de lista — mantém
`HistoricoPage` limpa, só orquestrando a busca e a renderização da lista.

---

## 7. Impressão

### `PrintInventoryButton`
**O que faz:** o botão "Imprimir inventário do dia" (e sua variante "abrir
em nova aba"), reaproveitando a mesma ideia do protótipo (montar uma versão
limpa em preto e branco e chamar `window.print()`).
**Props:** `data`.
**Considerações para a versão React:** como os dados agora vêm do backend
(e não de um `state`/`statePecas` já carregados na memória do navegador), a
função de montagem do HTML de impressão precisa buscar os dados do dia
antes de montar o conteúdo (ou reaproveitar os dados que a própria página já
carregou, se o usuário está na tela no momento de clicar). Continua fora do
escopo do backend — é geração de HTML para impressão, uma responsabilidade
de tela, então faz sentido continuar sendo resolvido no React, e não como
mais um endpoint no FastAPI.

---

## 8. Hooks customizados

Não são componentes visuais, mas são peças importantes da arquitetura
React e valem registro aqui, já que várias páginas dependem deles.

### `useInventarioDoDia(data)`
Busca e mantém em estado o inventário completo de uma data (óleos + peças),
chamando `GET /inventarios/{data}`. Devolve os dados já separados por
categoria (para `ContagemPage` e `InventariosPage` consumirem cada um sua
parte) e funções para atualizar um item (`atualizarItem`), que já aplicam o
debounce antes de chamar a API.

### `useDebouncedSave(fn, delayMs = 500)`
Hook genérico que atrasa a execução de `fn` até a pessoa parar de
digitar — implementando o comportamento de debounce descrito em
`rascunho-inventario.md` (seção 4), hoje feito "na mão" com `setTimeout` no
protótipo. Ser um hook reaproveitável evita reescrever essa lógica em cada
lugar que precisa de autosave (campos de óleo, campos de peça, etc.).

### `useHistorico()`
Busca a lista de dias fechados para a `HistoricoPage`, incluindo estados de
carregando/erro.

---

## 9. Tabela-resumo

| Componente | Página(s) | Requisito(s) relacionado(s) |
|---|---|---|
| `Header` | todas | RF23 |
| `TabNav` | todas | — |
| `DateSelector` | Contagem, Inventários | RF16 |
| `ActionsFooter` | Contagem, Inventários | RF18, RF22 |
| `StatusBadge` | todas | RF24 |
| `SummaryBar` | Contagem, Inventários | RF05, RF14 |
| `SaveStatusIndicator` | Contagem, Inventários | RNF06 |
| `EditingBanner` | Contagem | RF21 |
| `SearchInput` | Inventários | RF13, RNF03 |
| `ConfirmDialog` / `AlertDialog` | todas | RNF02 |
| `OleoCard` | Contagem | RF01, RF02, RF03 |
| `ComparisonBar` | Contagem | — |
| `ObservacaoInput` | Contagem | RF06 |
| `ImportXMLButton` | Inventários | RF07, RF08 |
| `ImportSummaryDialog` | Inventários | RF12, RF15 |
| `PecaListItem` | Inventários | RF09, RF10 |
| `HistoricoListItem` | Histórico | RF20, RF21 |
| `PrintInventoryButton` | Contagem, Inventários | — |

---

## 10. Pontos em aberto para decidir mais à frente

1. **Roteamento.** Presumi o uso do React Router para as três páginas
   (permitindo URLs próprias tipo `/historico`), mas isso não foi discutido
   ainda — dá pra manter a troca de aba só por estado local (como no
   protótipo) se preferir uma navegação mais simples sem URLs próprias.
2. **Gerenciamento de estado global.** Hoje descrevi a data selecionada
   como um "estado elevado" simples (guardado no componente `App` e
   repassado via props). Se o sistema crescer, pode valer a pena usar um
   Context do React para isso em vez de props — mas não é necessário
   agora, com o tamanho atual do sistema.
3. **Biblioteca de estilos.** Não defini se os componentes vão usar CSS
   puro (como o protótipo), CSS Modules, ou alguma biblioteca de
   componentes — isso não muda a lista de componentes em si, só como cada
   um é estilizado por dentro.
4. **Testes.** Este documento não cobre estratégia de testes (unitários dos
   componentes, ou testes de integração das páginas) — pode ser um
   documento à parte, se você quiser formalizar isso antes de começar a
   programar.

Com esse documento, mais `visao-geral.md`, `banco-de-dados.md`,
`requisitos.md` e `rascunho-inventario.md`, fica coberto o desenho completo
do sistema (banco, backend e agora a divisão de telas do frontend) antes de
começar a escrever código de verdade.
