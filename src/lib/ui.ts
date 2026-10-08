// Shared dark-theme class-string tokens.
//
// These capture the recurring Tailwind patterns already used across the admin
// shell, login, onboarding, profile, invoices, timesheets, users, and grid
// surfaces plus the approved PinDialog mockup. Importing them keeps the look
// cohesive and the class strings in one place. Palette: dark slate
// (#0b1120 / #0f172a) backgrounds, cyan->blue accents (#22d3ee -> #3b82f6),
// white/10 borders.
//
// RESTYLE-ONLY: these are presentational strings. They carry no behavior and
// are safe to compose into a className with other utility classes.

/** Page/main wrapper: centered max-width column with standard padding. */
export const pageClass = "mx-auto max-w-7xl px-4 py-8";

/** Elevated panel/card: rounded, subtle border, translucent slate, blur. */
export const cardClass =
  "rounded-xl border border-white/10 bg-slate-900/60 shadow-lg shadow-black/30 backdrop-blur";

/** Card variant with built-in padding for simple content panels. */
export const cardPaddedClass = `${cardClass} p-6`;

/** Primary action button: cyan->blue gradient, glow, subtle hover scale. */
export const primaryButtonClass =
  "rounded-md bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-cyan-500/25 transition-transform hover:scale-[1.02] hover:shadow-cyan-500/40 disabled:scale-100 disabled:opacity-60";

/** Secondary action button: outlined, muted, hover tint. */
export const secondaryButtonClass =
  "rounded-md border border-white/10 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-white/5";

/** Text input / select field. */
export const inputClass =
  "mt-1 w-full rounded-md border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 transition-colors focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400";

/** Form field label. */
export const labelClass = "block text-sm font-medium text-slate-300";

/** Table header cell: uppercase, tracked, muted. */
export const thClass = "px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-400";

/** Table body cell. */
export const tdClass = "px-4 py-3 text-slate-300";

/** Inline error banner. */
export const errorBoxClass =
  "rounded-md border border-rose-500/30 bg-rose-500/10 p-2 text-sm text-rose-300";

/** Inline success banner. */
export const successBoxClass =
  "rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-sm text-emerald-300";
