interface SummaryBarProps {
  falta: number;
  sobra: number;
  correto: number;
}

export default function SummaryBar({ falta, sobra, correto }: SummaryBarProps) {
  return (
    <div className="summary-bar">
      <div className="summary-card summary-card-falta">
        <span className="summary-label">Falta</span>
        <strong>{falta}</strong>
      </div>
      <div className="summary-card summary-card-sobra">
        <span className="summary-label">Sobra</span>
        <strong>{sobra}</strong>
      </div>
      <div className="summary-card summary-card-correto">
        <span className="summary-label">Correto</span>
        <strong>{correto}</strong>
      </div>
    </div>
  );
}
