interface ConfirmDialogProps {
  aberto: boolean;
  mensagem: string;
  onConfirmar: () => void;
  onCancelar: () => void;
}

export default function ConfirmDialog({ aberto, mensagem, onConfirmar, onCancelar }: ConfirmDialogProps) {
  if (!aberto) return null;

  return (
    <div className="dialog-overlay">
      <div className="dialog">
        <p>{mensagem}</p>
        <div className="dialog-actions">
          <button type="button" onClick={onCancelar}>
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
