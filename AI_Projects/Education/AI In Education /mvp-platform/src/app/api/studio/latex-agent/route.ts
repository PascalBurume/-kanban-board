import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { acquireSlot, releaseSlot, ollamaOnline } from "@/lib/ollama";
import { studioCompose, LATEX_INSTRUCTION_MAX } from "@/lib/studioCopilot";
import { checkLatex, latexReason } from "@/lib/latexCheck";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The LaTeX agent: plan → write → verify, with the verification able to send it back.
//
// What separates this from the one-shot « Écrire la formule » button is that the agent
// does not stop at "the model answered". It renders the answer with KaTeX, and if the
// answer does not display it says so and writes again with the parse error in hand.
// The teacher watches all of that happen, which is the point: a small local model gets
// maths wrong often enough that a silent correct-looking answer is the dangerous one.
//
// The steps stream as they happen (the same {step}/{result} SSE shape the exercises
// agent uses, so the client reader is shared) because on a school server running the
// model on CPU a request takes tens of seconds, and a spinner that long reads as a
// hang.

const RATE_WINDOW_MS = 60000;
const RATE_MAX = 6;
const hits = new Map<string, number[]>();
function rateLimited(userId: string): boolean {
  const now = Date.now();
  const arr = (hits.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  arr.push(now);
  hits.set(userId, arr);
  return arr.length > RATE_MAX;
}

type Step = { id: string; label: string; detail?: string; status: "running" | "done" | "failed" };

export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u || (u.role !== "TEACHER" && u.role !== "ADMIN")) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const instruction = String(body.instruction ?? "").trim().slice(0, LATEX_INSTRUCTION_MAX);
  const tex = String(body.tex ?? "").slice(0, 2000);
  const subjectSlug = String(body.subjectSlug ?? "");
  const classLevel = typeof body.classLevel === "string" ? body.classLevel : undefined;
  if (!instruction) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  if (!(await ollamaOnline())) return NextResponse.json({ error: "OLLAMA_OFFLINE" }, { status: 503 });
  if (rateLimited(u.userId)) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(o)}\n\n`));
      const step = (s: Step) => send({ step: s });

      await acquireSlot();
      try {
        // 1 ── read the request. Deterministic: it restates what the agent is about to
        // do so the teacher can catch a misunderstanding before the slow part runs.
        step({ id: "read", label: "Lire la demande", status: "running" });
        step({
          id: "read",
          label: "Lire la demande",
          detail: tex.trim() ? "réécriture d'une formule existante" : "nouvelle formule, à partir de zéro",
          status: "done",
        });

        // 2 ── write.
        step({ id: "write", label: "Écrire le LaTeX", status: "running" });
        const res = await studioCompose(u, { action: "latex", subjectSlug, classLevel, tex, instruction });

        if ("error" in res) {
          // The step line stays short; the message below it carries the actual
          // remedy, which for a truncated or empty reply is "shorten the request".
          const short: Record<string, string> = {
            LATEX_EMPTY: "le modèle n'a rien renvoyé",
            LATEX_TRUNCATED: "réponse coupée avant la fin",
            LATEX_UNPARSABLE: "réponse hors format",
            LATEX_BLANK: "formule vide",
            LATEX_INVALID: "LaTeX non affichable",
          };
          step({ id: "write", label: "Écrire le LaTeX", detail: short[String(res.error)] ?? "échec", status: "failed" });
          send({ error: `${latexReason(res.error) ?? "Copilot n'a pas pu répondre."} Votre formule n'a pas été modifiée.` });
          return;
        }
        if (res.action !== "latex") {
          step({ id: "write", label: "Écrire le LaTeX", detail: "réponse inattendue", status: "failed" });
          send({ error: "Abandon — réponse inattendue du modèle." });
          return;
        }
        step({ id: "write", label: "Écrire le LaTeX", detail: `${res.tex.length} caractères`, status: "done" });

        // 3 ── verify. studioCompose already refuses what KaTeX cannot render and
        // retries once, so reaching here means it displays; this step re-checks anyway
        // and reports the accuracy warnings, which are the ones a teacher must see.
        step({ id: "check", label: "Vérifier l'affichage", status: "running" });
        const v = checkLatex(res.tex, true);
        if (!v.ok || v.blank) {
          step({ id: "check", label: "Vérifier l'affichage", detail: v.error ?? "la formule ne montre rien", status: "failed" });
          send({ error: "Le résultat ne s'affiche pas — rien n'a été inséré." });
          return;
        }
        step({
          id: "check",
          label: "Vérifier l'affichage",
          detail: v.suspect ? "s'affiche, mais à relire" : "s'affiche correctement",
          status: v.suspect ? "failed" : "done",
        });

        send({
          result: {
            tex: v.tex,
            note: res.note,
            warnings: [...(res.warnings ?? []), ...(v.suspect ? [v.suspect] : [])],
          },
        });
      } catch {
        send({ error: "Assistant indisponible." });
      } finally {
        releaseSlot();
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
