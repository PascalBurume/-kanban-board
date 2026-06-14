import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole } from "@/lib/session";

// Real entry point: logged-in users land on their role home, everyone else on
// the login screen. (The old prototype hub lived here; it now lives at /demo.)
export default async function Home() {
  const user = await getCurrentUser();
  redirect(user ? homeForRole(user.role) : "/login/");
}
