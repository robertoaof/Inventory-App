import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  getInventarioDoDia,
  patchItem,
  type InventarioDoDia,
  type ItemOleoOuGraxa,
  type ItemPeca,
  type PatchItemPayload,
} from "../api/inventarios";
import { useDebouncedSave, type SaveStatus } from "./useDebouncedSave";

export interface UseInventarioDoDiaResult {
  inventario: InventarioDoDia | null;
  carregando: boolean;
  erroCarregamento: string | null;
  /** Atualiza um item localmente (feedback imediato) e agenda o autosave (RNF11). */
  atualizarItem: (itemId: number, patch: PatchItemPayload) => void;
  /** Refaz o GET do dia — útil após "Nova contagem"/"Salvar contagem do dia". */
  recarregar: () => Promise<void>;
  statusSalvamento: SaveStatus;
  erroSalvamento: string | null;
  ultimoSalvoEm: Date | null;
}

function atualizarListaLocal<TItem extends { item_id: number }>(
  lista: TItem[],
  itemId: number,
  patch: Record<string, unknown>
): TItem[] {
  return lista.map((item) => (item.item_id === itemId ? { ...item, ...patch } : item));
}

/**
 * Busca e mantém em estado o inventário completo de uma data (óleos +
 * peças), conforme GET /api/v1/inventarios/{data} (docs/document-rest-API.md
 * seção 2.2). Expõe `atualizarItem`, que aplica a mudança localmente de
 * imediato (para o campo não "travar" enquanto o autosave não responde) e
 * dispara o PATCH via debounce (docs/rascunho-inventario.md seção 4).
 *
 * `diferenca`/`status`/`quantidade_fisica` (quando somada de
 * estoque+oficina) só são atualizados de verdade quando a resposta do PATCH
 * chega — nunca recalculados aqui no frontend (regra inegociável do
 * projeto).
 */
export function useInventarioDoDia(data: string): UseInventarioDoDiaResult {
  const [inventario, setInventario] = useState<InventarioDoDia | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erroCarregamento, setErroCarregamento] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErroCarregamento(null);
    try {
      const resultado = await getInventarioDoDia(data);
      setInventario(resultado);
    } catch (e) {
      setInventario(null);
      setErroCarregamento(
        e instanceof ApiError ? e.message : "Não foi possível carregar o inventário do dia."
      );
    } finally {
      setCarregando(false);
    }
  }, [data]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const aplicarRespostaItem = useCallback((itemAtualizado: ItemOleoOuGraxa | ItemPeca) => {
    setInventario((atual) => {
      if (!atual) return atual;
      if (itemAtualizado.categoria === "peca") {
        return {
          ...atual,
          pecas: atual.pecas.map((item) =>
            item.item_id === itemAtualizado.item_id ? (itemAtualizado as ItemPeca) : item
          ),
        };
      }
      return {
        ...atual,
        oleos: atual.oleos.map((item) =>
          item.item_id === itemAtualizado.item_id ? (itemAtualizado as ItemOleoOuGraxa) : item
        ),
      };
    });
  }, []);

  const { schedule, status: statusSalvamento, erro: erroSalvamento, ultimoSalvoEm } =
    useDebouncedSave<PatchItemPayload>(async (itemId, payload) => {
      const itemAtualizado = await patchItem(data, Number(itemId), payload);
      aplicarRespostaItem(itemAtualizado);
    });

  const atualizarItem = useCallback(
    (itemId: number, patch: PatchItemPayload) => {
      // Feedback imediato na tela (o valor digitado não pode "sumir"
      // enquanto o autosave não responde — docs/rascunho-inventario.md
      // seção 4). Note que campos calculados pelo backend (quantidade_fisica
      // somada, diferenca, status) só mudam de verdade na resposta do PATCH.
      setInventario((atual) => {
        if (!atual) return atual;
        return {
          ...atual,
          oleos: atualizarListaLocal(atual.oleos, itemId, patch as Record<string, unknown>),
          pecas: atualizarListaLocal(atual.pecas, itemId, patch as Record<string, unknown>),
        };
      });

      schedule(itemId, patch);
    },
    [schedule]
  );

  return {
    inventario,
    carregando,
    erroCarregamento,
    atualizarItem,
    recarregar: carregar,
    statusSalvamento,
    erroSalvamento,
    ultimoSalvoEm,
  };
}
