import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Overlay modal rendered on document.body, so it is always centered on the screen
 * (page containers keep a CSS transform from their fade-in animation, which would
 * otherwise make position:fixed relative to the whole page). Esc / backdrop close it.
 */
export default function Modal({
  title,
  tone = "amber",
  onClose,
  closeDisabled = false,
  children,
  footer,
  testId = "modal",
}: {
  title: string;
  tone?: "amber" | "cyan" | "red";
  onClose: () => void;
  closeDisabled?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  testId?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !closeDisabled) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, closeDisabled]);

  const border = tone === "cyan" ? "border-noc-cyan/50" : tone === "red" ? "border-noc-red/50" : "border-noc-amber/50";
  const divide = tone === "cyan" ? "border-noc-cyan/30" : tone === "red" ? "border-noc-red/30" : "border-noc-amber/30";
  const text = tone === "cyan" ? "text-noc-cyan" : tone === "red" ? "text-noc-red" : "text-noc-amber";

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={() => !closeDisabled && onClose()}
      data-testid={`${testId}-backdrop`}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-3xl border ${border} bg-noc-surface font-mono text-xs shadow-2xl`}
        data-testid={testId}
      >
        <div className={`px-4 py-2.5 border-b ${divide} ${text} uppercase tracking-widest text-[11px] font-semibold`}>{title}</div>
        {children}
        {footer && <div className={`px-4 py-2.5 border-t ${divide} flex items-center justify-end gap-2`}>{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
