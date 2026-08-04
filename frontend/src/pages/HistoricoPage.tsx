import { useNavigate } from "react-router-dom";
import HistoricoListItem from "../components/historico/HistoricoListItem";
import { useHistorico } from "../hooks/useHistorico";

interface HistoricoPageProps {
  data: string;
  onDataChange: (data: string) => void;
}

/**
 * Aba Histórico (RF20, RF21, RN25, RN26): lista os dias já fechados, do mais
 * recente para o mais antigo (ordem que já vem pronta da API), e permite
 * "Abrir" um deles para edição.
 *
 * Decisão de UX: ao contrário de Contagem/Inventários, esta página não usa
 * `DateSelector` — ela lista todos os dias fechados de uma vez (RN25), não
 * depende de uma única data selecionada para decidir o que buscar. A prop
 * `data`/`onDataChange` continua existindo (mesma assinatura das outras
 * páginas, estado elevado em `App` — RF16) porque "Abrir" precisa poder
 * *escrever* a data compartilhada, mesmo sem precisar *ler* nem exibir um
 * seletor aqui.
 */
export default function HistoricoPage({ onDataChange }: HistoricoPageProps) {
  const { itens, carregando, erroCarregamento, carregandoMais, temMais, carregarMais } =
    useHistorico();
  const navigate = useNavigate();

  // RN26: abrir um dia do histórico carrega os dados daquele inventário nas
  // telas de edição do dia corrente. Decisão de UX: navega para a aba
  // Contagem (não Inventários) — é a primeira aba e já mostra o
  // `EditingBanner` quando o dia está fechado, sinalizando a edição em
  // andamento. A partir daí, salvar de novo segue RN18/RN19 normalmente,
  // sem nenhuma mudança necessária em `ContagemPage`/`useInventarioDoDia`.
  const handleAbrir = (dataDoItem: string) => {
    onDataChange(dataDoItem);
    navigate("/contagem");
  };

  return (
    <div className="page historico-page">
      <div className="page-header">
        <h2>Histórico</h2>
      </div>

      {carregando ? <p className="loading-indicator">Carregando histórico...</p> : null}

      {erroCarregamento ? <p className="error-indicator">{erroCarregamento}</p> : null}

      {!carregando && !erroCarregamento && itens.length === 0 ? (
        <p className="page-content">Nenhum dia fechado ainda.</p>
      ) : null}

      <ul className="historico-list">
        {itens.map((item) => (
          <HistoricoListItem
            key={item.data}
            data={item.data}
            resumo={item.resumo}
            onAbrir={() => handleAbrir(item.data)}
          />
        ))}
      </ul>

      {temMais ? (
        <div className="historico-carregar-mais">
          <button type="button" onClick={carregarMais} disabled={carregandoMais}>
            {carregandoMais ? "Carregando..." : "Carregar mais"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
