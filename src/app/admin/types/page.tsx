import { requireAdminOrRedirect } from "@/lib/adminGuard";
import AdminShell from "@/components/admin/AdminShell";
import AdminTypesBody from "@/components/admin/AdminTypesBody";
import { GUIDE_TYPES } from "@/lib/guideData";

export default async function AdminTypesPage() {
  await requireAdminOrRedirect();
  return (
    <AdminShell active="/admin/types">
      <AdminTypesBody types={GUIDE_TYPES} />
    </AdminShell>
  );
}
