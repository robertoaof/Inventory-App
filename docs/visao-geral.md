# Visão Geral do Sistema — Inventário de Óleo e Peças (Scania)

Este documento dá a visão de conjunto do sistema: o que ele faz, como as
peças se encaixam (frontend, backend, banco) e como as funcionalidades já
definidas vão se conectar nessa arquitetura. Ele deve ser lido junto com
`banco-de-dados.md`, que detalha só a parte de banco de dados.

---

## 1. O que é o sistema

Uma ferramenta interna para controlar o inventário de óleos, graxas e peças
no estoque de uma concessionária Scania. Substitui a planilha Excel usada
hoje, permitindo:

- Lançar diariamente a contagem física de 9 óleos e 2 graxas fixos (aba
  **Contagem**), comparando com a quantidade que consta no sistema da
  empresa.
- Importar o arquivo XML gerado pelo sistema da Scania (relatório
  "Conferência por Locação") para alimentar automaticamente a quantidade de
  sistema, tanto dos óleos/graxas já conhecidos quanto de qualquer outra
  peça que apareça no relatório (aba **Inventários**).
- Guardar o inventário de cada dia e poder consultar dias anteriores (aba
  **Histórico**).

## 2. De onde viemos → para onde vamos

O que existe hoje (`contagem_oleo.html`) é um **protótipo funcional**: um
único arquivo HTML que roda sozinho no navegador, sem servidor, guardando os
dados no armazenamento de chave-valor do Claude. Ele serviu para validar as
regras de negócio (o que é "faltando/sobrando/correto", como a importação de
XML deve se comportar, como o histórico deve funcionar) antes de investir
numa arquitetura maior — e continua funcionando enquanto o sistema novo não
estiver pronto.

A partir de agora, entramos na versão "de verdade": **React** no frontend,
**FastAPI** no backend, **PostgreSQL** no banco. Isso muda a forma como o
sistema roda (deixa de ser um arquivo único, passa a ter processos
separados), mas as regras de negócio que já validamos no protótipo
continuam as mesmas.

## 3. Arquitetura em três camadas

```
┌─────────────────────┐        ┌──────────────────────┐        ┌────────────────────┐
│   FRONTEND (React)  │  HTTP  │   BACKEND (FastAPI)   │  SQL   │  BANCO (PostgreSQL) │
│                      │ ─────► │                       │ ─────► │                     │
│  Telas: Contagem,    │  JSON  │  Regras de negócio,   │        │  itens,             │
│  Inventários,        │ ◄───── │  validação, leitura   │ ◄───── │  inventarios,       │
│  Histórico           │        │  e escrita do banco,  │        │  inventario_itens,  │
│                      │        │  parsing do XML       │        │  importacoes_xml    │
└─────────────────────┘        └──────────────────────┘        └────────────────────┘
```

Cada camada tem uma responsabilidade única:

- **React** cuida só da tela: mostrar os dados, capturar o que o usuário
  digita, mostrar os avisos (os mesmos modais de confirmação que já existem
  no protótipo). Ele **não** decide sozinho se um item está "faltando" ou
  "sobrando" — só mostra o que o backend calculou.
- **FastAPI** é onde moram as regras: o que conta como duplicado, como
  mesclar uma reimportação do XML, o cálculo de diferença/status (que já
  vimos que também pode ser feito pelo próprio Postgres via coluna gerada —
  o FastAPI só precisa ler esse valor pronto, não recalcular).
- **PostgreSQL** guarda tudo de forma durável e consistente, como já
  detalhado em `banco-de-dados.md`.

## 4. Por que mover a leitura do XML para o backend

No protótipo, o XML é lido inteiramente no navegador (JavaScript). Na nova
arquitetura, recomendo que **a leitura do XML passe a acontecer no FastAPI**:
o React só envia o arquivo, e quem faz o parsing, casa os códigos com o
catálogo e grava no banco é o backend. Motivos:

1. **Um só lugar com a regra de negócio.** Se amanhã a Scania mudar o
   formato do relatório, só se ajusta o backend — não é preciso atualizar
   cada navegador que tiver o sistema aberto.
2. **A tabela `importacoes_xml` (do banco-de-dados.md) só faz sentido assim.**
   Ela guarda quantos itens foram atualizados, quais vieram duplicados etc.
   — isso é natural de calcular no momento em que o backend já está
   processando o arquivo e gravando no banco, dentro da mesma transação.
3. **Validação mais segura.** O backend pode rejeitar um arquivo malformado
   ou de formato inesperado antes que qualquer dado inconsistente chegue ao
   banco, sem depender só da validação do navegador.

## 5. Funcionalidades e como cruzam as camadas

| Funcionalidade | Tela (React) | Endpoint (FastAPI) | Tabelas envolvidas |
|---|---|---|---|
| Ver contagem do dia atual | Aba Contagem | `GET /inventarios/atual` (ou `/inventarios/{data}`) | `inventarios`, `inventario_itens`, `itens` |
| Editar quantidade física/sistema de um óleo | Aba Contagem | `PATCH /inventarios/{data}/itens/{item_id}` | `inventario_itens` |
| Importar XML do dia | Aba Inventários | `POST /inventarios/{data}/importar-xml` | `itens`, `inventario_itens`, `importacoes_xml` |
| Editar físico de uma peça importada | Aba Inventários | `PATCH /inventarios/{data}/itens/{item_id}` | `inventario_itens` |
| Salvar contagem do dia | Botão comum às duas abas | `POST /inventarios/{data}/fechar` | `inventarios`, `inventario_itens` |
| Listar histórico | Aba Histórico | `GET /inventarios` | `inventarios`, `inventario_itens` |
| Abrir um dia do histórico | Aba Histórico | `GET /inventarios/{data}` | `inventarios`, `inventario_itens`, `itens` |
| Nova contagem (limpar) | Botão comum | `DELETE /inventarios/{data}/itens` (limpa os itens, mantém o dia) — ver `rascunho-inventario.md` | `inventario_itens` |

Essa tabela é uma primeira proposta de contrato entre frontend e backend —
os nomes exatos das rotas e verbos HTTP podem mudar quando formos programar,
mas o mapeamento de "qual tela usa qual operação" já fica registrado aqui.

## 6. Estrutura de pastas sugerida

```
sistema-inventario-scania/
├── frontend/                 # aplicação React
│   ├── src/
│   │   ├── pages/             # Contagem, Inventarios, Historico
│   │   ├── components/        # itens de lista, cards, modais, badges de status
│   │   ├── api/                # funções que chamam o backend
│   │   └── ...
│   └── package.json
├── backend/                   # aplicação FastAPI
│   ├── app/
│   │   ├── models/             # modelos SQLAlchemy (itens, inventarios, ...)
│   │   ├── schemas/            # modelos Pydantic (validação de entrada/saída)
│   │   ├── routers/            # rotas: inventarios, itens, importacao_xml
│   │   ├── services/           # regras de negócio (parsing do XML, merge, etc.)
│   │   └── main.py
│   ├── alembic/                # migrações do banco
│   └── requirements.txt
└── docs/
    ├── banco-de-dados.md
    └── visao-geral.md
```

Separar `frontend/` e `backend/` como duas aplicações independentes (mesmo
morando no mesmo repositório) é o padrão mais comum para esse par de
tecnologias — cada uma roda seu próprio processo, com sua própria forma de
build e deploy.

## 7. Peças técnicas complementares (fora do escopo de negócio, mas relevantes)

- **SQLAlchemy** como ORM no FastAPI, para representar as tabelas do
  `banco-de-dados.md` como classes Python, e **Alembic** para controlar as
  alterações no banco ao longo do tempo (migrações), em vez de rodar SQL à
  mão em produção.
- **Pydantic** (que já vem integrado ao FastAPI) para validar o que entra e
  sai da API — por exemplo, garantir que uma quantidade física não seja
  enviada como texto ou negativa antes de chegar ao banco.
- **CORS**: como React e FastAPI rodam como dois processos/endereços
  diferentes (ex: o React em uma porta, o FastAPI em outra), o backend
  precisa liberar explicitamente essas origens — é só uma configuração, mas
  vale registrar que não é automático como era no arquivo HTML único.
- **Variáveis de ambiente** (usuário/senha do banco, endereço da API) em vez
  de valores fixos no código — importante já pensar nisso desde o início do
  backend.

## 8. O que muda em relação ao protótipo atual

- O rascunho do dia (o que você está digitando antes de "Salvar a contagem
  do dia") deixa de morar no `window.storage` do navegador. Ficou definido
  que ele vai direto para o backend/banco desde o início (Opção B), com o
  mesmo espírito do autosave que já existe no protótipo. O detalhamento
  completo (como a tabela `inventarios` representa rascunho vs fechado,
  como o React deve agrupar as chamadas de autosave, o que acontece em caso
  de falha de rede) está em `rascunho-inventario.md`.
- Os modais de confirmação (substituindo `confirm`/`alert` do navegador, já
  que tínhamos descoberto que eram bloqueados) continuam sendo necessários
  — só que agora como componentes React, em vez de HTML/JS puro.
- O logo da Scania, os cards de resumo, as cores e badges de status
  (correto/sobra/falta) — tudo isso é só visual, e pode ser recriado como
  componentes React reaproveitando exatamente a mesma paleta e tipografia já
  definidas no protótipo.

## 9. Pontos em aberto para decidir mais à frente

1. ~~Rascunho: local no React ou já no backend?~~ **Resolvido:** vai para o
   backend desde o início — ver `rascunho-inventario.md`.
2. **Autenticação.** Hoje o sistema não tem login — é de uso único. Se um
   dia mais de uma pessoa for usar, entra a necessidade de autenticação e a
   tabela de usuários já cogitada no `banco-de-dados.md`.
3. **Onde hospedar.** Não é urgente agora, mas React + FastAPI + Postgres
   precisam rodar em algum lugar (pode ser um computador da própria
   concessionária, ou um servidor na nuvem). Vale decidir isso quando
   chegarmos na fase de implantação, não agora.

## 10. Resumo

| Camada | Tecnologia | Responsabilidade |
|---|---|---|
| Frontend | React | Telas (Contagem, Inventários, Histórico), captura de dados, exibição de status |
| Backend | FastAPI | Regras de negócio, validação, parsing do XML, comunicação com o banco |
| Banco | PostgreSQL | Armazenamento durável, consistência (`UNIQUE`, colunas geradas), histórico consultável |

Com esse documento e o `banco-de-dados.md`, temos o desenho completo antes
de começar a programar. Os próximos passos naturais seriam detalhar os
endpoints da API (contratos de entrada/saída de cada rota) e os componentes
de tela do React — mas isso fica para quando você quiser avançar.
