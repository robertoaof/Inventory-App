interface AlertDialogProps {
  aberto: boolean;
  mensagem: string;
  onFechar: () => void;
}

export default function AlertDialog({ aberto, mensagem, onFechar }: AlertDialogProps) {
  if (!aberto) return null;

  return (
    <div className="dialog-overlay">
      <div className="dialog">
        <p>{mensagem}</p>
        <button type="button" onClick={onFechar}>
          Fechar
        </button>
      </div>
    </div>
  );
}
