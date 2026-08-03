import DateSelector from "../components/layout/DateSelector";
import SummaryBar from "../components/comuns/SummaryBar";
import ActionsFooter from "../components/layout/ActionsFooter";

interface InventariosPageProps {
  data: string;
  onDataChange: (data: string) => void;
}

export default function InventariosPage({ data, onDataChange }: InventariosPageProps) {
  return (
    <div className="page inventarios-page">
      <div className="page-header">
        <DateSelector data={data} onDataChange={onDataChange} />
      </div>
      <SummaryBar falta={0} sobra={0} correto={0} />
      <div className="page-content">
        <p>Inventários ainda não implementados.</p>
      </div>
      <ActionsFooter onSave={() => {}} onNewCount={() => {}} saving={false} />
    </div>
  );
}
