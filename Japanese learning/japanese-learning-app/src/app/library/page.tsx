import { AppShell } from "@/components/shell/AppShell";
import { prisma } from "@/lib/db";
import { LibraryBrowser } from "./LibraryBrowser";

export const dynamic = "force-dynamic";
export const metadata = { title: "Library · Nihongo" };

export default async function LibraryPage() {
  const items = await prisma.libraryResource.findMany({
    orderBy: [{ type: "asc" }, { title: "asc" }],
  });
  return (
    <AppShell active="library">
      <header className="border-b border-ink-3/40 px-6 py-5 md:px-8">
        <div className="eyebrow">RESOURCE LIBRARY</div>
        <h1 className="font-serif text-2xl md:text-[28px]">Library</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-2">
          Textbooks, podcasts, channels, and grammar references: searchable
          and shelveable. Open any item or add it to your shelf to track
          progress.
        </p>
      </header>
      <LibraryBrowser items={items} />
    </AppShell>
  );
}
