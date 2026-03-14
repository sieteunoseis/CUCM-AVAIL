interface Props {
  active: boolean;
  size?: "sm" | "md" | "lg";
  label?: string;
}

const sizes = {
  sm: "w-2 h-2",
  md: "w-3 h-3",
  lg: "w-4 h-4",
};

export default function StatusIndicator({ active, size = "md", label }: Props) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={`${sizes[size]} rounded-full ${
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
