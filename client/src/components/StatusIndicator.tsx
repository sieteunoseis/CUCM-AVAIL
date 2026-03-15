interface Props {
  active: boolean;
  size?: "sm" | "md" | "lg";
  label?: string;
}

const sizes = {
  sm: "w-2 h-2",
  md: "w-2.5 h-2.5",
  lg: "w-3 h-3",
};

export default function StatusIndicator({ active, size = "md", label }: Props) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={`${sizes[size]} ${
          active
            ? "bg-noc-green animate-pulse-green"
            : "bg-noc-red animate-pulse-red"
        }`}
      />
      {label && (
        <span className="font-mono text-xs uppercase tracking-wider text-noc-text-dim">
          {label}
        </span>
      )}
    </span>
  );
}
