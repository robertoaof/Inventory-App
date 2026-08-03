import ComparisonBar from "../comuns/ComparisonBar";
import StatusBadge from "../comuns/StatusBadge";
import ObservacaoInput from "../comuns/ObservacaoInput";

export interface OleoCardOnChangePayload {
  estoque?: number;
  oficina?: number;
  quantidade_fisica?: number;
  observacao?: string | null;
}

interface OleoCardProps {
  codigo: string;
  descricao: string;
  possui_quebra_estoque_oficina: boolean;
  estoque?: number | null;
  oficina?: number | null;
  quantidade_fisica: number;
  quantidade_sistema: number;
  diferenca: number;
  status: "correto" | "sobra" | "falta";
  observacao?: string | null;
  /**
   * Avisa o pai (ContagemPage, via useInventarioDoDia) sobre a mudança.
   * Recebe só o(s) campo(s) alterado(s) — o pai é quem agrupa por item e
   * dispara o autosave com debounce (RNF11), nunca este componente.
   */
  onChange: (update: OleoCardOnChangePayload) => void;
}

/**
 * Card individual de um óleo ou graxa (docs/componentes-react.md seção 4).
 * `diferenca`/`status`/`quantidade_fisica` vêm sempre prontos da API — este
 * componente nunca recalcula nada, só exibe e repassa o que o usuário digita.
 *
 * Quando `possui_quebra_estoque_oficina` é `true` (óleo), edita
 * `estoque`/`oficina` separadamente (a soma em `quantidade_fisica` é feita
 * pelo backend). Quando é `false` (graxa), edita `quantidade_fisica`
 * diretamente num único campo "Físico".
 */
export default function OleoCard({
  codigo,
  descricao,
  possui_quebra_estoque_oficina,
  estoque,
  oficina,
  quantidade_fisica,
  quantidade_sistema,
  diferenca,
  status,
  observacao,
  onChange,
}: OleoCardProps) {
  return (
    <article className="oleo-card">
      <div className="oleo-card-header">
        <div>
          <strong>{codigo}</strong>
          <p>{descricao}</p>
        </div>
        <StatusBadge status={status} />
      </div>

      {possui_quebra_estoque_oficina ? (
        <div className="oleo-breakdown">
          <label>
            Estoque
            <input
              type="number"
              min={0}
              value={estoque ?? 0}
              onChange={(event) => onChange({ estoque: parseInt(event.target.value, 10) || 0 })}
            />
          </label>
          <label>
            Oficina
            <input
              type="number"
              min={0}
              value={oficina ?? 0}
              onChange={(event) => onChange({ oficina: parseInt(event.target.value, 10) || 0 })}
            />
          </label>
          <label className="oleo-total-fisico">
            Total físico
            <span>{quantidade_fisica}</span>
          </label>
        </div>
      ) : (
        <label>
          Físico
          <input
            type="number"
            min={0}
            value={quantidade_fisica}
            onChange={(event) =>
              onChange({ quantidade_fisica: parseInt(event.target.value, 10) || 0 })
            }
          />
        </label>
      )}

      <div className="oleo-card-sistema">
        <span>Sistema: {quantidade_sistema}</span>
        <span>Diferença: {diferenca}</span>
      </div>

      <ComparisonBar fisico={quantidade_fisica} sistema={quantidade_sistema} />

      <ObservacaoInput
        value={observacao ?? ""}
        onChange={(texto) => onChange({ observacao: texto })}
      />
    </article>
  );
}
