// Cliente HTTP para os endpoints de /inventarios.
// Mantém o payload em snake_case, exatamente como definido em
// docs/document-rest-API.md, para evitar uma camada extra de conversão
// entre o que a API envia/recebe e o que os componentes consomem.

const API_BASE_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

export type StatusItem = "correto" | "sobra" | "falta";
export type StatusInventario = "rascunho" | "fechado" | "nao_iniciado";
export type CategoriaOleo = "oleo" | "graxa";

export interface ResumoStatus {
  falta: number;
  sobra: number;
  correto: number;
}

export interface ItemOleoOuGraxa {
  item_id: number;
  codigo: string;
  descricao: string;
  categoria: CategoriaOleo;
  possui_quebra_estoque_oficina: boolean;
  estoque?: number | null;
  oficina?: number | null;
  quantidade_fisica: number;
  quantidade_sistema: number;
  diferenca: number;
  status: StatusItem;
  observacao: string | null;
}

export interface ItemPeca {
  item_id: number;
  codigo: string;
  descricao: string;
  categoria: "peca";
  unidade: string;
  localizacao: string | null;
  quantidade_fisica: number;
  quantidade_sistema: number;
  diferenca: number;
  status: StatusItem;
  observacao: string | null;
}

export interface InventarioDoDia {
  data: string;
  status: StatusInventario;
  fechado_em: string | null;
  resumo_oleos: ResumoStatus;
  resumo_pecas: ResumoStatus;
  oleos: ItemOleoOuGraxa[];
  pecas: ItemPeca[];
}

export interface ResumoImportacao {
  arquivo: string;
  processado_em: string;
  oleos_atualizados: number;
  pecas_novas: number;
  pecas_atualizadas: number;
  codigos_duplicados: string[];
}

export interface InventarioFechado {
  data: string;
  status: "fechado";
  fechado_em: string;
}

/** Uma linha da listagem paginada de `GET /inventarios` (histórico, RN25). */
export interface InventarioResumoDia {
  data: string;
  status: StatusInventario;
  fechado_em: string | null;
  resumo: ResumoStatus;
}

export interface InventarioListResponse {
  total: number;
  pagina: number;
  tamanho_pagina: number;
  resultados: InventarioResumoDia[];
}

export interface ListarInventariosParams {
  /** Se omitido, o backend já filtra só `fechado` (RN25) — não envie explicitamente sem necessidade. */
  status?: "rascunho" | "fechado";
  pagina?: number;
  tamanho_pagina?: number;
}

export interface PatchItemOleoPayload {
  estoque?: number;
  oficina?: number;
  observacao?: string | null;
}

export interface PatchItemSemQuebraPayload {
  quantidade_fisica?: number;
  observacao?: string | null;
}

export type PatchItemPayload = PatchItemOleoPayload | PatchItemSemQuebraPayload;

/** Erro tipado que reflete o envelope `{ erro: { codigo, mensagem } }` da API. */
export class ApiError extends Error {
  codigo: string;
  status: number;

  constructor(codigo: string, mensagem: string, status: number) {
    super(mensagem);
    this.name = "ApiError";
    this.codigo = codigo;
    this.status = status;
  }
}

async function parseErroOuLancar(response: Response): Promise<never> {
  let codigo = "erro_desconhecido";
  let mensagem = `Falha na requisição (HTTP ${response.status}).`;

  try {
    const corpo = await response.json();
    if (corpo?.erro?.mensagem) {
      codigo = corpo.erro.codigo ?? codigo;
      mensagem = corpo.erro.mensagem;
    }
  } catch {
    // Corpo não era JSON (ex: erro de rede/proxy) — mantém a mensagem padrão.
  }

  throw new ApiError(codigo, mensagem, response.status);
}

/**
 * Busca o inventário completo de uma data (óleos/graxas + peças).
 * GET /api/v1/inventarios/{data} — somente leitura, nunca escreve no banco.
 */
export async function getInventarioDoDia(data: string): Promise<InventarioDoDia> {
  const response = await fetch(`${API_BASE_URL}/api/v1/inventarios/${data}`);

  if (!response.ok) {
    await parseErroOuLancar(response);
  }

  return (await response.json()) as InventarioDoDia;
}

/**
 * Atualiza um único item do inventário do dia (óleo, graxa ou peça).
 * PATCH /api/v1/inventarios/{data}/itens/{item_id}
 * Retorna o item já com `diferenca`/`status` recalculados pelo backend.
 */
export async function patchItem(
  data: string,
  itemId: number,
  payload: PatchItemPayload
): Promise<ItemOleoOuGraxa | ItemPeca> {
  const response = await fetch(`${API_BASE_URL}/api/v1/inventarios/${data}/itens/${itemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    await parseErroOuLancar(response);
  }

  return (await response.json()) as ItemOleoOuGraxa | ItemPeca;
}

/**
 * Lista o histórico de inventários (RF20).
 * GET /api/v1/inventarios — sem `status`, o backend já retorna só os
 * `fechado` (RN25), do mais recente para o mais antigo.
 */
export async function listarInventarios(
  params: ListarInventariosParams = {}
): Promise<InventarioListResponse> {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.pagina !== undefined) query.set("pagina", String(params.pagina));
  if (params.tamanho_pagina !== undefined) {
    query.set("tamanho_pagina", String(params.tamanho_pagina));
  }

  const queryString = query.toString();
  const response = await fetch(
    `${API_BASE_URL}/api/v1/inventarios${queryString ? `?${queryString}` : ""}`
  );

  if (!response.ok) {
    await parseErroOuLancar(response);
  }

  return (await response.json()) as InventarioListResponse;
}

/**
 * Envia o XML de conferência do dia (RF07). O arquivo vai cru, como
 * multipart/form-data — o navegador nunca abre nem interpreta o conteúdo,
 * todo o parsing é do backend (docs/fluxo-de-telas.md seção 4).
 * POST /api/v1/inventarios/{data}/importar-xml
 */
export async function importarXML(data: string, arquivo: File): Promise<ResumoImportacao> {
  const corpo = new FormData();
  corpo.append("arquivo", arquivo);

  const response = await fetch(`${API_BASE_URL}/api/v1/inventarios/${data}/importar-xml`, {
    method: "POST",
    body: corpo,
  });

  if (!response.ok) {
    await parseErroOuLancar(response);
  }

  return (await response.json()) as ResumoImportacao;
}

/**
 * Fecha (ou re-fecha) a contagem do dia — botão "Salvar contagem do dia".
 * POST /api/v1/inventarios/{data}/fechar
 * O `fechado_em` devolvido é sempre o do primeiro fechamento (RN18).
 */
export async function fecharInventario(data: string): Promise<InventarioFechado> {
  const response = await fetch(`${API_BASE_URL}/api/v1/inventarios/${data}/fechar`, {
    method: "POST",
  });

  if (!response.ok) {
    await parseErroOuLancar(response);
  }

  return (await response.json()) as InventarioFechado;
}

/**
 * "Nova contagem" — limpa os lançamentos do dia selecionado (RF22, RN21).
 * DELETE /api/v1/inventarios/{data}/itens
 * Óleos/graxas mantêm `quantidade_sistema` (RN27) e só têm o físico zerado;
 * peças são removidas. Devolve o inventário já limpo.
 */
export async function limparItensDoDia(data: string): Promise<InventarioDoDia> {
  const response = await fetch(`${API_BASE_URL}/api/v1/inventarios/${data}/itens`, {
    method: "DELETE",
  });

  if (!response.ok) {
    await parseErroOuLancar(response);
  }

  return (await response.json()) as InventarioDoDia;
}
