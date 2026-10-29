import { Loader2, X } from 'lucide-react';

export const inputCls =
  'min-h-11 w-full rounded-xl border border-[hsl(var(--line))] bg-background px-3 outline-none focus:border-primary';

/** Alttan açılan form katmanı (mobil öncelikli). */
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        aria-label="Kapat"
        onClick={onClose}
        className="absolute inset-0 bg-[hsl(167_18%_10%/0.45)]"
      />
      <div className="safe-bottom absolute inset-x-0 bottom-0 mx-auto max-h-[90vh] w-full max-w-[480px] overflow-y-auto rounded-t-[24px] border-t border-[hsl(var(--line))] bg-card px-5 pb-4 pt-3">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[hsl(var(--line))]" />
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="section-title">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="press grid size-10 place-items-center rounded-full bg-[hsl(var(--surface-2))]"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="space-y-3">{children}</div>
      </div>
    </div>
  );
}

export function SheetActions({
  busy,
  onSubmit,
  onCancel,
  label = 'Kaydet',
}: {
  busy: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  label?: string;
}) {
  return (
    <div className="flex gap-2 pt-1">
      <button
        type="button"
        onClick={onCancel}
        className="press min-h-12 flex-1 rounded-xl border border-[hsl(var(--line))] text-[15px] font-semibold"
      >
        Vazgeç
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onSubmit}
        className="press flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-45"
      >
        {busy && <Loader2 className="size-4 animate-spin" />}
        {label}
      </button>
    </div>
  );
}
