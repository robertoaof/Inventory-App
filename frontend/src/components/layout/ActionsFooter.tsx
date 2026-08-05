import PrintInventoryButton from "../impressao/PrintInventoryButton";
import type { InventarioDoDia } from "../../api/inventarios";

interface ActionsFooterProps {
  onSave: () => void;
  onNewCount: () => void;
  saving: boolean;
  /** Data do dia atual, repassada ao `PrintInventoryButton` (RF16). */
  data: string;
  /** Inventário já carregado pela página, reaproveitado pela impressão. */
  inventario?: InventarioDoDia | null;
}

/**
 * Botões "Nova contagem" / "Salvar contagem do dia", reaproveitados entre
 * Contagem e Inventários (docs/componentes-react.md). Também abriga o
 * `PrintInventoryButton` (seção 7 do mesmo documento) — ele aparece nas
 * duas mesmas telas que usam este rodapé, então nasce aqui em vez de ser
 * duplicado em cada página, garantindo consistência visual (RNF01).
 */
export default function ActionsFooter({
  onSave,
  onNewCount,
  saving,
  data,
  inventario,
}: ActionsFooterProps) {
  return (
    <footer className="actions-footer">
      <div className="actions-footer-principal">
        <button type="button" onClick={onNewCount} disabled={saving}>
          Nova contagem
        </button>
        <button type="button" onClick={onSave} disabled={saving}>
          {saving ? "Salvando..." : "Salvar contagem do dia"}
        </button>
      </div>

      <PrintInventoryButton data={data} inventario={inventario} />
    </footer>
  );
}
