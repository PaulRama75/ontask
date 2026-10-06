import type { TravelRequest } from "@prisma/client";
import { createFormPdf, dateOnly, yesNo, wrap, submittedLine, L, R } from "./formPdf";

// Recreates the FER-OP-FORM-01 "FER Travel Request Form (Single)" layout
// (OP-FORM-02 file) with the submitted values filled in.

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

export async function buildTravelRequestPdf(tr: TravelRequest, employeeName: string): Promise<Uint8Array> {
  const f = await createFormPdf({
    docTitle: `Travel Request - ${tr.fullName || employeeName}`,
    title: "FER TRAVEL REQUEST FORM (SINGLE)",
    formCode: "FER-OP-FORM-01",
    issueDate: "06/25/2026",
    revisionDate: "06/25/2026",
    submittedLine: submittedLine(tr.submittedByName, tr.createdAt),
  });
  const { drawRow, section, lab, val } = f;

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
  // Comments box: top-aligned like a text area, fixed height as on the form;
  // long comments shrink before the box is allowed to grow.
  {
    const commentsH = 88;
    const width = R - L - 8;
    let size = 10;
    let lines = wrap(tr.additionalComments ?? "", f.font, size, width);
    while (lines.length * (size + 2) > commentsH - 7 && size > 7) {
      size -= 0.5;
      lines = wrap(tr.additionalComments ?? "", f.font, size, width);
    }
    const h = Math.max(commentsH, lines.length * (size + 2) + 7);
    f.box(L, f.top, R, f.top + h);
    let b = f.top + 3.5 + size;
    for (const line of lines) {
      f.text(line, L + 4, b, size, f.font);
      b += size + 2;
    }
    f.top += h;
  }
  section("", 13);
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

  return f.finish();
}

export function travelPdfFileName(tr: TravelRequest, employeeName: string): string {
  const who = (tr.fullName || employeeName || "employee").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `Travel-Request-${who}-${tr.createdAt.toISOString().slice(0, 10)}.pdf`;
}
