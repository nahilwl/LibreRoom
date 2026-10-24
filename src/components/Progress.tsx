/** Determinate when `value` is 0..1, indeterminate when undefined. */
export function Progress({ value, label }: { value?: number; label: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-muted">
        <span>{label}</span>
        {value !== undefined && <span className="tabular-nums">{Math.round(value * 100)} %</span>}
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value === undefined ? undefined : Math.round(value * 100)}
        className="h-2 overflow-hidden rounded-full bg-line"
      >
        <div
          className={`h-full rounded-full bg-accent ${value === undefined ? "w-1/3 animate-[slide_1.2s_ease-in-out_infinite]" : "transition-[width]"}`}
          style={value === undefined ? undefined : { width: `${value * 100}%` }}
        />
      </div>
    </div>
  );
}
