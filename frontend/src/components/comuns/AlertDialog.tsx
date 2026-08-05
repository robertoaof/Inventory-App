import { useEffect, useRef } from "react";

interface AlertDialogProps {
  aberto: boolean;
  mensagem: string;
  onFechar: () => void;
}

/**
 * Substitui o `alert()` nativo do navegador (RNF02). Acessibilidade básica
 * (mesmo raciocínio do `ConfirmDialog`):
 * - `role="alertdialog"` — é semanticamente mais apropriado que `dialog`
 *   genérico por ser uma notificação (é literalmente o papel sugerido na
 *   tarefa), mesmo só tendo um botão de saída.
 * - `aria-describedby` aponta para a mensagem.
 * - Foco vai para o único botão ("Fechar") ao abrir.
 * - `Escape` fecha o modal, chamando `onFechar`.
 * - Focus trap simples: como só há um elemento focável (o botão), Tab e
 *   Shift+Tab simplesmente mantêm o foco nele — sem precisar de lógica de
 *   "primeiro/último" elemento diferente.
 */
export default function AlertDialog({ aberto, mensagem, onFechar }: AlertDialogProps) {
  const fecharRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!aberto) return;
    fecharRef.current?.focus();
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onFechar();
        return;
      }

      // Focus trap: só existe um elemento focável neste modal, então
      // qualquer Tab/Shift+Tab deve mantê-lo em foco.
      if (event.key === "Tab") {
        event.preventDefault();
        fecharRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [aberto, onFechar]);

  if (!aberto) return null;

  return (
    <div className="dialog-overlay">
      <div className="dialog" role="alertdialog" aria-modal="true" aria-describedby="alert-dialog-mensagem">
        <p id="alert-dialog-mensagem">{mensagem}</p>
        <button type="button" ref={fecharRef} onClick={onFechar}>
          Fechar
        </button>
      </div>
    </div>
  );
}
