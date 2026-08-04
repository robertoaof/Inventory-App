import type { ResumoStatus } from "../../api/inventarios";
import SummaryBar from "../comuns/SummaryBar";

interface HistoricoListItemProps {
  /** Data ISO (AAAA-MM-DD) do dia fechado. */
  data: string;
  resumo: ResumoStatus;
  onAbrir: () => void;
}

/**
 * A string de data da API já vem em AAAA-MM-DD; isso é só um split de
 * string, sem nenhuma conversão de fuso horário (o mesmo padrão usado em
 * `EditingBanner`) — nunca usar `Date`/`toISOString()` aqui.
 */
function formatarDataBR(data: string): string {
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

/**
 * Uma linha da lista de dias fechados no Histórico (RF20/RF21).
 *
 * O resumo usa o mesmo `SummaryBar` das telas de Contagem e Inventários —
 * decisão da pessoa em 2026-08-04, por consistência visual (RNF01). Uma
 * versão anterior usava três contadores compactos próprios aqui; foi
 * substituída. O `SummaryBar` é reaproveitado sem alteração: a adaptação
 * para caber numa linha de lista é só CSS (`.historico-list-item
 * .summary-bar` em `index.css`), para não mudar como ele aparece nas
 * outras telas.
 *
 * Os números continuam vindo prontos da API (`resumo`), nunca recalculados
 * aqui.
 */
export default function HistoricoListItem({ data, resumo, onAbrir }: HistoricoListItemProps) {
  return (
    <li className="historico-list-item">
      <span className="historico-list-item-data">{formatarDataBR(data)}</span>

      <SummaryBar falta={resumo.falta} sobra={resumo.sobra} correto={resumo.correto} />

      <button type="button" className="historico-list-item-abrir" onClick={onAbrir}>
        Abrir
      </button>
    </li>
  );
}
