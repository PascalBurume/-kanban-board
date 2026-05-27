import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Section "mock" is the practice flow with `mode=mock` so the timer is active.
// Centralising the redirect keeps a single source of MCQ logic.
export default async function MockSection({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams?: Promise<{ level?: string }>;
}) {
  const { section } = await params;
  const sp = (await searchParams) ?? {};
  const level = sp.level ?? "N5";
  redirect(`/jlpt/practice/${section}?level=${level}&mode=mock`);
}
