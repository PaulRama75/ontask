import type { StatusChangeRequest } from "@prisma/client";
import { createFormPdf, dateOnly, submittedLine, L, R, type Cell } from "./formPdf";

// Recreates the FER-HR-FORM-02 "FER Employee Status Change Form" layout with
// the submitted values filled in.

// Column boundaries taken from the original table grid.
const C = {
  c267: 172.0,
  c343: 221.0,
  c357: 230.0,
  c497: 320.2,
  c525: 338.2,
  c553: 356.2,
  c665: 428.4,
  c706: 454.8,
};

export async function buildStatusChangePdf(sc: StatusChangeRequest, employeeName: string): Promise<Uint8Array> {
  const f = await createFormPdf({
    docTitle: `Employee Status Change - ${employeeName}`,
    title: "FER EMPLOYEE STATUS CHANGE FORM",
    formCode: "FER-HR-FORM-02",
    issueDate: "06/23/2026",
    revisionDate: "06/23/2027",
    submittedLine: submittedLine(sc.submittedByName, sc.createdAt),
  });
  const { drawRow, section, lab, val, yesNoCell, checkbox, text, bold } = f;

  const types = new Set((sc.employmentType ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  const employmentCell: Cell = {
    x0: C.c497,
    x1: R,
    text: "",
    kind: "value",
    draw: ({ top, bottom }) => {
      const rowH = (bottom - top) / 2;
      const item = (label: string, x: number, row: number) => {
        const mid = top + rowH * row + rowH / 2;
        checkbox(x, mid, types.has(label));
        text(label, x + 10, mid + 3.3, 9.5, bold);
      };
      item("Full Time", 326.6, 0);
      item("Part Time", 407, 0);
      item("1099 Employee", 485, 0);
      item("Benefits", 326.6, 1);
      item("No Benefits", 407, 1);
    },
  };

  const toValue = [sc.toJobNumber, sc.newSite].filter(Boolean).join(" / ");

  section("EMPLOYEE STATUS CHANGE FORM", 19);
  drawRow(
    [
      lab(L, C.c267, "Employee Name:"),
      val(C.c267, C.c497, employeeName),
      lab(C.c497, C.c665, "Effective Date of\nChange:"),
      val(C.c665, R, dateOnly(sc.effectiveDate), "center"),
    ],
    29,
  );
  drawRow([lab(L, C.c267, "Reason for Change:"), val(C.c267, C.c497, sc.reasonForChange), employmentCell], 29);
  drawRow(
    [
      lab(L, C.c267, "From Job Number /\nsite:"),
      val(C.c267, C.c497, sc.fromJobNumber),
      lab(C.c497, C.c665, "To Job Number/\nsite:"),
      val(C.c665, R, toValue),
    ],
    26,
  );
  drawRow([lab(L, C.c267, "Details of Change:"), val(C.c267, R, sc.detailsOfChange)], 38);
  drawRow([lab(L, C.c357, "Driving Record Required:"), yesNoCell(C.c357, R, sc.drivingRecordRequired)], 19);
  drawRow(
    [
      lab(L, C.c357, "Corporate Credit Card Requested:"),
      yesNoCell(C.c357, C.c525, sc.creditCardRequested),
      lab(C.c525, C.c706, "Approved by GM:"),
      yesNoCell(C.c706, R, sc.creditCardApprovedByGm),
    ],
    19,
  );
  drawRow([lab(L, C.c497, "Deactivate FER Email/SharePoint Access:"), yesNoCell(C.c497, R, sc.deactivateEmailAccess)], 19);
  drawRow([lab(L, C.c497, "Deactivate FER Corporate American Express Card:"), yesNoCell(C.c497, R, sc.deactivateAmexCard)], 19);
  section("", 13);
  drawRow(
    [
      lab(L, C.c343, "Requesting Manager Name:", "center"),
      val(C.c343, C.c553, sc.requestingManagerName, "center"),
      lab(C.c553, C.c665, "Date:", "center"),
      val(C.c665, R, dateOnly(sc.createdAt), "center"),
    ],
    41,
  );
  section("", 13);
  drawRow([{ x0: L, x1: R, text: "All items must be filled out.", kind: "note", align: "center" }], 19);

  return f.finish();
}

export function statusChangePdfFileName(sc: StatusChangeRequest, employeeName: string): string {
  const who = (employeeName || "employee").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `Status-Change-${who}-${sc.createdAt.toISOString().slice(0, 10)}.pdf`;
}
