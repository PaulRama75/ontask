"use client";

import { useState } from "react";
import { deleteEmployeeDocument, renameEmployeeDocument } from "../../actions";
import ConfirmSubmitButton from "../../ConfirmSubmitButton";

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
            className="w-64 rounded border border-cyan-400 bg-slate-800 px-2 py-0.5 text-sm text-white focus:outline-none"
          />
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-2">
      <a
        href={`/api/files/${doc.id}`}
        target="_blank"
        title={doc.fileName}
        className="text-sm text-cyan-400 hover:underline"
      >
        {displayName}
      </a>
      <span className="text-xs text-slate-500">{(doc.size / 1024).toFixed(0)} KB</span>
      {canManage && (
        <>
          <button
            type="button"
            onClick={() => setRenaming(true)}
            title="Rename"
            className="text-xs text-slate-500 hover:text-cyan-400"
          >
            ✎ Rename
          </button>
          <form action={deleteEmployeeDocument}>
            <input type="hidden" name="documentId" value={doc.id} />
            <input type="hidden" name="employeeId" value={employeeId} />
            <ConfirmSubmitButton
              confirmMessage={`Delete "${doc.fileName}"? This can't be undone.`}
              className="text-xs text-rose-400 hover:text-rose-300"
            >
              ✕ Delete
            </ConfirmSubmitButton>
          </form>
        </>
      )}
    </li>
  );
}
