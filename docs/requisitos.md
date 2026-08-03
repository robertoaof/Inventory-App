# Requisitos do Sistema — Inventário de Óleo e Peças (Scania)

Este documento reúne, de forma organizada, os requisitos funcionais (o que o
sistema deve fazer) e não funcionais (com que qualidade/condições ele deve
fazer isso), consolidando tudo que já foi definido no protótipo e nos
documentos `visao-geral.md`, `banco-de-dados.md` e `rascunho-inventario.md`.

---

## 1. Requisitos Funcionais (RF)

### 1.1 Contagem de óleos e graxas

- **RF01** — O sistema deve permitir registrar, para cada um dos 9 óleos e
  2 graxas do catálogo fixo, a quantidade física e a quantidade de sistema
  referentes ao dia corrente.
- **RF02** — Para os itens que possuem quebra de estoque (os 9 óleos), o
  sistema deve permitir lançar separadamente a quantidade em "tambores e
  contêineres" e a quantidade nas "bombas da oficina", somando as duas
  automaticamente para compor a quantidade física total.
- **RF03** — Para as graxas, o sistema deve permitir lançar diretamente uma
  única quantidade física, sem quebra.
- **RF04** — O sistema deve calcular automaticamente a diferença entre
  quantidade física e quantidade de sistema, e classificar cada item como
  **correto** (diferença zero), **sobra** (diferença positiva) ou **falta**
  (diferença negativa).
- **RF05** — O sistema deve exibir um resumo com a quantidade de itens em
  cada status (correto/sobra/falta) na aba de Contagem.
- **RF06** — O sistema deve permitir registrar uma observação textual livre
  por item.
- **RF25** — A quantidade física de cada óleo/graxa deve reiniciar a cada
  novo dia de inventário; a quantidade de sistema deve manter o último
  valor conhecido de um dia para o outro, sendo atualizada apenas por
  importação de XML (RF09) ou edição manual — nunca reiniciada
  automaticamente ao começar um novo dia.

### 1.2 Importação de XML e aba Inventários (peças)

- **RF07** — O sistema deve permitir importar um arquivo XML no formato do
  relatório "Conferência por Locação", gerado pelo sistema da
  concessionária.
- **RF08** — Ao importar, o sistema deve identificar, pelo código do item
  (mesmo código usado no catálogo interno), quais itens do XML já
  pertencem ao catálogo fixo de óleos/graxas.
- **RF09** — Para itens do XML já pertencentes ao catálogo fixo, o sistema
  deve apenas atualizar a quantidade de sistema na aba Contagem,
  **sem duplicar** o item.
- **RF10** — Para itens do XML que não pertencem ao catálogo fixo, o
  sistema deve exibi-los como uma lista na aba Inventários, com a
  quantidade de sistema vinda do XML e a quantidade física a ser
  preenchida manualmente.
- **RF11** — Ao reimportar um XML no mesmo dia, o sistema deve mesclar os
  dados: itens já existentes têm a quantidade de sistema/descrição
  atualizada, preservando a quantidade física já preenchida manualmente;
  itens novos são adicionados.
- **RF12** — O sistema deve avisar o usuário quando um mesmo código aparecer
  mais de uma vez dentro do arquivo XML importado, informando qual valor
  foi utilizado.
- **RF13** — O sistema deve permitir buscar/filtrar os itens da aba
  Inventários por código ou descrição.
- **RF14** — O sistema deve exibir, na aba Inventários, o mesmo tipo de
  resumo por status (correto/sobra/falta) já existente na aba Contagem.
- **RF15** — O sistema deve manter um registro de cada importação de XML
  realizada (nome do arquivo, data/hora, quantidade de itens novos e
  atualizados), para fins de consulta futura.

### 1.3 Persistência e histórico

- **RF16** — O sistema deve utilizar uma única data de referência,
  compartilhada entre as abas Contagem e Inventários, representando o
  inventário do dia.
- **RF17** — O sistema deve salvar automaticamente o progresso do usuário
  (rascunho) conforme ele digita, sem exigir uma ação explícita a cada
  campo alterado.
- **RF18** — O sistema deve permitir, através de uma única ação ("Salvar
  contagem do dia"), fechar/confirmar o inventário do dia, contemplando
  tanto os óleos/graxas quanto as peças importadas.
- **RF19** — Ao tentar fechar um dia que já possui uma contagem
  previamente fechada, o sistema deve solicitar confirmação antes de
  sobrescrever.
- **RF20** — O sistema deve permitir consultar um histórico de dias já
  fechados, exibido em ordem cronológica (mais recente primeiro), com um
  resumo rápido do status de cada dia.
- **RF21** — O sistema deve permitir abrir um dia do histórico para
  consulta e, se necessário, corrigir valores e salvar novamente.
- **RF22** — O sistema deve permitir iniciar uma nova contagem, limpando os
  valores preenchidos no dia corrente sem afetar dias já salvos
  anteriormente.

### 1.4 Identidade visual e usabilidade

- **RF23** — O sistema deve exibir o logo da concessionária Scania na
  interface principal.
- **RF24** — O sistema deve exibir, para cada item, um indicador visual
  (selo/badge) de status colorido (correto/sobra/falta), consistente entre
  todas as abas.

---

## 2. Requisitos Não Funcionais (RNF)

### 2.1 Usabilidade

- **RNF01** — A interface deve manter um tema visual único e consistente
  em todas as telas (paleta escura de tema industrial, mesmas cores para
  cada status, mesma tipografia).
- **RNF02** — O sistema não deve depender de caixas de diálogo nativas do
  navegador (`confirm`/`alert`) para confirmações e avisos — deve utilizar
  componentes próprios de interface, já que caixas nativas podem ser
  bloqueadas dependendo do ambiente de execução.
- **RNF03** — Listas com muitos itens (aba Inventários) devem permanecer
  utilizáveis e legíveis, com suporte a busca para localizar itens
  rapidamente.

### 2.2 Confiabilidade e integridade de dados

- **RNF04** — Não pode existir mais de um inventário fechado para a mesma
  data (garantido por restrição de unicidade no banco de dados).
- **RNF05** — Um mesmo item não pode aparecer duplicado dentro do
  inventário de um mesmo dia (garantido por restrição de unicidade no
  banco de dados).
- **RNF06** — O progresso do usuário não deve ser perdido em caso de
  fechamento inesperado do navegador ou queda de conexão antes de o dia
  ser salvo/fechado (ver estratégia de rascunho em
  `rascunho-inventario.md`).
- **RNF07** — O cálculo de diferença e status (correto/sobra/falta) deve
  ser consistente entre o que é exibido na tela e o que está armazenado no
  banco, sem depender de recálculo manual.

### 2.3 Segurança

- **RNF08** — Os dados recebidos pelo backend (arquivo XML, quantidades
  informadas manualmente) devem ser validados antes da gravação no banco,
  independentemente de qualquer validação já feita no frontend.
- **RNF09** — Itens do catálogo que deixarem de ser utilizados devem ser
  desativados (não excluídos), preservando o histórico de inventários que
  os referenciam.

### 2.4 Desempenho

- **RNF10** — A edição de campos (quantidade física, sistema, observação)
  deve refletir na tela e no cálculo de status sem atraso perceptível ao
  usuário.
- **RNF11** — O envio de alterações para persistência deve ser agrupado
  (uma requisição por item alterado, não por campo/tecla), reduzindo o
  número de chamadas ao backend durante a digitação.

### 2.5 Manutenibilidade

- **RNF12** — As regras de negócio (identificação de itens duplicados,
  mesclagem de reimportação de XML, cálculo de status) devem residir no
  backend, centralizadas, evitando duplicação da mesma regra entre
  frontend e backend.
- **RNF13** — Alterações na estrutura do banco de dados devem ser
  versionadas por meio de migrações (ex: Alembic), não aplicadas
  manualmente em produção.

### 2.6 Portabilidade e disponibilidade

- **RNF14** — O sistema deve poder ser executado tanto em rede local
  (dentro da concessionária) quanto hospedado remotamente, exigindo apenas
  mudança de configuração, não de código.
- **RNF15** — Por se tratar, nesta fase, de uma ferramenta de uso diário
  por um único usuário, não há exigência de alta disponibilidade
  (redundância, failover). Uma interrupção pontual do serviço é aceitável,
  desde que não haja perda de dados já persistidos.

### 2.7 Auditabilidade

- **RNF16** — O sistema deve manter rastreabilidade de quando cada
  importação de XML ocorreu e o que ela alterou (itens novos, atualizados,
  códigos duplicados encontrados).
- **RNF17** — O sistema deve manter o registro de quando um dia foi
  efetivamente fechado pela primeira vez, mesmo que seja reaberto e salvo
  novamente depois.

---

## 3. Fora do escopo (nesta fase)

Para deixar explícito o que **não** está sendo considerado agora, mas pode
vir a ser em versões futuras:

- Autenticação e múltiplos usuários (o sistema é de uso único nesta fase).
- Suporte a múltiplos idiomas (interface apenas em português).
- Alta disponibilidade / redundância de infraestrutura.
- Notificações automáticas (e-mail, alertas externos) sobre itens
  faltando/sobrando.
- Geração de relatórios em PDF/Excel a partir do histórico.

Esses pontos não são regras — são apenas o registro do que ficou de fora
conscientemente, para não serem esquecidos caso um dia sejam solicitados.
