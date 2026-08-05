import { useEffect, useRef } from "react";

interface ConfirmDialogProps {
  aberto: boolean;
  mensagem: string;
  onConfirmar: () => void;
  onCancelar: () => void;
}

/**
 * Substitui o `confirm()` nativo do navegador (RNF02). Acessibilidade
 * básica (não é uma auditoria WCAG completa, é o mínimo razoável para um
 * modal de confirmação):
 * - `role="alertdialog"` + `aria-modal="true"` no elemento raiz — é um
 *   diálogo que interrompe o fluxo pedindo uma decisão, então
 *   `alertdialog` é mais apropriado que `dialog` genérico.
 * - `aria-describedby` aponta para a mensagem (não há título separado
 *   neste componente — só uma pergunta de texto corrido).
 * - Foco vai para o botão "Cancelar" ao abrir (ação mais segura/reversível
 *   — evita confirmar uma ação destrutiva sem querer com um Enter
 *   acidental logo após o modal aparecer).
 * - `Escape` fecha o modal chamando `onCancelar`, igual clicar em
 *   "Cancelar".
 * - Focus trap simples (Tab/Shift+Tab não escapam do modal) enquanto ele
 *   estiver aberto, e o overlay não tem nenhum elemento focável, então não
 *   precisa de tratamento à parte.
 */
export default function ConfirmDialog({
  aberto,
  mensagem,
  onConfirmar,
  onCancelar,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelarRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!aberto) return;
    cancelarRef.current?.focus();
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancelar();
        return;
      }

      if (event.key !== "Tab") return;

      const focaveis = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focaveis || focaveis.length === 0) return;

      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];

      if (event.shiftKey && document.activeElement === primeiro) {
        event.preventDefault();
        ultimo.focus();
      } else if (!event.shiftKey && document.activeElement === ultimo) {
        event.preventDefault();
        primeiro.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [aberto, onCancelar]);

  if (!aberto) return null;

  return (
    <div className="dialog-overlay">
      <div
        className="dialog"
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-describedby="confirm-dialog-mensagem"
      >
        <p id="confirm-dialog-mensagem">{mensagem}</p>
        <div className="dialog-actions">
          <button type="button" ref={cancelarRef} onClick={onCancelar}>
            Cancelar
          </button>
          <button type="button" onClick={onConfirmar}>
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
