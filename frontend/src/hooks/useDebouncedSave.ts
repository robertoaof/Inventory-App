import { useCallback, useEffect, useRef, useState } from "react";

export type SaveStatus = "ocioso" | "salvando" | "salvo" | "erro";

interface PendingEntry<T> {
  payload: Partial<T>;
  timer: ReturnType<typeof setTimeout>;
}

export interface UseDebouncedSaveResult<T> {
  /** Agenda (ou reagenda) o salvamento de `patch` para a chave informada. */
  schedule: (key: string | number, patch: Partial<T>) => void;
  /** Força o envio imediato do que estiver pendente para uma chave, sem esperar o debounce. */
  flush: (key: string | number) => void;
  status: SaveStatus;
  erro: string | null;
  ultimoSalvoEm: Date | null;
}

/**
 * Hook genérico de autosave com debounce (~500ms), agrupado por chave
 * (RNF11 / docs/rascunho-inventario.md seção 4).
 *
 * Cada chave (tipicamente um `item_id`) acumula as mudanças recentes num
 * único objeto e dispara **uma única chamada** de `saveFn` quando a pessoa
 * para de digitar — nunca uma requisição por tecla, e nunca uma requisição
 * por campo alterado (estoque, oficina e observação de um mesmo item viram
 * uma chamada só, se digitados dentro da mesma janela de debounce).
 *
 * Pensado para ser reaproveitado por qualquer tela com autosave por item:
 * hoje usado por `useInventarioDoDia` (óleos/graxas da aba Contagem), e já
 * pronto para o futuro `PecaListItem` (Sprint 4) sem precisar reimplementar
 * o debounce.
 */
export function useDebouncedSave<T extends object>(
  saveFn: (key: string | number, payload: T) => Promise<unknown>,
  delayMs = 500
): UseDebouncedSaveResult<T> {
  const [status, setStatus] = useState<SaveStatus>("ocioso");
  const [erro, setErro] = useState<string | null>(null);
  const [ultimoSalvoEm, setUltimoSalvoEm] = useState<Date | null>(null);

  const pendingRef = useRef<Map<string | number, PendingEntry<T>>>(new Map());
  const saveFnRef = useRef(saveFn);
  saveFnRef.current = saveFn;

  const flush = useCallback((key: string | number) => {
    const entry = pendingRef.current.get(key);
    if (!entry) return;

    clearTimeout(entry.timer);
    pendingRef.current.delete(key);

    if (Object.keys(entry.payload).length === 0) return;

    setStatus("salvando");
    saveFnRef
      .current(key, entry.payload as T)
      .then(() => {
        setStatus("salvo");
        setErro(null);
        setUltimoSalvoEm(new Date());
      })
      .catch((e: unknown) => {
        setStatus("erro");
        setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
      });
  }, []);

  const schedule = useCallback(
    (key: string | number, patch: Partial<T>) => {
      const existing = pendingRef.current.get(key);
      const mergedPayload = {
        ...(existing?.payload ?? {}),
        ...patch,
      } as Partial<T>;

      if (existing) {
        clearTimeout(existing.timer);
      }

      const timer = setTimeout(() => flush(key), delayMs);
      pendingRef.current.set(key, { payload: mergedPayload, timer });
      setStatus("salvando");
    },
    [delayMs, flush]
  );

  // Limpa timers pendentes ao desmontar, para não chamar setState depois
  // que o componente que usa o hook já saiu de tela.
  useEffect(() => {
    const pending = pendingRef.current;
    return () => {
      pending.forEach((entry) => clearTimeout(entry.timer));
      pending.clear();
    };
  }, []);

  return { schedule, flush, status, erro, ultimoSalvoEm };
}
