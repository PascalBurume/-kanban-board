import RedigerClient from "./RedigerClient";

// Full-page lesson authoring. The studio (/teacher/studio) stays the place to browse
// the course tree and work on book lessons; this page is only for writing ONE lesson,
// so the text gets the whole screen instead of competing with the tree, the live
// preview and the Copilot strip.
export const metadata = { title: "Rédiger une leçon — Mwalimu" };

export default function Page() {
  return <RedigerClient />;
}
