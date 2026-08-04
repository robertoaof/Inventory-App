/**
 * Data de hoje no fuso local, no formato AAAA-MM-DD que a API espera.
 *
 * Não use `new Date().toISOString().slice(0, 10)`: `toISOString()` converte
 * para UTC, então no horário de Brasília (UTC-3) qualquer contagem feita a
 * partir das 21h cairia no dia seguinte.
 */
export function dataLocalHoje(): string {
  return formatarDataISO(new Date());
}

/** Formata um `Date` como AAAA-MM-DD usando os componentes locais. */
export function formatarDataISO(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}
