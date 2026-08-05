import { useCallback, useEffect, useMemo, useState } from "react";
import DateSelector from "../components/layout/DateSelector";
import SummaryBar from "../components/comuns/SummaryBar";
import SearchInput from "../components/comuns/SearchInput";
import SaveStatusIndicator from "../components/comuns/SaveStatusIndicator";
import AlertDialog from "../components/comuns/AlertDialog";
import EditingBanner from "../components/comuns/EditingBanner";
import ImportXMLButton from "../components/inventarios/ImportXMLButton";
import ImportSummaryDialog from "../components/inventarios/ImportSummaryDialog";
import ImportacoesHistoricoList from "../components/inventarios/ImportacoesHistoricoList";
import PecaListItem from "../components/inventarios/PecaListItem";
import PrintInventoryButton from "../components/impressao/PrintInventoryButton";
import { useInventarioDoDia } from "../hooks/useInventarioDoDia";
import { dataLocalHoje } from "../utils/data";
import { listarImportacoes, type ResumoImportacao } from "../api/inventarios";

interface InventariosPageProps {
  data: string;
  onDataChange: (data: string) => void;
}

function formatarHorario(momento: Date | null): string | null {
  if (!momento) return null;
  return `${String(momento.getHours()).padStart(2, "0")}:${String(momento.getMinutes()).padStart(2, "0")}`;
}

/**
 * Aba Inventários: as peças variáveis que chegam pela importação de XML
 * (docs/componentes-react.md). Compartilha a data com a aba Contagem (RF16)
 * e reaproveita o mesmo hook do dia — as peças vêm no mesmo GET.
 */
export default function InventariosPage({ data, onDataChange }: InventariosPageProps) {
  const {
    inventario,
    carregando,
    erroCarregamento,
    atualizarItem,
    recarregar,
    statusSalvamento,
    ultimoSalvoEm,
  } = useInventarioDoDia(data);

  const [search, setSearch] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [resumoImportacao, setResumoImportacao] = useState<ResumoImportacao | null>(null);
  const [importacoes, setImportacoes] = useState<ResumoImportacao[]>([]);
  const [carregandoImportacoes, setCarregandoImportacoes] = useState(true);

  // RF15: histórico de importações do dia, "para fins de consulta futura"
  // (GET /inventarios/{data}/importacoes). Lista vazia não é erro — se a
  // busca falhar, trata como lista vazia em vez de travar a tela com um
  // alerta por algo que é só um painel de consulta secundário.
  const carregarImportacoes = useCallback(async () => {
    setCarregandoImportacoes(true);
    try {
      const lista = await listarImportacoes(data);
      setImportacoes(lista);
    } catch {
      setImportacoes([]);
    } finally {
      setCarregandoImportacoes(false);
    }
  }, [data]);

  useEffect(() => {
    void carregarImportacoes();
  }, [carregarImportacoes]);

  const pecas = inventario?.pecas ?? [];
  const resumo = inventario?.resumo_pecas ?? { falta: 0, sobra: 0, correto: 0 };
  const diaFechado = inventario?.status === "fechado";

  // RF13/RNF03: filtra por código ou descrição, sem ida ao servidor.
  const pecasFiltradas = useMemo(() => {
    const termo = search.trim().toLowerCase();
    if (!termo) return pecas;
    return pecas.filter(
      (item) =>
        item.descricao.toLowerCase().includes(termo) ||
        item.codigo.toLowerCase().includes(termo) ||
        (item.localizacao ?? "").toLowerCase().includes(termo)
    );
  }, [pecas, search]);

  const handleImportado = async (novoResumo: ResumoImportacao) => {
    setResumoImportacao(novoResumo);
    // Re-busca o dia para trazer as peças novas e os sistemas atualizados
    // (docs/fluxo-de-telas.md seção 5), e refaz a lista de importações para
    // o painel de consulta refletir o novo arquivo sem recarregar a página.
    await recarregar();
    await carregarImportacoes();
  };

  return (
    <div className="page inventarios-page">
      <div className="page-header">
        <DateSelector data={data} onDataChange={onDataChange} />
        <SaveStatusIndicator estado={statusSalvamento} horario={formatarHorario(ultimoSalvoEm)} />
      </div>

      <EditingBanner
        dataEditando={diaFechado ? data : null}
        onCancelar={() => onDataChange(dataLocalHoje())}
      />

      <ImportXMLButton data={data} onImportado={handleImportado} onErro={setAviso} />

      <SearchInput value={search} onChange={setSearch} placeholder="Buscar peça" />

      <SummaryBar falta={resumo.falta} sobra={resumo.sobra} correto={resumo.correto} />

      {carregando ? <p className="loading-indicator">Carregando inventário do dia...</p> : null}

      {erroCarregamento ? <p className="error-indicator">{erroCarregamento}</p> : null}

      {!carregando && pecas.length === 0 ? (
        <p className="page-content">
          Nenhuma peça nesse dia ainda. Importe o XML de conferência para trazer a lista.
        </p>
      ) : null}

      {pecas.length > 0 && pecasFiltradas.length === 0 ? (
        <p className="page-content">Nenhuma peça encontrada para essa busca.</p>
      ) : null}

      <ul className="peca-list">
        {pecasFiltradas.map((item) => (
          <PecaListItem
            key={item.item_id}
            item={item}
            onChangeFisico={(valor) => atualizarItem(item.item_id, { quantidade_fisica: valor })}
          />
        ))}
      </ul>

      <ImportacoesHistoricoList importacoes={importacoes} carregando={carregandoImportacoes} />

      <footer className="actions-footer">
        <PrintInventoryButton data={data} inventario={inventario} />
      </footer>

      <ImportSummaryDialog
        aberto={resumoImportacao !== null}
        resumo={resumoImportacao}
        onFechar={() => setResumoImportacao(null)}
      />

      <AlertDialog aberto={aviso !== null} mensagem={aviso ?? ""} onFechar={() => setAviso(null)} />
    </div>
  );
}
