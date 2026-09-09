"use client";

export default function DownloadAllButton({ attachmentIds }: { attachmentIds: string[] }) {
  function downloadAll() {
    attachmentIds.forEach((id, i) => {
      // Stagger slightly — firing many downloads in the same tick makes some
      // browsers block all but the first as a suspected pop-up flood.
      setTimeout(() => {
        const a = document.createElement("a");
        a.href = `/api/invoice-files/${id}?dl=1`;
        a.click();
      }, i * 300);
    });
  }

  return (
    <button
      type="button"
      onClick={downloadAll}
      className="text-xs font-medium text-cyan-400 hover:underline"
    >
      Download all ({attachmentIds.length})
    </button>
  );
}
