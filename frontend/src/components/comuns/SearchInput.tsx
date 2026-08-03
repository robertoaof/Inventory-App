interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function SearchInput({ value, onChange, placeholder }: SearchInputProps) {
  return (
    <div className="search-input">
      <label>
        Buscar
        <input
          type="search"
          value={value}
          placeholder={placeholder ?? "Buscar itens..."}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    </div>
  );
}
