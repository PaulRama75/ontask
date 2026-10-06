import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { TravelRequest } from "@prisma/client";
import { FER_LOGO_PNG_BASE64 } from "./ferLogo";

// Recreates the FER-OP-FORM-01 "FER Travel Request Form (Single)" layout
// (OP-FORM-02 file) with the submitted values filled in. Positions are in PDF
// points measured from the top-left, mirroring the Word original on Letter paper.

const PAGE_W = 612;
const PAGE_H = 792;
const L = 36.7;
const R = 572.7;

// Column boundaries taken from the original table grid.
const C = {
  c203: 130.8,
  c253: 163.0,
  c263: 169.4,
  c343: 221.0,
  c445: 286.7,
  c472: 304.1,
  c497: 320.2,
  c645: 415.5,
  c680: 438.1,
  c700: 450.9,
};

const LABEL_SIZE = 10;
const VALUE_SIZE = 10;
const PAD_X = 4;
const PAD_Y = 3.5;
const GRAY = rgb(0.851, 0.851, 0.851);
const BLACK = rgb(0, 0, 0);
const BORDER = 0.75;

const LEGAL =
  'Fixed Equipment Reliability Mechanical Integrity Procedures are the property of Fixed Equipment Reliability Corporate and Business Services LLC. A Fixed Equipment Reliability Mechanical Integrity Procedure or copy thereof shall not be distributed (except with express approval of Fixed Equipment Reliability) to any individual or firm beyond the intended recipient firm or individual. Firms or individuals acting contrary to the above may be subject to suit, ineligibility for continued or future employment, or removal from Fixed Equipment Reliability\'s "Approved Manufacturers and Specialty Contractors List."';

// The standard PDF fonts only cover WinAnsi; anything else (emoji, CJK...)
// would make pdf-lib throw, so normalize common typographic characters and
// drop the rest rather than failing the whole submission.
function clean(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\n\x20-\x7E\xA0-\xFF]/g, "");
}

function dateOnly(d: Date | null): string {
  if (!d) return "";
  const [y, m, day] = d.toISOString().slice(0, 10).split("-");
  return `${m}/${day}/${y}`;
}

function yesNo(v: boolean | null): string {
  return v == null ? "" : v ? "Yes" : "No";
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
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

type Cell = {
  x0: number;
  x1: number;
  text: string;
  kind: "label" | "value" | "section" | "note";
  align?: "left" | "center";
  // A label and its value sharing one cell (no divider), as on the original
  // "Rental Car Type Justification" row.
  inlineValue?: string;
};

export async function buildTravelRequestPdf(
  tr: TravelRequest,
  employeeName: string,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Travel Request - ${tr.fullName || employeeName}`);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(Buffer.from(FER_LOGO_PNG_BASE64, "base64"));
  const page: PDFPage = pdf.addPage([PAGE_W, PAGE_H]);

  const Y = (top: number) => PAGE_H - top;
  const box = (x0: number, top: number, x1: number, bottom: number, fill?: typeof GRAY) =>
    page.drawRectangle({
      x: x0,
      y: Y(bottom),
      width: x1 - x0,
      height: bottom - top,
      borderColor: BLACK,
      borderWidth: BORDER,
      ...(fill ? { color: fill } : {}),
    });

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
  const rightText = (text: string, baselineTop: number, size: number, f: PDFFont) =>
    page.drawText(text, { x: hRight - 6 - f.widthOfTextAtSize(text, size), y: Y(baselineTop), size, font: f, color: BLACK });
  rightText("FER TRAVEL REQUEST FORM (SINGLE)", 53, 15, bold);
  rightText("FER-OP-FORM-01", 71, 12.5, font);
  rightText("Issue Date: 06/25/2026", 85.5, 7.5, font);
  rightText("Revision Date: 06/25/2026", 95.5, 7.5, font);

  const submittedAt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(tr.createdAt);
  const submittedLine = clean(`Submitted by ${tr.submittedByName} on ${submittedAt} CT`);
  page.drawText(submittedLine, {
    x: hRight - 6 - font.widthOfTextAtSize(submittedLine, 8),
    y: Y(119.5),
    size: 8,
    font,
    color: rgb(0.35, 0.35, 0.35),
  });

  // ---------- form table ----------
  let top = 145.6;

  const drawRow = (cells: Cell[], minH: number) => {
    // Measure every cell's wrapped text first so the row can grow if a value
    // is longer than the original form's line allows.
    const measured = cells.map((c) => {
      const f = c.kind === "value" || c.kind === "note" ? font : bold;
      const size = c.kind === "value" ? VALUE_SIZE : LABEL_SIZE;
      const width = c.x1 - c.x0 - PAD_X * 2;
      if (c.inlineValue !== undefined) {
        const labelW = bold.widthOfTextAtSize(c.text, LABEL_SIZE) + 6;
        const valueLines = wrap(c.inlineValue, font, VALUE_SIZE, width - labelW);
        return { f, size, lines: [c.text], valueLines, labelW };
      }
      return { f, size, lines: wrap(c.text, f, size, width), valueLines: [] as string[], labelW: 0 };
    });
    const lineH = 12;
    const need = Math.max(
      ...measured.map((m) => Math.max(m.lines.length, m.valueLines.length) * lineH + PAD_Y * 2),
    );
    const h = Math.max(minH, need);
    const bottom = top + h;

    cells.forEach((c, i) => {
      const m = measured[i];
      box(c.x0, top, c.x1, bottom, c.kind === "section" ? GRAY : undefined);
      const block = Math.max(m.lines.length, m.valueLines.length) * lineH;
      let baseline = top + (h - block) / 2 + lineH - 2.5;
      if (c.inlineValue !== undefined) {
        page.drawText(m.lines[0], { x: c.x0 + PAD_X, y: Y(baseline), size: LABEL_SIZE, font: bold, color: BLACK });
        let vb = baseline;
        for (const vl of m.valueLines) {
          page.drawText(vl, { x: c.x0 + PAD_X + m.labelW, y: Y(vb), size: VALUE_SIZE, font, color: BLACK });
          vb += lineH;
        }
        return;
      }
      for (const line of m.lines) {
        const w = m.f.widthOfTextAtSize(line, m.size);
        const center = c.kind === "section" || c.align === "center";
        const x = center ? (c.x0 + c.x1) / 2 - w / 2 : c.x0 + PAD_X;
        page.drawText(line, { x, y: Y(baseline), size: m.size, font: m.f, color: BLACK });
        baseline += lineH;
      }
    });
    top = bottom;
  };

  const section = (title: string) => drawRow([{ x0: L, x1: R, text: title, kind: "section" }], 16);
  const lab = (x0: number, x1: number, text: string): Cell => ({ x0, x1, text, kind: "label" });
  const val = (x0: number, x1: number, text: string | null, align: "left" | "center" = "left"): Cell => ({
    x0,
    x1,
    text: text ?? "",
    kind: "value",
    align,
  });

  section("TRAVEL REQUEST FORM");
  drawRow(
    [lab(L, C.c253, "FER Job Number:"), val(C.c253, C.c497, tr.jobNumber), lab(C.c497, C.c645, "Client Name:"), val(C.c645, R, tr.clientName)],
    18,
  );

  section("Traveler Information");
  drawRow([lab(L, C.c343, "Full Name (As it appears on ID):"), val(C.c343, R, tr.fullName)], 18);
  drawRow(
    [
      lab(L, C.c203, "Date of Birth:"),
      val(C.c203, C.c497, dateOnly(tr.dateOfBirth), "center"),
      lab(C.c497, C.c645, "Gender:"),
      val(C.c645, R, tr.gender, "center"),
    ],
    18,
  );
  drawRow(
    [
      lab(L, C.c343, "Known Traveler # (If applicable):"),
      val(C.c343, C.c497, tr.knownTravelerNumber),
      lab(C.c497, C.c645, "Phone Number:"),
      val(C.c645, R, tr.phone),
    ],
    18,
  );
  drawRow([lab(L, C.c203, "Email Address:"), val(C.c203, R, tr.email)], 18);

  section("Flight Information");
  drawRow(
    [
      lab(L, C.c263, "Flight Needed:"),
      val(C.c263, C.c445, yesNo(tr.flightNeeded), "center"),
      lab(C.c445, C.c700, "Travel Type:"),
      val(C.c700, R, tr.travelType, "center"),
    ],
    18,
  );
  drawRow(
    [
      lab(L, C.c263, "Date of Departure:"),
      val(C.c263, C.c445, dateOnly(tr.dateOfDeparture), "center"),
      lab(C.c445, C.c700, "Date of Return (if applicable):"),
      val(C.c700, R, dateOnly(tr.dateOfReturn), "center"),
    ],
    23,
  );
  drawRow(
    [
      lab(L, C.c263, "Departure Location:"),
      val(C.c263, C.c445, tr.departureLocation),
      lab(C.c445, C.c700, "Destination Location:"),
      val(C.c700, R, tr.destinationLocation),
    ],
    18,
  );
  drawRow(
    [
      lab(L, C.c263, "Window or Aisle Seat\n(if available):"),
      val(C.c263, C.c445, tr.seatPreference, "center"),
      lab(C.c445, C.c700, "Time of Travel Preference (if\navailable):"),
      val(C.c700, R, tr.timePreference, "center"),
    ],
    23,
  );

  section("Rental Car Information");
  drawRow(
    [
      lab(L, C.c263, "Rental Car Needed:"),
      val(C.c263, C.c472, yesNo(tr.rentalCarNeeded), "center"),
      lab(C.c472, C.c680, "Pickup Location:"),
      val(C.c680, R, tr.pickupLocation),
    ],
    18,
  );
  drawRow(
    [
      lab(L, C.c263, "Rental Car Type:"),
      val(C.c263, C.c472, tr.rentalCarType, "center"),
      lab(C.c472, C.c680, "Dropoff Location:"),
      val(C.c680, R, tr.dropoffLocation),
    ],
    18,
  );
  drawRow(
    [{ x0: L, x1: R, text: "Rental Car Type Justification:", kind: "label", inlineValue: tr.rentalCarJustification ?? "" }],
    18,
  );
  drawRow(
    [
      lab(L, C.c263, "Date of Pickup:"),
      val(C.c263, C.c472, dateOnly(tr.dateOfPickup), "center"),
      lab(C.c472, C.c680, "Date of Return:"),
      val(C.c680, R, dateOnly(tr.dateOfCarReturn), "center"),
    ],
    18,
  );

  section("Receipt To Be Sent To");
  drawRow([lab(L, C.c263, "Email Address\nof Manager for Billing:"), val(C.c263, R, tr.billingManagerEmail)], 23);

  section("Additional Comments");
  // Comments box: top-aligned like a text area, fixed height as on the form.
  {
    const commentsH = 88;
    const width = R - L - PAD_X * 2;
    let size = VALUE_SIZE;
    let lines = wrap(tr.additionalComments ?? "", font, size, width);
    while (lines.length * (size + 2) > commentsH - PAD_Y * 2 && size > 7) {
      size -= 0.5;
      lines = wrap(tr.additionalComments ?? "", font, size, width);
    }
    const h = Math.max(commentsH, lines.length * (size + 2) + PAD_Y * 2);
    box(L, top, R, top + h);
    let b = top + PAD_Y + size;
    for (const line of lines) {
      page.drawText(line, { x: L + PAD_X, y: Y(b), size, font, color: BLACK });
      b += size + 2;
    }
    top += h;
  }
  drawRow([{ x0: L, x1: R, text: "", kind: "section" }], 13);
  drawRow(
    [
      {
        x0: L,
        x1: R,
        text: "*Send form to Travel Administrator for processing. Confirmation email will be sent to Manager and Traveler.",
        kind: "note",
      },
    ],
    19.5,
  );

  // ---------- page footer ----------
  const parts: [string, PDFFont][] = [["Page ", font], ["1", bold], [" of ", font], ["1", bold]];
  let px = R - parts.reduce((s, [t, f]) => s + f.widthOfTextAtSize(t, 9), 0);
  for (const [t, f] of parts) {
    page.drawText(t, { x: px, y: Y(721), size: 9, font: f, color: BLACK });
    px += f.widthOfTextAtSize(t, 9);
  }
  const legalSize = 5.2;
  let ly = 729;
  for (const line of wrap(LEGAL, font, legalSize, R - L)) {
    const w = font.widthOfTextAtSize(line, legalSize);
    page.drawText(line, { x: (L + R) / 2 - w / 2, y: Y(ly), size: legalSize, font, color: BLACK });
    ly += 6.3;
  }

  return pdf.save();
}

export function travelPdfFileName(tr: TravelRequest, employeeName: string): string {
  const who = (tr.fullName || employeeName || "employee").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `Travel-Request-${who}-${tr.createdAt.toISOString().slice(0, 10)}.pdf`;
}
