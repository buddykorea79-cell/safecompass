import { requireAdminOrRedirect } from "@/lib/adminGuard";
import AdminShell from "@/components/admin/AdminShell";
import AdminApiStatusBody from "@/components/admin/AdminApiStatusBody";
import { providerStatuses } from "@/lib/env";

export default async function AdminApiStatusPage() {
  await requireAdminOrRedirect();
  return (
    <AdminShell active="/admin/api-status">
      <AdminApiStatusBody providers={providerStatuses()} />
    </AdminShell>
  );
}
