interface StatusBadgeProps {
  status: "correto" | "sobra" | "falta";
}

const labelMap = {
  correto: "Correto",
  sobra: "Sobra",
  falta: "Falta",
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  return <span className={`status-badge status-${status}`}>{labelMap[status]}</span>;
}
