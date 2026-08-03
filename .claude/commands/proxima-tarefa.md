---
description: Avança o backlog em SPRINTS.md — identifica a próxima tarefa não concluída e delega a implementação ao subagente apropriado.
---

Use o subagente `sprint-runner` para:

1. Ler `SPRINTS.md` e identificar a próxima tarefa não concluída,
   respeitando a ordem de dependência entre sprints.
2. Delegar a implementação ao `backend-dev` ou `frontend-dev`, conforme a
   camada da tarefa.
3. Verificar o resultado antes de marcar o checkbox como concluído.
4. Atualizar `SPRINTS.md` e reportar um resumo do que foi feito, incluindo
   qualquer pergunta pendente antes de continuar.

Se houver mais de uma tarefa elegível no mesmo sprint (ex: uma de backend
e uma de frontend sem dependência entre si), pode delegar as duas antes de
reportar.
