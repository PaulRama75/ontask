// Small presentational pill for binary status indicators (active/approved vs
// inactive/pending). Server component — markup only, no logic. emerald for the
// positive "active" tone, slate for the muted "inactive" tone.

export default function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "active" | "inactive";
}) {
  const toneClass =
    tone === "active"
      ? "border border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
      : "border border-white/10 bg-white/5 text-slate-400";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${toneClass}`}
    >
      {label}
    </span>
  );
}
