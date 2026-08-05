import { useMemo, useState } from "react";
import DateSelector from "../components/layout/DateSelector";
import SummaryBar from "../components/comuns/SummaryBar";
import SearchInput from "../components/comuns/SearchInput";
import SaveStatusIndicator from "../components/comuns/SaveStatusIndicator";
import AlertDialog from "../components/comuns/AlertDialog";
import ConfirmDialog from "../components/comuns/ConfirmDialog";
import EditingBanner from "../components/comuns/EditingBanner";
import OleoCard, { type OleoCardOnChangePayload } from "../components/contagem/OleoCard";
import ActionsFooter from "../components/layout/ActionsFooter";
import { useInventarioDoDia } from "../hooks/useInventarioDoDia";
import { ApiError, fecharInventario, limparItensDoDia } from "../api/inventarios";
import { dataLocalHoje } from "../utils/data";

interface ContagemPageProps {
  data: string;
  onDataChange: (data: string) => void;
}

/** Ação aguardando confirmação no ConfirmDialog (RNF02: nada de confirm() nativo). */
interface Confirmacao {
  mensagem: string;
  executar: () => Promise<void>;
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
    recarregar,
    statusSalvamento,
    ultimoSalvoEm,
  } = useInventarioDoDia(data);

  const [search, setSearch] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null);
  const [executandoAcao, setExecutandoAcao] = useState(false);

  const diaFechado = inventario?.status === "fechado";
  const diaSemLancamentos = inventario?.status === "nao_iniciado";

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

  const executarAcao = async (acao: () => Promise<void>) => {
    setExecutandoAcao(true);
    try {
      await acao();
    } catch (e) {
      setAviso(
        e instanceof ApiError ? e.message : "Não foi possível concluir a ação. Tente de novo."
      );
    } finally {
      setExecutandoAcao(false);
    }
  };

  // RN19: fechar (ou re-fechar, após uma correção) sempre passa por uma
  // confirmação explícita antes de gravar.
  const handleSalvarDia = () => {
    if (diaSemLancamentos) {
      setAviso("Nada foi lançado nesse dia ainda — não há contagem para salvar.");
      return;
    }
    setConfirmacao({
      mensagem: diaFechado
        ? "Esse dia já tem uma contagem salva. Deseja substituí-la pelos valores atuais?"
        : "Confirma fechar a contagem desse dia?",
      executar: async () => {
        await fecharInventario(data);
        await recarregar();
      },
    });
  };

  // "Nova contagem" (RF22, RN21). Decisão de 2026-08-03: num dia já fechado
  // o aviso é mais forte, porque a ação apaga uma contagem consolidada.
  const handleNovaContagem = () => {
    if (diaSemLancamentos) {
      setAviso("Nada foi lançado nesse dia ainda — não há o que limpar.");
      return;
    }
    setConfirmacao({
      mensagem: diaFechado
        ? "Atenção: esse dia já está fechado. Começar uma nova contagem apaga os valores já salvos dele. As quantidades de sistema são mantidas, mas as quantidades contadas serão perdidas. Deseja continuar?"
        : "Isso vai limpar os valores lançados nesse dia. Deseja continuar?",
      executar: async () => {
        await limparItensDoDia(data);
        await recarregar();
      },
    });
  };

  const handleConfirmar = () => {
    const pendente = confirmacao;
    setConfirmacao(null);
    if (pendente) void executarAcao(pendente.executar);
  };

  return (
    <div className="page contagem-page">
      <div className="page-header">
        <DateSelector data={data} onDataChange={onDataChange} />
        <SaveStatusIndicator estado={statusSalvamento} horario={formatarHorario(ultimoSalvoEm)} />
      </div>

      <EditingBanner
        dataEditando={diaFechado ? data : null}
        onCancelar={() => onDataChange(dataLocalHoje())}
      />

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
        onSave={handleSalvarDia}
        onNewCount={handleNovaContagem}
        saving={executandoAcao}
        data={data}
        inventario={inventario}
      />

      <ConfirmDialog
        aberto={confirmacao !== null}
        mensagem={confirmacao?.mensagem ?? ""}
        onConfirmar={handleConfirmar}
        onCancelar={() => setConfirmacao(null)}
      />

      <AlertDialog aberto={aviso !== null} mensagem={aviso ?? ""} onFechar={() => setAviso(null)} />
    </div>
  );
}
