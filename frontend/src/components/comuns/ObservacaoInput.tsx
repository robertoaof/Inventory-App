interface ObservacaoInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Rótulo do campo — por padrão "Observação", já que o uso principal (RF06) é por item. */
  label?: string;
}

export default function ObservacaoInput({ value, onChange, label = "Observação" }: ObservacaoInputProps) {
  return (
    <div className="observacao-input">
      <label>
        {label}
        <textarea value={value} onChange={(event) => onChange(event.target.value)} />
      </label>
    </div>
  );
}
