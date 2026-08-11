import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import AnatomyExplorer from "@/components/anatomy/AnatomyExplorer";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Simulation d'anatomie — Mwalimu",
  description: "Maquette 3D du corps humain : squelette, muscles, organes, système nerveux et circulation.",
};

// Open to every signed-in role. The specimen is a reference tool like « Manuels »,
// so it sits outside the class → book plumbing: no Offering to resolve, no
// ModuleLock to check, and nothing recorded against a student's progress.
export default async function AnatomiePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login/");
  return <AnatomyExplorer user={{ role: user.role, firstName: user.firstName }} />;
}
