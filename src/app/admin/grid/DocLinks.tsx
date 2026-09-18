"use client";

import { useState } from "react";
import { deleteEmployeeDocument, renameEmployeeDocument } from "../actions";
import ConfirmSubmitButton from "../ConfirmSubmitButton";

type DocLite = { id: string; fileName: string; category: string; label: string | null };

// Renders attachment hyperlinks for a given document category. Prefers the
// document's title (Document.label, e.g. a certification name) as the link
// text so the user can tell which file is which without opening it. Admins
// get inline rename/delete controls for cleaning up extra or mislabeled
// uploads.
export default function DocLinks({
  employeeId,
  docs,
  category,
  canManage,
}: {
  employeeId: string;
  docs: DocLite[];
  category: string;
  canManage: boolean;
}) {
  const items = docs.filter((d) => d.category === category);
  if (items.length === 0) return <span className="text-slate-600">—</span>;
  return (
    <div className="flex flex-col gap-1">
      {items.map((d, i) => (
        <DocRow
          key={d.id}
          employeeId={employeeId}
          doc={d}
          index={i}
          multiple={items.length > 1}
          canManage={canManage}
        />
      ))}
    </div>
  );
}

function DocRow({
  employeeId,
  doc,
  index,
  multiple,
  canManage,
}: {
  employeeId: string;
  doc: DocLite;
  index: number;
  multiple: boolean;
  canManage: boolean;
}) {
  const [renaming, setRenaming] = useState(false);
  const title = doc.label?.trim();
  const displayName = title || (multiple ? `file ${index + 1}` : "view");

  if (renaming) {
    return (
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
          className="w-28 rounded border border-cyan-400 bg-slate-800 px-1 py-0.5 text-xs text-white focus:outline-none"
        />
      </form>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <a
        href={`/api/files/${doc.id}`}
        target="_blank"
        className="text-cyan-400 hover:underline"
        title={doc.fileName}
      >
        {displayName}
      </a>
      {canManage && (
        <>
          <button
            type="button"
            onClick={() => setRenaming(true)}
            title="Rename"
            className="text-xs text-slate-500 hover:text-cyan-400"
          >
            ✎
          </button>
          <form action={deleteEmployeeDocument}>
            <input type="hidden" name="documentId" value={doc.id} />
            <input type="hidden" name="employeeId" value={employeeId} />
            <ConfirmSubmitButton
              confirmMessage={`Delete "${doc.fileName}"? This can't be undone.`}
              className="text-xs text-rose-400 hover:text-rose-300"
            >
              ✕
            </ConfirmSubmitButton>
          </form>
        </>
      )}
    </div>
  );
}
