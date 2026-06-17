interface FieldProps {
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  rows: number;
  value: string;
}

export function Field({
  disabled = false,
  label,
  onChange,
  rows,
  value,
}: FieldProps) {
  return (
    <div className="field">
      <label>{label}</label>
      <textarea
        className="textarea"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        value={value}
      />
    </div>
  );
}
