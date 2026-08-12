import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdminRole, getNavAccess, firstAllowedNavHref } from "@/lib/rbac";
import NewInvoiceForm from "./NewInvoiceForm";

export const dynamic = "force-dynamic";

export default async function NewInvoicePage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const nav = await getNavAccess(me.role);
  if (!nav.invoices) redirect(firstAllowedNavHref(nav));
  if (me.role !== "PROJECT_MANAGER" && !isAdminRole(me.role)) redirect("/admin/invoices");

  return (
    <main className="min-h-screen bg-slate-950 py-8">
      <div className="mx-auto max-w-lg px-4">
        <h1 className="text-2xl font-bold text-white">New invoice</h1>
        <NewInvoiceForm />
      </div>
    </main>
  );
}
