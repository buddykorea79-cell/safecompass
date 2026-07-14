import { requireAdminOrRedirect } from "@/lib/adminGuard";
import AdminShell from "@/components/admin/AdminShell";
import AdminApiTestBody from "@/components/admin/AdminApiTestBody";
import AdminShelterSnapshotBody from "@/components/admin/AdminShelterSnapshotBody";

export default async function AdminApiTestPage() {
  await requireAdminOrRedirect();
  return (
    <AdminShell active="/admin/api-test">
      <AdminShelterSnapshotBody />
      <AdminApiTestBody />
    </AdminShell>
  );
}
