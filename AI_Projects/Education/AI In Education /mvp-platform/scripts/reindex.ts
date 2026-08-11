// Rebuild the RAG index over every published lesson.
//
// The teacher Copilot's chat now recalls across the corpus (studioChatMessages →
// retrieveChunks), but it can only recall what has been embedded — and the seeded book
// content never was. This calls the same reindexAll() the admin « Contenu » tab uses,
// so there is one implementation of "what is indexed", not two.
import { reindexAll } from "../src/lib/rag";

const t0 = Date.now();
const secs = () => Math.round((Date.now() - t0) / 1000);

reindexAll((id: string, status: string, label: string, detail?: string) => {
  if (status === "failed") console.error(`  ✗ ${id} ${label} ${detail ?? ""}`);
  else if (status === "done") console.log(`  ${secs()}s  ${label}${detail ? " — " + detail : ""}`);
})
  .then((r) => console.log(`\ndone in ${secs()}s:`, JSON.stringify(r)))
  .catch((e) => { console.error("FAILED:", e?.message ?? e); process.exitCode = 1; });
