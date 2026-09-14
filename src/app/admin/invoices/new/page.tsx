import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isAdminRole, getNavAccess, firstAllowedNavHref } from "@/lib/rbac";
import NewInvoiceForm from "./NewInvoiceForm";

export const dynamic = "force-dynamic";

export default async function NewInvoicePage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const nav = await getNavAccess(me.role);
  if (!nav.invoices) redirect(firstAllowedNavHref(nav));
  if (me.role !== "PROJECT_MANAGER" && me.role !== "PROJECT_LEAD" && !isAdminRole(me.role)) {
    redirect("/admin/invoices");
  }

  // Suggestions for the client name / job number fields, so repeat entries
  // (same client billed again, same job renumbered) don't need retyping.
  const [clients, jobNumbers] = await Promise.all([
    prisma.client.findMany({ select: { name: true }, distinct: ["name"], orderBy: { name: "asc" } }),
    prisma.invoice.findMany({
      where: { jobNumber: { not: null } },
      select: { jobNumber: true },
      distinct: ["jobNumber"],
      orderBy: { jobNumber: "asc" },
    }),
  ]);

  return (
    <main className="min-h-screen py-8">
      <div className="mx-auto max-w-lg px-4">
        <h1 className="text-2xl font-bold text-white">New invoice</h1>
        <NewInvoiceForm
          clientNames={clients.map((c) => c.name)}
          jobNumbers={jobNumbers.map((j) => j.jobNumber!).filter(Boolean)}
        />
      </div>
    </main>
  );
}
