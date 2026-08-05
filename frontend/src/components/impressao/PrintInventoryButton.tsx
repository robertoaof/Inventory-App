import { useState } from "react";
import AlertDialog from "../comuns/AlertDialog";
import { ApiError, getInventarioDoDia, type InventarioDoDia } from "../../api/inventarios";

interface PrintInventoryButtonProps {
  /** Data do dia a imprimir (AAAA-MM-DD). */
  data: string;
  /**
   * Inventário já carregado pela página, se houver (evita repetir o GET).
   * Opcional de propósito: o componente precisa funcionar sozinho, buscando
   * os dados por conta própria, mesmo se usado de um lugar que não tenha
   * nada em memória ainda (docs/componentes-react.md seção 7).
   */
  inventario?: InventarioDoDia | null;
}

const ESTILOS_IMPRESSAO = `
  body{font-family:Arial,Helvetica,sans-serif;color:#000;background:#fff;padding:20px;margin:0;}
  .imp-header{text-align:center;margin-bottom:14px;border-bottom:2px solid #000;padding-bottom:8px;}
  .imp-empresa{font-size:16px;font-weight:bold;text-transform:uppercase;}
  .imp-titulo{font-size:13px;margin-top:4px;}
  .imp-meta{font-size:10px;color:#333;margin-top:4px;}
  .imp-secao-titulo{font-size:13px;font-weight:bold;text-transform:uppercase;margin:16px 0 6px;border-bottom:1px solid #000;padding-bottom:3px;}
  .imp-vazio{font-size:11px;margin-bottom:12px;}
  table.imp-tabela{width:100%;border-collapse:collapse;font-size:10.5px;margin-bottom:6px;}
  table.imp-tabela th, table.imp-tabela td{border:1px solid #999;padding:3px 5px;text-align:left;}
  table.imp-tabela th{background:#eee;}
  @page{size:A4;margin:12mm;}
`;

const STATUS_LABEL: Record<string, string> = {
  correto: "CORRETO",
  sobra: "SOBRA ▲",
  falta: "FALTA ▼",
};

/** A string de data já vem em AAAA-MM-DD; conversão é só um split de string. */
function formatarDataBR(data: string): string {
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

function formatarDiferenca(diferenca: number): string {
  return diferenca > 0 ? `+${diferenca}` : String(diferenca);
}

function escaparHTML(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function montarTabelaOleos(inventario: InventarioDoDia): string {
  if (inventario.oleos.length === 0) {
    return `<div class="imp-secao-titulo">Óleos e graxas</div><p class="imp-vazio">Nenhum lançamento para esta data.</p>`;
  }

  const linhas = inventario.oleos
    .map((item) => {
      const estoque = item.possui_quebra_estoque_oficina ? item.estoque ?? 0 : "—";
      const oficina = item.possui_quebra_estoque_oficina ? item.oficina ?? 0 : "—";
      return `<tr>
        <td>${escaparHTML(item.codigo)}</td>
        <td>${escaparHTML(item.descricao)}</td>
        <td>${estoque}</td>
        <td>${oficina}</td>
        <td>${item.quantidade_fisica}</td>
        <td>${item.quantidade_sistema}</td>
        <td>${formatarDiferenca(item.diferenca)}</td>
        <td>${STATUS_LABEL[item.status] ?? item.status}</td>
      </tr>`;
    })
    .join("");

  return `
    <div class="imp-secao-titulo">Óleos e graxas</div>
    <table class="imp-tabela">
      <thead>
        <tr>
          <th>Código</th><th>Descrição</th><th>Estoque</th><th>Oficina</th>
          <th>Total físico</th><th>Sistema</th><th>Diferença</th><th>Status</th>
        </tr>
      </thead>
      <tbody>${linhas}</tbody>
    </table>`;
}

function montarListaPecas(inventario: InventarioDoDia): string {
  if (inventario.pecas.length === 0) {
    return `<div class="imp-secao-titulo">Itens do inventário (XML)</div><p class="imp-vazio">Nenhum item importado para esta data.</p>`;
  }

  const linhas = inventario.pecas
    .map(
      (item) => `<tr>
        <td>${escaparHTML(item.localizacao ?? "")}</td>
        <td>${escaparHTML(item.codigo)}</td>
        <td>${escaparHTML(item.descricao)}</td>
        <td>${escaparHTML(item.unidade)}</td>
        <td>${item.quantidade_sistema}</td>
        <td>${item.quantidade_fisica}</td>
        <td>${formatarDiferenca(item.diferenca)}</td>
        <td>${STATUS_LABEL[item.status] ?? item.status}</td>
      </tr>`
    )
    .join("");

  return `
    <div class="imp-secao-titulo">Itens do inventário (XML)</div>
    <table class="imp-tabela">
      <thead>
        <tr>
          <th>Locação</th><th>Código</th><th>Descrição</th><th>UN</th>
          <th>Sistema</th><th>Físico</th><th>Diferença</th><th>Status</th>
        </tr>
      </thead>
      <tbody>${linhas}</tbody>
    </table>`;
}

/**
 * Monta o miolo (sem <html>/<body>) do relatório de impressão a partir dos
 * dados já prontos da API — `diferenca`/`status` nunca são recalculados
 * aqui, só formatados para exibição (regra inegociável do projeto).
 */
function gerarHTMLImpressao(inventario: InventarioDoDia): string {
  const agora = new Date();
  const geradoEm = `${agora.toLocaleDateString("pt-BR")} ${agora.toLocaleTimeString("pt-BR")}`;

  return `
    <div class="imp-header">
      <div class="imp-empresa">Scania — Estoque de óleo e peças</div>
      <div class="imp-titulo">Inventário do dia — ${formatarDataBR(inventario.data)}</div>
      <div class="imp-meta">Gerado em ${geradoEm}</div>
    </div>
    ${montarTabelaOleos(inventario)}
    ${montarListaPecas(inventario)}
  `;
}

/**
 * Botão "Imprimir inventário do dia" (e sua variante "abrir em nova aba"),
 * docs/componentes-react.md seção 7. Monta uma versão limpa em preto e
 * branco do dia selecionado — tabela de óleos/graxas com diferença e status,
 * e lista de peças — reaproveitando o comportamento visual do protótipo
 * (`gerarHTMLImpressao` em contagem_oleo.html), sem reintroduzir parsing de
 * XML nem cálculo de diferença/status no navegador.
 *
 * Sempre busca os dados do dia antes de montar o HTML (via
 * `GET /inventarios/{data}`) — a menos que a página que o renderiza já
 * tenha o inventário carregado em memória e o passe via prop `inventario`,
 * nesse caso reaproveita em vez de refazer a chamada.
 */
export default function PrintInventoryButton({ data, inventario }: PrintInventoryButtonProps) {
  const [carregando, setCarregando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  async function obterInventario(): Promise<InventarioDoDia | null> {
    if (inventario && inventario.data === data) {
      return inventario;
    }

    setCarregando(true);
    try {
      return await getInventarioDoDia(data);
    } catch (e) {
      setAviso(
        e instanceof ApiError
          ? e.message
          : "Não foi possível carregar os dados do dia para impressão."
      );
      return null;
    } finally {
      setCarregando(false);
    }
  }

  async function handleImprimir() {
    const dados = await obterInventario();
    if (!dados) return;

    let area = document.getElementById("area-impressao");
    if (!area) {
      area = document.createElement("div");
      area.id = "area-impressao";
      document.body.appendChild(area);
    }
    area.innerHTML = gerarHTMLImpressao(dados);
    window.print();
  }

  async function handleImprimirNovaAba() {
    const dados = await obterInventario();
    if (!dados) return;

    const janela = window.open("", "_blank");
    if (!janela) {
      setAviso(
        "Não foi possível abrir uma nova aba. Verifique o bloqueador de pop-ups do navegador."
      );
      return;
    }

    const conteudo = gerarHTMLImpressao(dados);
    janela.document.write(
      `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">` +
        `<title>Inventário do dia — ${formatarDataBR(dados.data)}</title>` +
        `<style>${ESTILOS_IMPRESSAO}</style></head><body>${conteudo}</body></html>`
    );
    janela.document.close();
    janela.focus();
    janela.print();
  }

  return (
    <div className="print-actions">
      <button type="button" onClick={() => void handleImprimir()} disabled={carregando}>
        {carregando ? "Preparando..." : "Imprimir inventário do dia"}
      </button>
      <button type="button" onClick={() => void handleImprimirNovaAba()} disabled={carregando}>
        Abrir para impressão em nova aba
      </button>

      <AlertDialog aberto={aviso !== null} mensagem={aviso ?? ""} onFechar={() => setAviso(null)} />
    </div>
  );
}
