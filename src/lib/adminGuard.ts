import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySessionToken, ADMIN_COOKIE_NAME } from "./adminAuth";

export async function requireAdminOrRedirect(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  if (!verifySessionToken(token)) {
    redirect("/admin/login");
  }
}
