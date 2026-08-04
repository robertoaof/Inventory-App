import StatusBadge from "../comuns/StatusBadge";
import type { ItemPeca } from "../../api/inventarios";

interface PecaListItemProps {
  item: ItemPeca;
  onChangeFisico: (novoValor: number) => void;
}

/**
 * Uma linha da lista de peças (docs/componentes-react.md). É o equivalente
 * do `OleoCard` para a aba Inventários, mas em lista compacta em vez de
 * card. Peças nunca têm quebra estoque/oficina — só um campo de físico.
 *
 * `diferenca` e `status` vêm prontos da API; este componente não calcula
 * nada, só exibe e repassa o que o usuário digita.
 */
export default function PecaListItem({ item, onChangeFisico }: PecaListItemProps) {
  return (
    <li className="peca-list-item">
      <div className="peca-identificacao">
        <strong>{item.codigo}</strong>
        <span className="peca-descricao">{item.descricao}</span>
        <span className="peca-meta">
          {item.localizacao ? `Locação: ${item.localizacao}` : "Sem locação"}
          {item.unidade ? ` · ${item.unidade}` : null}
        </span>
      </div>

      <div className="peca-numeros">
        <label>
          Físico
          <input
            type="number"
            min={0}
            value={item.quantidade_fisica}
            onChange={(event) => onChangeFisico(parseInt(event.target.value, 10) || 0)}
          />
        </label>
        <span className="peca-sistema">Sistema: {item.quantidade_sistema}</span>
        <span className="peca-diferenca">Diferença: {item.diferenca}</span>
        <StatusBadge status={item.status} />
      </div>
    </li>
  );
}
