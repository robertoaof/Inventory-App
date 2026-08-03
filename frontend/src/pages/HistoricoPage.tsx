import DateSelector from "../components/layout/DateSelector";

interface HistoricoPageProps {
  data: string;
  onDataChange: (data: string) => void;
}

export default function HistoricoPage({ data, onDataChange }: HistoricoPageProps) {
  return (
    <div className="page historico-page">
      <div className="page-header">
        <DateSelector data={data} onDataChange={onDataChange} />
      </div>
      <div className="page-content">
        <p>Histórico ainda não implementado.</p>
      </div>
    </div>
  );
}
