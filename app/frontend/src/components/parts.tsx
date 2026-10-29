import { cn } from '@/lib/utils';
import { AY_ETIKET, AyDurum, HAFTA_ETIKET, HaftaDurum } from '@/lib/types';

const durumRenk: Record<string, string> = {
  acik: 'text-[hsl(var(--durum-acik))] bg-[hsl(var(--durum-acik)/0.12)]',
  kapali: 'text-[hsl(var(--durum-kapali))] bg-[hsl(var(--durum-kapali)/0.14)]',
  onayli: 'text-[hsl(var(--durum-onayli))] bg-[hsl(var(--durum-onayli)/0.14)]',
  kesin: 'text-[hsl(var(--durum-kesin))] bg-[hsl(var(--durum-kesin)/0.14)]',
};

export function HaftaBadge({ durum }: { durum: HaftaDurum }) {
  return <DurumBadge durum={durum} label={HAFTA_ETIKET[durum]} />;
}

export function AyBadge({ durum }: { durum: AyDurum }) {
  return <DurumBadge durum={durum} label={AY_ETIKET[durum]} />;
}

function DurumBadge({ durum, label }: { durum: string; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold',
        durumRenk[durum]
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {label}
    </span>
  );
}

export function Figure({
  value,
  label,
  emphasis = false,
}: {
  value: string;
  label: string;
  emphasis?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className={cn('figure', emphasis ? 'text-primary' : 'text-foreground')}>{value}</p>
      <p className="hint mt-1 truncate">{label}</p>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card-surface flex flex-col items-center gap-2 px-6 py-10 text-center">
      <div className="grid size-11 place-items-center rounded-full bg-[hsl(var(--surface-2))] text-[hsl(var(--ink-soft))]">
        {icon}
      </div>
      <p className="section-title mt-1">{title}</p>
      <p className="hint max-w-[34ch]">{description}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function InlineError({ message }: { message: string }) {
  return (
    <p role="alert" className="text-[13px] font-medium text-destructive">
      {message}
    </p>
  );
}

export function SectionHead({
  title,
  extra,
}: {
  title: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="mb-2 flex items-end justify-between gap-3">
      <h2 className="section-title">{title}</h2>
      {extra}
    </div>
  );
}
