import type { ResumoImportacao } from "../../api/inventarios";

interface ImportSummaryDialogProps {
  aberto: boolean;
  resumo: ResumoImportacao | null;
  onFechar: () => void;
}

/**
 * Resumo mostrado depois de uma importação (RF12, RF15). Existe separado do
 * `AlertDialog` porque o conteúdo é estruturado — números e a lista de
 * códigos duplicados (RN14) —, não uma mensagem de texto simples.
 */
export default function ImportSummaryDialog({
  aberto,
  resumo,
  onFechar,
}: ImportSummaryDialogProps) {
  if (!aberto || !resumo) return null;

  const nenhumItem =
    resumo.oleos_atualizados === 0 && resumo.pecas_novas === 0 && resumo.pecas_atualizadas === 0;

  return (
    <div className="dialog-overlay">
      <div className="dialog import-summary">
        <h2>Importação concluída</h2>
        <p className="import-summary-arquivo">{resumo.arquivo}</p>

        {nenhumItem ? (
          <p>
            Nenhum item foi encontrado nesse arquivo. Verifique se é o relatório de conferência
            correto.
          </p>
        ) : (
          <ul className="import-summary-numeros">
            <li>
              <strong>{resumo.oleos_atualizados}</strong> óleo(s)/graxa(s) com sistema atualizado
            </li>
            <li>
              <strong>{resumo.pecas_novas}</strong> peça(s) nova(s)
            </li>
            <li>
              <strong>{resumo.pecas_atualizadas}</strong> peça(s) já conhecida(s) atualizada(s)
            </li>
          </ul>
        )}

        {resumo.codigos_duplicados.length > 0 ? (
          <div className="import-summary-duplicados">
            <p>
              Atenção: {resumo.codigos_duplicados.length} código(s) apareceram mais de uma vez no
              arquivo. Foi usado o último valor de cada um:
            </p>
            <ul>
              {resumo.codigos_duplicados.map((codigo) => (
                <li key={codigo}>{codigo}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="dialog-actions">
          <button type="button" onClick={onFechar}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
