interface EditingBannerProps {
  /** Data (AAAA-MM-DD) da contagem já fechada sendo editada, ou `null` para não exibir. */
  dataEditando: string | null;
  onCancelar: () => void;
}

function formatarDataBR(data: string): string {
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

/**
 * Aviso de que o usuário está mexendo numa contagem já fechada (RN19: um dia
 * fechado pode ser reaberto e corrigido). Só aparece quando o dia da tela
 * está com status `fechado`.
 */
export default function EditingBanner({ dataEditando, onCancelar }: EditingBannerProps) {
  if (!dataEditando) return null;

  return (
    <div className="editing-banner" role="status">
      <span>Editando contagem já salva de {formatarDataBR(dataEditando)}</span>
      <button type="button" onClick={onCancelar}>
        Cancelar edição
      </button>
    </div>
  );
}
