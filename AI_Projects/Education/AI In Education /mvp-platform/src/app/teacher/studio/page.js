import { getCurrentUser } from "@/lib/auth";
import StudioClient from "./StudioClient";

export const dynamic = "force-dynamic";

// Server wrapper: resolve the role from the session BEFORE the client renders, so
// the Studio paints the correct sidebar (admin console nav vs teacher nav) on the
// very first frame — no flash of the wrong shell while /api/auth/me is in flight.
export default async function StudioPage() {
  const user = await getCurrentUser();
  return <StudioClient initialIsAdmin={user?.role === "ADMIN"} />;
}
