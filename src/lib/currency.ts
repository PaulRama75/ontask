const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

// 1234.5 -> "$1,234.50"; null/undefined -> "—".
export function formatCurrency(n: number | null | undefined): string {
  return n == null ? "—" : fmt.format(n);
}

// "$1,234.5" / "1234.5" -> 1234.5; anything unparseable -> null.
export function parseCurrency(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (cleaned === "" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isNaN(n) ? null : n;
}
