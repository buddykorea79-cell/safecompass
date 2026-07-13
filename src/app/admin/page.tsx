import { requireAdminOrRedirect } from "@/lib/adminGuard";
import AdminShell from "@/components/admin/AdminShell";
import AdminDashboardBody from "@/components/admin/AdminDashboardBody";

export default async function AdminDashboardPage() {
  await requireAdminOrRedirect();
  return (
    <AdminShell active="/admin">
      <AdminDashboardBody />
    </AdminShell>
  );
}
