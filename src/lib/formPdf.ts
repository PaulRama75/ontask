import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { FER_LOGO_PNG_BASE64 } from "./ferLogo";

// Shared drawing kit for PDFs that recreate FER's Word forms (logo header box,
// gray section bars, bordered label/value grid, legal footer) on Letter paper.
// Positions are in PDF points measured from the top-left.

export const PAGE_W = 612;
export const PAGE_H = 792;
export const L = 36.7;
export const R = 572.7;

const LABEL_SIZE = 10;
const VALUE_SIZE = 10;
const PAD_X = 4;
const PAD_Y = 3.5;
const LINE_H = 12;
const GRAY = rgb(0.851, 0.851, 0.851);
const BLACK = rgb(0, 0, 0);
const BORDER = 0.75;

const LEGAL =
  'Fixed Equipment Reliability Mechanical Integrity Procedures are the property of Fixed Equipment Reliability Corporate and Business Services LLC. A Fixed Equipment Reliability Mechanical Integrity Procedure or copy thereof shall not be distributed (except with express approval of Fixed Equipment Reliability) to any individual or firm beyond the intended recipient firm or individual. Firms or individuals acting contrary to the above may be subject to suit, ineligibility for continued or future employment, or removal from Fixed Equipment Reliability\'s "Approved Manufacturers and Specialty Contractors List."';

// The standard PDF fonts only cover WinAnsi; anything else (emoji, CJK...)
// would make pdf-lib throw, so normalize common typographic characters and
// drop the rest rather than failing the whole submission.
export function clean(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\n\x20-\x7E\xA0-\xFF]/g, "");
}

export function dateOnly(d: Date | null): string {
  if (!d) return "";
  const [y, m, day] = d.toISOString().slice(0, 10).split("-");
  return `${m}/${day}/${y}`;
}

export function yesNo(v: boolean | null): string {
  return v == null ? "" : v ? "Yes" : "No";
}

export function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of clean(text).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
      } else {
        if (line) out.push(line);
        // A single word wider than the cell (long email, etc.) is hard-broken.
        let w = word;
        while (font.widthOfTextAtSize(w, size) > width && w.length > 1) {
          let i = w.length - 1;
          while (i > 1 && font.widthOfTextAtSize(w.slice(0, i), size) > width) i--;
          out.push(w.slice(0, i));
          w = w.slice(i);
        }
        line = w;
      }
    }
    out.push(line);
  }
  return out;
}

export type Cell = {
  x0: number;
  x1: number;
  text: string;
  kind: "label" | "value" | "section" | "note";
  align?: "left" | "center";
  // A label and its value sharing one cell (no divider).
  inlineValue?: string;
  // Custom content (checkboxes etc.) drawn inside the cell instead of text.
  draw?: (ctx: { x0: number; x1: number; top: number; bottom: number }) => void;
};

export async function createFormPdf(opts: {
  docTitle: string;
  title: string;
  formCode: string;
  issueDate: string;
  revisionDate: string;
  submittedLine: string;
}) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(opts.docTitle);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(Buffer.from(FER_LOGO_PNG_BASE64, "base64"));
  const page: PDFPage = pdf.addPage([PAGE_W, PAGE_H]);

  const Y = (top: number) => PAGE_H - top;
  const box = (x0: number, top: number, x1: number, bottom: number, fill = false) =>
    page.drawRectangle({
      x: x0,
      y: Y(bottom),
      width: x1 - x0,
      height: bottom - top,
      borderColor: BLACK,
      borderWidth: BORDER,
      ...(fill ? { color: GRAY } : {}),
    });
  const text = (s: string, x: number, baselineTop: number, size: number, f: PDFFont, color = BLACK) =>
    page.drawText(clean(s), { x, y: Y(baselineTop), size, font: f, color });

  // ---------- header block ----------
  const hTop = 36.7;
  const hBottom = 130.1;
  const hRight = 574;
  const logoCellR = 154.6;
  box(L, hTop, hRight, hBottom);
  page.drawLine({ start: { x: logoCellR, y: Y(hTop) }, end: { x: logoCellR, y: Y(hBottom) }, thickness: BORDER, color: BLACK });
  page.drawLine({ start: { x: logoCellR, y: Y(103.1) }, end: { x: hRight, y: Y(103.1) }, thickness: BORDER, color: BLACK });
  const logoW = 82.5;
  const logoH = (logo.height / logo.width) * logoW;
  page.drawImage(logo, {
    x: (L + logoCellR) / 2 - logoW / 2,
    y: Y((hTop + hBottom) / 2 + logoH / 2),
    width: logoW,
    height: logoH,
  });
  const rightText = (s: string, baselineTop: number, size: number, f: PDFFont, color = BLACK) =>
    text(s, hRight - 6 - f.widthOfTextAtSize(clean(s), size), baselineTop, size, f, color);
  rightText(opts.title, 53, 15, bold);
  rightText(opts.formCode, 71, 12.5, font);
  rightText(`Issue Date: ${opts.issueDate}`, 85.5, 7.5, font);
  rightText(`Revision Date: ${opts.revisionDate}`, 95.5, 7.5, font);
  rightText(opts.submittedLine, 119.5, 8, font, rgb(0.35, 0.35, 0.35));

  // ---------- form table ----------
  let top = 145.6;

  const drawRow = (cells: Cell[], minH: number) => {
    // Measure first so a row can grow when a value is longer than the
    // original form's line allows.
    const measured = cells.map((c) => {
      const f = c.kind === "value" || c.kind === "note" ? font : bold;
      const size = c.kind === "value" ? VALUE_SIZE : LABEL_SIZE;
      const width = c.x1 - c.x0 - PAD_X * 2;
      if (c.draw) return { f, size, lines: [] as string[], valueLines: [] as string[], labelW: 0 };
      if (c.inlineValue !== undefined) {
        const labelW = bold.widthOfTextAtSize(clean(c.text), LABEL_SIZE) + 6;
        return { f, size, lines: [c.text], valueLines: wrap(c.inlineValue, font, VALUE_SIZE, width - labelW), labelW };
      }
      return { f, size, lines: wrap(c.text, f, size, width), valueLines: [] as string[], labelW: 0 };
    });
    const need = Math.max(...measured.map((m) => Math.max(m.lines.length, m.valueLines.length) * LINE_H + PAD_Y * 2));
    const h = Math.max(minH, need);
    const bottom = top + h;

    cells.forEach((c, i) => {
      const m = measured[i];
      box(c.x0, top, c.x1, bottom, c.kind === "section");
      if (c.draw) {
        c.draw({ x0: c.x0, x1: c.x1, top, bottom });
        return;
      }
      const block = Math.max(m.lines.length, m.valueLines.length) * LINE_H;
      let baseline = top + (h - block) / 2 + LINE_H - 2.5;
      if (c.inlineValue !== undefined) {
        text(m.lines[0], c.x0 + PAD_X, baseline, LABEL_SIZE, bold);
        let vb = baseline;
        for (const vl of m.valueLines) {
          text(vl, c.x0 + PAD_X + m.labelW, vb, VALUE_SIZE, font);
          vb += LINE_H;
        }
        return;
      }
      for (const line of m.lines) {
        const w = m.f.widthOfTextAtSize(line, m.size);
        const center = c.kind === "section" || c.align === "center";
        text(line, center ? (c.x0 + c.x1) / 2 - w / 2 : c.x0 + PAD_X, baseline, m.size, m.f);
        baseline += LINE_H;
      }
    });
    top = bottom;
  };

  const section = (title: string, h = 16) => drawRow([{ x0: L, x1: R, text: title, kind: "section" }], h);
  const lab = (x0: number, x1: number, s: string, align: "left" | "center" = "left"): Cell => ({
    x0,
    x1,
    text: s,
    kind: "label",
    align,
  });
  const val = (x0: number, x1: number, s: string | null, align: "left" | "center" = "left"): Cell => ({
    x0,
    x1,
    text: s ?? "",
    kind: "value",
    align,
  });

  // A Word-style checkbox: an empty square, with an X when checked.
  const checkbox = (x: number, centerTop: number, checked: boolean) => {
    const s = 7.5;
    const t = centerTop - s / 2;
    page.drawRectangle({ x, y: Y(t + s), width: s, height: s, borderColor: BLACK, borderWidth: 0.6 });
    if (checked) {
      page.drawLine({ start: { x: x + 1.3, y: Y(t + 1.3) }, end: { x: x + s - 1.3, y: Y(t + s - 1.3) }, thickness: 1, color: BLACK });
      page.drawLine({ start: { x: x + s - 1.3, y: Y(t + 1.3) }, end: { x: x + 1.3, y: Y(t + s - 1.3) }, thickness: 1, color: BLACK });
    }
  };

  // "[ ] - Yes  /  [ ] - No" exactly as on the forms; neither box ticked when unanswered.
  const yesNoCell = (x0: number, x1: number, v: boolean | null): Cell => ({
    x0,
    x1,
    text: "",
    kind: "value",
    draw: ({ x0: cx, top: ct, bottom: cb }) => {
      const mid = (ct + cb) / 2;
      const base = mid + 3.5;
      let x = cx + 8;
      checkbox(x, mid, v === true);
      x += 10;
      text("- Yes   /", x, base, VALUE_SIZE, font);
      x += font.widthOfTextAtSize("- Yes   /", VALUE_SIZE) + 6;
      checkbox(x, mid, v === false);
      text("- No", x + 10, base, VALUE_SIZE, font);
    },
  });

  const finish = async (): Promise<Uint8Array> => {
    const parts: [string, PDFFont][] = [["Page ", font], ["1", bold], [" of ", font], ["1", bold]];
    let px = R - parts.reduce((s, [t, f]) => s + f.widthOfTextAtSize(t, 9), 0);
    for (const [t, f] of parts) {
      text(t, px, 721, 9, f);
      px += f.widthOfTextAtSize(t, 9);
    }
    let ly = 729;
    for (const line of wrap(LEGAL, font, 5.2, R - L)) {
      text(line, (L + R) / 2 - font.widthOfTextAtSize(line, 5.2) / 2, ly, 5.2, font);
      ly += 6.3;
    }
    return pdf.save();
  };

  return {
    page,
    font,
    bold,
    text,
    box,
    checkbox,
    drawRow,
    section,
    lab,
    val,
    yesNoCell,
    finish,
    get top() {
      return top;
    },
    set top(v: number) {
      top = v;
    },
  };
}

export function submittedLine(by: string, at: Date): string {
  const when = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(at);
  return `Submitted by ${by} on ${when} CT`;
}
