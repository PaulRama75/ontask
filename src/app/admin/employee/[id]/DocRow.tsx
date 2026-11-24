"use client";

import { useState } from "react";
import { deleteEmployeeDocument, renameEmployeeDocument } from "../../actions";
import PinConfirmButton from "../../PinConfirmButton";
import PinUnlockLink from "../../PinUnlockLink";

type DocLite = { id: string; fileName: string; label: string | null; size: number };

// One row in the Documents section. Admin/Super Admin get inline
// rename/delete controls for cleaning up extra or mislabeled uploads;
// everyone else with full-view access just gets the link.
export default function DocRow({
  employeeId,
  doc,
  canManage,
}: {
  employeeId: string;
  doc: DocLite;
  canManage: boolean;
}) {
  const [renaming, setRenaming] = useState(false);
  const title = doc.label?.trim();
  const displayName = title && title !== doc.fileName ? title : doc.fileName;

  if (renaming) {
    return (
      <li>
        <form action={renameEmployeeDocument} onSubmit={() => setRenaming(false)}>
          <input type="hidden" name="documentId" value={doc.id} />
          <input type="hidden" name="employeeId" value={employeeId} />
          <input
            name="fileName"
            defaultValue={doc.fileName}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onBlur={(e) => e.currentTarget.form?.requestSubmit()}
            onKeyDown={(e) => {
              if (e.key === "Escape") setRenaming(false);
            }}
            className="w-full max-w-64 rounded-lg border border-sky-400/60 bg-[#0a1426] px-2 py-0.5 text-xs text-white focus:outline-none"
          />
        </form>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <PinUnlockLink
        href={`/api/files/${doc.id}`}
        scope="file"
        title={doc.fileName}
        className="min-w-0 break-all text-xs text-sky-300 hover:text-sky-200 hover:underline"
      >
        {displayName}
      </PinUnlockLink>
      <span className="text-[11px] text-slate-500">{(doc.size / 1024).toFixed(0)} KB</span>
      {canManage && (
        <>
          <button
            type="button"
            onClick={() => setRenaming(true)}
            title="Rename"
            className="text-[11px] text-slate-500 hover:text-sky-300"
          >
            ✎ Rename
          </button>
          <PinConfirmButton
            action={deleteEmployeeDocument}
            fields={{ documentId: doc.id, employeeId }}
            confirmMessage={`Delete "${doc.fileName}"? This can't be undone.`}
            className="text-[11px] text-rose-400 hover:text-rose-300"
          >
            ✕ Delete
          </PinConfirmButton>
        </>
      )}
    </li>
  );
}
