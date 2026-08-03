# Documentação REST da API — Sistema de Inventário de Óleo e Peças (Scania)

Este documento formaliza o contrato entre o frontend (React) e o backend
(FastAPI): rota por rota, o formato exato de cada requisição e resposta,
os erros possíveis e a regra de negócio (`RN..`/`RF..`) que cada
comportamento aplica. Ele parte da tabela de endpoints já esboçada em
`visao-geral.md` (seção 5) e a detalha por completo — sem escrever nenhum
código de implementação.

Como nenhum endpoint tinha o formato de dados definido em detalhe até
agora, tomei algumas decisões pontuais para fechar o contrato (marcadas
com **[decisão nova]**) — todas registradas na seção 7, para você revisar.

---

## 1. Convenções gerais

- **Base URL:** `/api/v1` — versionado desde o início, para permitir mudar
  o formato de alguma resposta no futuro sem quebrar um frontend antigo em
  uso. **[decisão nova]**
- **Formato de data:** sempre `AAAA-MM-DD` (ISO 8601) nos paths e nas
  respostas — ex: `2026-07-17`. Nunca `DD/MM/AAAA` na API (essa formatação
  fica só na exibição em tela, como já acontece hoje com `formatDateBR` no
  protótipo).
- **Formato de data e hora:** ISO 8601 completo com timezone, ex:
  `2026-07-17T18:42:03-03:00`, usado em campos como `fechado_em` e
  `processado_em`.
- **Nomenclatura dos campos JSON:** `snake_case` (`quantidade_fisica`, não
  `quantidadeFisica`) — segue a convenção padrão do Python/FastAPI/Pydantic
  no backend; a conversão para o estilo usado no React (se necessário) fica
  a cargo do frontend. **[decisão nova]**
- **Content-Type:** `application/json` em todas as rotas, exceto a de
  importação de XML, que recebe `multipart/form-data` (é um upload de
  arquivo).
- **Autenticação:** nenhuma nesta fase — todas as rotas são de acesso
  livre, conforme já registrado como fora de escopo em `requisitos.md`.
- **CORS:** o backend libera explicitamente a origem do frontend, como já
  observado em `visao-geral.md` (seção 7) — não é tratado aqui por ser
  configuração de infraestrutura, não parte do contrato da API em si.

---

## 2. Recursos e endpoints

### 2.1 `GET /api/v1/inventarios`
Lista o histórico de inventários (RF20).

**Query params:**
| Nome | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `status` | string (`rascunho` \| `fechado`) | não | Filtra por status. Se omitido, retorna só os `fechado` (é o que a aba Histórico mostra hoje). |
| `pagina` | inteiro | não | Padrão `1`. **[decisão nova — ver seção 8]** |
| `tamanho_pagina` | inteiro | não | Padrão `30`. **[decisão nova — ver seção 8]** |

**Resposta — `200 OK`:**
```json
{
  "total": 42,
  "pagina": 1,
  "tamanho_pagina": 30,
  "resultados": [
    {
      "data": "2026-07-17",
      "status": "fechado",
      "fechado_em": "2026-07-17T18:42:03-03:00",
      "resumo": { "falta": 2, "sobra": 1, "correto": 18 }
    }
  ]
}
```
O `resumo` já vem somado (óleos + peças), do mesmo jeito que a aba
Histórico do protótipo mostra hoje (RN25).

---

### 2.2 `GET /api/v1/inventarios/{data}`
Retorna o inventário completo de uma data — óleos/graxas e peças juntos
(RF01, RF10, RF21).

**Path params:** `data` (`AAAA-MM-DD`).

**Comportamento quando a data não tem nenhum registro ainda:** esta rota
**nunca cria dados** — ela é só leitura, mesmo que a data não exista em
`inventarios`. Nesse caso, o backend monta uma resposta "prévia", calculada
na hora: o catálogo fixo de óleos/graxas, com a quantidade de sistema já
semeada a partir do último inventário fechado (RN27), tudo com quantidade
física zerada e sem nenhuma peça — sinalizando isso com
`"status": "nao_iniciado"` (um terceiro valor de status que só existe
nesta resposta da API, não é gravado no banco — ver seção 7).
**[decisão nova]**

**Resposta — `200 OK`:**
```json
{
  "data": "2026-07-17",
  "status": "fechado",
  "fechado_em": "2026-07-17T18:42:03-03:00",
  "resumo_oleos": { "falta": 1, "sobra": 0, "correto": 10 },
  "resumo_pecas": { "falta": 1, "sobra": 1, "correto": 20 },
  "oleos": [
    {
      "item_id": 12,
      "codigo": "45-2003048",
      "descricao": "STO SINTÉTICO 80W90",
      "categoria": "oleo",
      "possui_quebra_estoque_oficina": true,
      "estoque": 40,
      "oficina": 5,
      "quantidade_fisica": 45,
      "quantidade_sistema": 45,
      "diferenca": 0,
      "status": "correto",
      "observacao": null
    },
    {
      "item_id": 19,
      "codigo": "45-2428584",
      "descricao": "GRAXA CARDAN",
      "categoria": "graxa",
      "possui_quebra_estoque_oficina": false,
      "quantidade_fisica": 8,
      "quantidade_sistema": 10,
      "diferenca": -2,
      "status": "falta",
      "observacao": "Conferir tambor aberto"
    }
  ],
  "pecas": [
    {
      "item_id": 245,
      "codigo": "1-2095029",
      "descricao": "FILTRO DE AR DA CABINA",
      "categoria": "peca",
      "unidade": "PC",
      "localizacao": "01.01.D",
      "quantidade_fisica": 3,
      "quantidade_sistema": 3,
      "diferenca": 0,
      "status": "correto",
      "observacao": null
    }
  ]
}
```
Note que o objeto de óleo (`possui_quebra_estoque_oficina: true`) traz
`estoque` e `oficina`; a graxa (`false`) não traz esses dois campos —
segue exatamente a RN05/RN08.

**Erros:**
| Código | Quando |
|---|---|
| `400` | `data` fora do formato `AAAA-MM-DD` |

---

### 2.3 `PATCH /api/v1/inventarios/{data}/itens/{item_id}`
Atualiza um único item do inventário do dia — óleo, graxa ou peça (RF01,
RF02, RF03, RF06, RF10). É a rota usada tanto pelo autosave da aba
Contagem quanto pelo da aba Inventários.

**Path params:** `data` (`AAAA-MM-DD`), `item_id` (inteiro, id do
catálogo `itens`).

**Corpo da requisição — para um óleo (`possui_quebra_estoque_oficina =
true`):**
```json
{
  "estoque": 40,
  "oficina": 5,
  "observacao": "Tambor novo aberto"
}
```

**Corpo da requisição — para graxa ou peça:**
```json
{
  "quantidade_fisica": 3,
  "observacao": null
}
```

Todos os campos do corpo são opcionais individualmente (só envia o que
mudou), mas o frontend deve seguir a RNF11 e agrupar as mudanças recentes
de um mesmo item numa única chamada, em vez de uma requisição por tecla.

**Efeito colateral importante:** esta é a rota que efetivamente **cria** a
linha de `inventarios` (com `status = 'rascunho'`) e a linha de
`inventario_itens`, na primeira alteração do dia — RN16. Diferente do
`GET` (que nunca escreve), o `PATCH` é a única rota, além da importação de
XML, que tem permissão de criar essas linhas.

**Resposta — `200 OK`:** o item já atualizado, no mesmo formato usado
dentro de `oleos`/`pecas` do endpoint 2.2 — incluindo `diferenca` e
`status` já recalculados.

**Erros:**
| Código | Quando |
|---|---|
| `400` | `data` fora do formato, ou corpo com tipo errado (ex: string onde se espera número) |
| `404` | `item_id` não existe no catálogo `itens` |
| `422` | Quantidade negativa, ou tentativa de enviar `estoque`/`oficina` para um item que não tem `possui_quebra_estoque_oficina = true` (RNF08) |

---

### 2.4 `POST /api/v1/inventarios/{data}/importar-xml`
Importa o arquivo XML do dia (RF07 a RF15). O passo a passo completo de
processamento (extração, cruzamento de códigos, merge, transação) já está
detalhado em `fluxo-de-telas.md` — aqui documento só o contrato de entrada
e saída.

**Path params:** `data` (`AAAA-MM-DD`).

**Corpo da requisição:** `multipart/form-data`, campo `arquivo` contendo o
XML.

**Resposta — `200 OK`:**
```json
{
  "arquivo": "ConferenciaPorLocacao.xml",
  "processado_em": "2026-07-17T08:15:00-03:00",
  "oleos_atualizados": 7,
  "pecas_novas": 12,
  "pecas_atualizadas": 31,
  "codigos_duplicados": ["1-2095029"]
}
```

**Erros:**
| Código | Quando |
|---|---|
| `400` | Nenhum arquivo enviado, ou campo `arquivo` ausente do form |
| `422` | Arquivo enviado não é um XML válido/bem formado (RNF08) |
| `500` | Falha inesperada durante o processamento — nesse caso, a transação inteira é desfeita (nenhuma alteração parcial fica gravada) |

---

### 2.5 `POST /api/v1/inventarios/{data}/fechar`
Fecha (ou re-fecha) o inventário do dia — o botão "Salvar contagem do dia"
(RF18, RF19, RN17 a RN20).

**Path params:** `data` (`AAAA-MM-DD`).

**Corpo da requisição:** vazio — a confirmação ("já existe uma contagem
salva, deseja substituir?") é responsabilidade do `ConfirmDialog` no
frontend, antes mesmo de chamar essa rota (RN19); o backend não pede
confirmação adicional.

**Resposta — `200 OK`:**
```json
{
  "data": "2026-07-17",
  "status": "fechado",
  "fechado_em": "2026-07-17T18:42:03-03:00"
}
```
O `fechado_em` retornado é sempre o do **primeiro** fechamento (RN18) —
mesmo que essa chamada seja um re-fechamento depois de uma correção.

**Erros:**
| Código | Quando |
|---|---|
| `404` | Não existe nenhuma linha de `inventarios` para essa data ainda (nada foi digitado/importado) — não há o que fechar |

---

### 2.6 `DELETE /api/v1/inventarios/{data}/itens`
"Nova contagem" — limpa os dados de entrada do dia selecionado (RF22,
RN21), sem afetar outros dias.

**Path params:** `data` (`AAAA-MM-DD`).

**Comportamento (reflete a correção da RN27 aplicada no protótipo):** esta
rota **não é uma exclusão geral**. Ela trata óleos/graxas e peças de forma
diferente:
- **Óleos e graxas:** zera `quantidade_fisica` (e `estoque`/`oficina`,
  quando aplicável) e `observacao` — mas **mantém** `quantidade_sistema`
  como estava, exatamente pelo motivo já documentado na RN27. As linhas de
  `inventario_itens` desses itens não são apagadas, só têm os campos
  físicos zerados.
- **Peças:** as linhas de `inventario_itens` desses itens **são apagadas**
  por completo — já que a lista de peças do dia é sempre reconstruída pela
  próxima importação de XML (RN12).

**Resposta — `200 OK`:** o inventário já limpo, no mesmo formato do
endpoint 2.2 (óleos com sistema mantido e físico zerado; `pecas: []`).

**Erros:**
| Código | Quando |
|---|---|
| `404` | Não existe nenhuma linha de `inventarios` para essa data (nada para limpar) |

---

### 2.7 `GET /api/v1/inventarios/{data}/importacoes`
Lista o histórico de importações de XML feitas num dia — preenche a parte
do RF15 ("para fins de consulta futura") que ainda não tinha uma rota
própria nos documentos anteriores. **[decisão nova — endpoint adicionado
neste documento]**

**Path params:** `data` (`AAAA-MM-DD`).

**Resposta — `200 OK`:**
```json
[
  {
    "arquivo": "ConferenciaPorLocacao.xml",
    "processado_em": "2026-07-17T08:15:00-03:00",
    "oleos_atualizados": 7,
    "pecas_novas": 12,
    "pecas_atualizadas": 31,
    "codigos_duplicados": []
  },
  {
    "arquivo": "ConferenciaPorLocacao (1).xml",
    "processado_em": "2026-07-17T14:02:11-03:00",
    "oleos_atualizados": 2,
    "pecas_novas": 3,
    "pecas_atualizadas": 5,
    "codigos_duplicados": ["9-2285273"]
  }
]
```
Retorna lista vazia (`[]`) se nenhuma importação foi feita no dia — não é
erro.

---

## 3. Esquemas de dados (referência rápida)

### `ItemOleoOuGraxa`
| Campo | Tipo | Observação |
|---|---|---|
| `item_id` | inteiro | id em `itens` |
| `codigo` | string | RN04 |
| `descricao` | string | |
| `categoria` | `"oleo"` \| `"graxa"` | |
| `possui_quebra_estoque_oficina` | booleano | decide se `estoque`/`oficina` aparecem |
| `estoque` | inteiro | só quando `possui_quebra_estoque_oficina = true` |
| `oficina` | inteiro | só quando `possui_quebra_estoque_oficina = true` |
| `quantidade_fisica` | inteiro | soma de `estoque + oficina`, ou valor direto para graxa (RN07/RN08) |
| `quantidade_sistema` | inteiro | RN27 |
| `diferenca` | inteiro | `quantidade_fisica - quantidade_sistema` (RN01) — sempre calculado pelo backend, nunca aceito como entrada |
| `status` | `"correto"` \| `"sobra"` \| `"falta"` | RN02 — sempre calculado |
| `observacao` | string \| `null` | RF06 |

### `ItemPeca`
| Campo | Tipo | Observação |
|---|---|---|
| `item_id` | inteiro | |
| `codigo` | string | |
| `descricao` | string | |
| `categoria` | `"peca"` | |
| `unidade` | string | vindo do `Coluna4` do XML |
| `localizacao` | string \| `null` | vindo do `Coluna1` do XML |
| `quantidade_fisica` | inteiro | preenchido manualmente |
| `quantidade_sistema` | inteiro | vindo do XML |
| `diferenca` | inteiro | calculado |
| `status` | `"correto"` \| `"sobra"` \| `"falta"` | calculado |
| `observacao` | string \| `null` | |

### `ResumoStatus`
```json
{ "falta": 0, "sobra": 0, "correto": 0 }
```

---

## 4. Erros — formato padrão

Toda resposta de erro segue o mesmo envelope, independentemente da rota:
```json
{
  "erro": {
    "codigo": "quantidade_invalida",
    "mensagem": "A quantidade física não pode ser negativa."
  }
}
```
**[decisão nova]** — `codigo` é uma string estável (para o frontend tomar
decisões programaticamente, se precisar), `mensagem` é o texto pensado para
aparecer num `AlertDialog`.

| HTTP status | Uso geral |
|---|---|
| `200` | Sucesso |
| `400` | Requisição malformada (formato de data errado, campo com tipo errado) |
| `404` | Recurso não encontrado (item, ou dia inexistente onde a rota exige que já exista) |
| `422` | Regra de negócio violada (quantidade negativa, XML malformado, campo incompatível com a categoria do item) |
| `500` | Erro inesperado do servidor |

---

## 5. Relação entre endpoints e regras de negócio

| Endpoint | Regras aplicadas |
|---|---|
| `GET /inventarios` | RN25 |
| `GET /inventarios/{data}` | RN16, RN27 (na resposta "prévia") |
| `PATCH /inventarios/{data}/itens/{item_id}` | RN01, RN02, RN07, RN08, RN09, RN16 |
| `POST /inventarios/{data}/importar-xml` | RN04, RN10 a RN15, RN27 |
| `POST /inventarios/{data}/fechar` | RN17, RN18, RN19, RN20 |
| `DELETE /inventarios/{data}/itens` | RN21, RN27 |
| `GET /inventarios/{data}/importacoes` | RN15 |

---

## 6. O que fica de fora desta documentação

- **Contratos de erro de validação campo a campo** (ex: schema completo do
  Pydantic com todas as mensagens possíveis) — fica para quando o código
  for escrito de fato, aqui documentei os casos que já sabemos que existem.
- **Exemplos de chamada via `curl`/Postman** — podem ser gerados
  automaticamente pelo próprio FastAPI (Swagger/OpenAPI) uma vez que as
  rotas existam; não faz sentido manter isso manualmente num documento
  Markdown à parte.

---

## 7. Decisões novas tomadas neste documento

Nenhuma dessas contraria algo já definido — são só lacunas que os
documentos anteriores deixaram em aberto e que precisavam de uma resposta
para o contrato da API fechar:

1. **Versionamento da API** (`/api/v1`) — não tinha sido discutido antes.
2. **`snake_case` nos campos JSON** — segue a convenção do FastAPI/Pydantic;
   nunca foi decidido explicitamente antes.
3. **Status `"nao_iniciado"` na resposta do `GET /inventarios/{data}`** —
   necessário para o `GET` poder ser sempre somente-leitura (RN16), sem
   inventar um terceiro status real no banco (que continua só com
   `rascunho`/`fechado`, como já definido em `rascunho-inventario.md`).
4. **Paginação em `GET /inventarios`** — os documentos anteriores não
   mencionavam limite de itens no histórico; adicionei `pagina` e
   `tamanho_pagina` como parâmetros opcionais, pensando no histórico
   crescendo ao longo dos meses/anos de uso.
5. **Endpoint `GET /inventarios/{data}/importacoes`** — não existia na
   tabela original do `visao-geral.md`; adicionado para o RF15 ("consulta
   futura" das importações) ter, de fato, uma rota que o atenda.
6. **Formato padrão de erro** (`{ "erro": { "codigo", "mensagem" } }`) —
   não tinha sido especificado antes.

Se alguma dessas decisões não fizer sentido pra você, é só avisar que eu
ajusto antes de virarem parte definitiva da documentação.

---

## 8. Pontos em aberto

- **Tamanho de página padrão do histórico** (usei `30` como sugestão) —
  pode ser ajustado quando soubermos o volume real de uso.
- **Rate limiting / limite de tamanho do arquivo XML** — não foi definido
  um limite máximo de tamanho para o upload; hoje o protótipo não tem essa
  restrição.
- **Internacionalização de mensagens de erro** — como o `requisitos.md` já
  deixa claro que o sistema é só em português nesta fase, as mensagens de
  `erro.mensagem` foram pensadas diretamente em português, sem estrutura de
  tradução.
