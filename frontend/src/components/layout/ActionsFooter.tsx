interface ActionsFooterProps {
  onSave: () => void;
  onNewCount: () => void;
  saving: boolean;
}

export default function ActionsFooter({ onSave, onNewCount, saving }: ActionsFooterProps) {
  return (
    <footer className="actions-footer">
      <button type="button" onClick={onNewCount} disabled={saving}>
        Nova contagem
      </button>
      <button type="button" onClick={onSave} disabled={saving}>
        {saving ? "Salvando..." : "Salvar contagem do dia"}
      </button>
    </footer>
  );
}
