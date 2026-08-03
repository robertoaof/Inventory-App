interface DateSelectorProps {
  data: string;
  onDataChange: (data: string) => void;
}

export default function DateSelector({ data, onDataChange }: DateSelectorProps) {
  return (
    <div className="date-selector">
      <label htmlFor="inventory-date">Data</label>
      <input
        id="inventory-date"
        type="date"
        value={data}
        onChange={(event) => onDataChange(event.target.value)}
      />
    </div>
  );
}
