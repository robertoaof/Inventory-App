import { useMemo, useState } from "react";
import DateSelector from "../components/layout/DateSelector";
import SummaryBar from "../components/comuns/SummaryBar";
import SearchInput from "../components/comuns/SearchInput";
import SaveStatusIndicator from "../components/comuns/SaveStatusIndicator";
import AlertDialog from "../components/comuns/AlertDialog";
import OleoCard, { type OleoCardOnChangePayload } from "../components/contagem/OleoCard";
import ActionsFooter from "../components/layout/ActionsFooter";
import { useInventarioDoDia } from "../hooks/useInventarioDoDia";

interface ContagemPageProps {
  data: string;
  onDataChange: (data: string) => void;
}

function formatarHorario(momento: Date | null): string | null {
  if (!momento) return null;
  return `${String(momento.getHours()).padStart(2, "0")}:${String(momento.getMinutes()).padStart(2, "0")}`;
}

export default function ContagemPage({ data, onDataChange }: ContagemPageProps) {
  const {
    inventario,
    carregando,
    erroCarregamento,
    atualizarItem,
    statusSalvamento,
    ultimoSalvoEm,
  } = useInventarioDoDia(data);

  const [search, setSearch] = useState("");
  const [avisoAcaoFutura, setAvisoAcaoFutura] = useState<string | null>(null);

  const oleos = inventario?.oleos ?? [];

  const oleosFiltrados = useMemo(() => {
    const termo = search.trim().toLowerCase();
    if (!termo) return oleos;
    return oleos.filter(
      (item) =>
        item.descricao.toLowerCase().includes(termo) || item.codigo.toLowerCase().includes(termo)
    );
  }, [oleos, search]);

  const resumo = inventario?.resumo_oleos ?? { falta: 0, sobra: 0, correto: 0 };

  const handleChangeItem = (itemId: number, patch: OleoCardOnChangePayload) => {
    atualizarItem(itemId, patch);
  };

  return (
    <div className="page contagem-page">
      <div className="page-header">
        <DateSelector data={data} onDataChange={onDataChange} />
        <SaveStatusIndicator estado={statusSalvamento} horario={formatarHorario(ultimoSalvoEm)} />
      </div>

      <SearchInput value={search} onChange={setSearch} placeholder="Buscar óleo ou graxa" />

      <SummaryBar falta={resumo.falta} sobra={resumo.sobra} correto={resumo.correto} />

      {carregando ? <p className="loading-indicator">Carregando contagem do dia...</p> : null}

      {erroCarregamento ? <p className="error-indicator">{erroCarregamento}</p> : null}

      <div className="oleo-list">
        {oleosFiltrados.map((item) => (
          <OleoCard
            key={item.item_id}
            codigo={item.codigo}
            descricao={item.descricao}
            possui_quebra_estoque_oficina={item.possui_quebra_estoque_oficina}
            estoque={item.estoque}
            oficina={item.oficina}
            quantidade_fisica={item.quantidade_fisica}
            quantidade_sistema={item.quantidade_sistema}
            diferenca={item.diferenca}
            status={item.status}
            observacao={item.observacao}
            onChange={(patch) => handleChangeItem(item.item_id, patch)}
          />
        ))}
      </div>

      <ActionsFooter
        onSave={() => setAvisoAcaoFutura("Fechar a contagem do dia ainda não foi implementado nesta versão.")}
        onNewCount={() => setAvisoAcaoFutura("\"Nova contagem\" ainda não foi implementado nesta versão.")}
        saving={false}
      />

      <AlertDialog
        aberto={avisoAcaoFutura !== null}
        mensagem={avisoAcaoFutura ?? ""}
        onFechar={() => setAvisoAcaoFutura(null)}
      />
    </div>
  );
}
