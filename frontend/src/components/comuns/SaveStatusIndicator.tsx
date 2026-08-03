export type SaveStatusIndicatorEstado = "ocioso" | "salvando" | "salvo" | "erro";

interface SaveStatusIndicatorProps {
  estado: SaveStatusIndicatorEstado;
  /** Horário já formatado (ex: "10:42"), exibido apenas quando `estado === 'salvo'`. */
  horario?: string | null;
}

/**
 * Texto pequeno de status de autosave ("Salvando...", "Rascunho salvo às
 * 10:42", "Não foi possível salvar"), refletindo o resultado real da última
 * chamada HTTP de PATCH — nunca um `setTimeout` fake (RNF06).
 */
export default function SaveStatusIndicator({ estado, horario }: SaveStatusIndicatorProps) {
  if (estado === "ocioso") {
    return null;
  }

  const mensagem =
    estado === "salvando"
      ? "Salvando rascunho..."
      : estado === "salvo"
      ? `Rascunho salvo${horario ? ` às ${horario}` : ""}`
      : "Não foi possível salvar o rascunho";

  return (
    <span className={`save-status-indicator save-status-${estado}`} role="status">
      {mensagem}
    </span>
  );
}
