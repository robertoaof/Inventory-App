interface ComparisonBarProps {
  fisico: number;
  sistema: number;
}

export default function ComparisonBar({ fisico, sistema }: ComparisonBarProps) {
  const total = Math.max(fisico, sistema, 1);
  const fisicoPercent = Math.round((fisico / total) * 100);
  const sistemaPercent = Math.round((sistema / total) * 100);

  return (
    <div className="comparison-bar">
      <div className="comparison-track">
        <div className="comparison-fill fisico" style={{ width: `${fisicoPercent}%` }} />
        <div className="comparison-fill sistema" style={{ width: `${sistemaPercent}%` }} />
      </div>
      <div className="comparison-labels">
        <span>Físico: {fisico}</span>
        <span>Sistema: {sistema}</span>
      </div>
    </div>
  );
}
