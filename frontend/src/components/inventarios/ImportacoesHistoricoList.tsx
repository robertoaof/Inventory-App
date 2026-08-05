import type { ResumoImportacao } from "../../api/inventarios";

interface ImportacoesHistoricoListProps {
  importacoes: ResumoImportacao[];
  carregando: boolean;
}

/**
 * Formata um `processado_em` (ISO 8601 completo com timezone, ex:
 * `2026-07-17T08:15:00-03:00`) como data e hora BR. Aqui, ao contrário das
 * datas simples `AAAA-MM-DD` usadas em `EditingBanner`/`HistoricoListItem`,
 * é seguro usar `Date`/`toLocale*` porque o valor já traz o timezone — não
 * há ambiguidade de fuso a resolver.
 */
function formatarDataHora(iso: string): string {
  const momento = new Date(iso);
  const data = momento.toLocaleDateString("pt-BR");
  const hora = momento.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${data} ${hora}`;
}

/**
 * Painel de consulta das importações de XML já feitas no dia selecionado
 * (RF15 / GET /inventarios/{data}/importacoes, docs/document-rest-API.md
 * seção 2.7). Existe como componente próprio, e não uma seção solta dentro
 * de `InventariosPage`, pelo mesmo motivo dos outros itens de lista do
 * sistema: mantém a página mais simples de ler, e deixa claro que essa
 * lista é só de consulta (não edita nada, não recalcula nada).
 */
export default function ImportacoesHistoricoList({
  importacoes,
  carregando,
}: ImportacoesHistoricoListProps) {
  return (
    <section className="importacoes-historico">
      <h2>Importações deste dia</h2>

      {carregando ? (
        <p className="loading-indicator">Carregando importações do dia...</p>
      ) : importacoes.length === 0 ? (
        <p className="page-content">Nenhuma importação de XML feita neste dia ainda.</p>
      ) : (
        <ul className="importacoes-historico-list">
          {importacoes.map((importacao, indice) => (
            <li
              key={`${importacao.arquivo}-${importacao.processado_em}-${indice}`}
              className="importacoes-historico-item"
            >
              <div className="importacoes-historico-cabecalho">
                <strong>{importacao.arquivo}</strong>
                <span className="importacoes-historico-horario">
                  {formatarDataHora(importacao.processado_em)}
                </span>
              </div>

              <div className="importacoes-historico-numeros">
                <span>{importacao.oleos_atualizados} óleo(s)/graxa(s) atualizados</span>
                <span>{importacao.pecas_novas} peça(s) nova(s)</span>
                <span>{importacao.pecas_atualizadas} peça(s) atualizada(s)</span>
              </div>

              {importacao.codigos_duplicados.length > 0 ? (
                <p className="importacoes-historico-duplicados">
                  Códigos duplicados no arquivo: {importacao.codigos_duplicados.join(", ")}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
