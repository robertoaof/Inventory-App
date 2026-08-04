import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, listarInventarios, type InventarioResumoDia } from "../api/inventarios";

/**
 * Tamanho de página usado pelo Histórico. O documento da API deixa o valor
 * padrão do backend (30) como "decisão nova, ainda não confirmada" — aqui só
 * repetimos o mesmo número para o `carregarMais` pedir páginas do mesmo
 * tamanho que o backend já usa por padrão; não é uma regra de negócio nova.
 */
const TAMANHO_PAGINA = 30;

export interface UseHistoricoResult {
  /** Todos os dias já carregados, concatenados em ordem (mais recente primeiro — RN25). */
  itens: InventarioResumoDia[];
  /** `true` só durante a primeira carga (página 1). */
  carregando: boolean;
  erroCarregamento: string | null;
  /** `true` enquanto uma página adicional está sendo buscada via `carregarMais`. */
  carregandoMais: boolean;
  /** Se ainda existem dias não carregados, segundo o `total` retornado pela API. */
  temMais: boolean;
  /** Busca a próxima página e concatena ao array já carregado. */
  carregarMais: () => void;
}

/**
 * Busca a lista de dias fechados para a `HistoricoPage` (RF20, RN25),
 * chamando `GET /api/v1/inventarios`. Não filtra `status` explicitamente —
 * o backend já retorna só `fechado` quando o parâmetro é omitido, que é
 * exatamente o que RN25 pede.
 *
 * Paginação incremental simples: carrega a página 1 ao montar, e
 * `carregarMais()` busca a próxima página e concatena ao array já
 * carregado, usando `total` para saber se ainda há mais páginas.
 */
export function useHistorico(): UseHistoricoResult {
  const [itens, setItens] = useState<InventarioResumoDia[]>([]);
  const [total, setTotal] = useState(0);
  const [ultimaPaginaCarregada, setUltimaPaginaCarregada] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [erroCarregamento, setErroCarregamento] = useState<string | null>(null);

  // Evita duas buscas concorrentes (ex: clique duplo em "Carregar mais").
  const buscandoRef = useRef(false);

  const buscarPagina = useCallback(async (pagina: number, primeiraCarga: boolean) => {
    if (buscandoRef.current) return;
    buscandoRef.current = true;

    if (primeiraCarga) {
      setCarregando(true);
    } else {
      setCarregandoMais(true);
    }
    setErroCarregamento(null);

    try {
      const resposta = await listarInventarios({ pagina, tamanho_pagina: TAMANHO_PAGINA });
      setItens((atual) => (primeiraCarga ? resposta.resultados : [...atual, ...resposta.resultados]));
      setTotal(resposta.total);
      setUltimaPaginaCarregada(resposta.pagina);
    } catch (e) {
      setErroCarregamento(
        e instanceof ApiError ? e.message : "Não foi possível carregar o histórico."
      );
    } finally {
      buscandoRef.current = false;
      setCarregando(false);
      setCarregandoMais(false);
    }
  }, []);

  useEffect(() => {
    void buscarPagina(1, true);
  }, [buscarPagina]);

  const carregarMais = useCallback(() => {
    void buscarPagina(ultimaPaginaCarregada + 1, false);
  }, [buscarPagina, ultimaPaginaCarregada]);

  const temMais = itens.length < total;

  return { itens, carregando, erroCarregamento, carregandoMais, temMais, carregarMais };
}
