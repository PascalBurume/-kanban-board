import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { accessibleSubjectSlugs } from "@/lib/path";
import { resolveCopilotEnabled } from "@/lib/teacher";
import { streamChat, acquireSlot, releaseSlot, ollamaOnline, type ChatMessage } from "@/lib/ollama";
import { retrieveChunks } from "@/lib/rag";
import { organById, type Organ } from "@/lib/anatomyOrgans";
import { systemSheets } from "@/lib/anatomySystems";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Threads here are deliberately not persisted: the specimen is a reference tool,
// not a graded lesson, so there is nothing to review later and no schema to
// migrate. History rides along in the request and dies with the tab. That also
// means the rate limit can't be counted in the database — an in-memory window
// per user is the right size for one school server.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 12;
const hits = new Map<string, number[]>();

function rateLimited(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(userId, recent);
  if (hits.size > 500) for (const [k, v] of hits) if (!v.some((t) => now - t < RATE_WINDOW_MS)) hits.delete(k);
  return recent.length > RATE_MAX;
}

function organFacts(o: Organ, hotspotId: string): string {
  const hs = o.hotspots.find((h) => h.id === hotspotId);
  const sheet = systemSheets[o.system];
  const lines = [
    `Spécimen affiché : ${o.name} (${o.scientificName})`,
    `Système : ${o.system}${sheet ? ` — ${sheet.role}` : ""}`,
    `Description : ${o.description}`,
    `Fonction : ${o.function}`,
    `Localisation : ${o.location}`,
    `Taille : ${o.size} · ${o.weightLabel || "Poids"} : ${o.weight}`,
    `Tissu : ${o.tissue}`,
    `Vascularisation : ${o.bloodSupply}`,
    `Note médicale : ${o.medical}`,
    `Fait marquant : ${o.funFact}`,
    `Pathologies au programme : ${o.conditions.join(", ")}`,
    `Structures repérées sur le modèle : ${o.hotspots.map((h) => `${h.label} (${h.detail})`).join(" ; ")}`,
  ];
  // A hotspot is open: that structure is the subject, so its own teaching text
  // leads. Without this the model answers about the whole organ and the student
  // has to re-ask.
  if (hs) {
    lines.push("", `STRUCTURE SÉLECTIONNÉE : ${hs.label} — ${hs.detail}`);
    if (hs.body) lines.push(hs.body);
  }
  return lines.join("\n");
}

function systemPrompt(organId: string, hotspotId: string, isStaff: boolean): string {
  const o = organById[organId as keyof typeof organById];
  const facts = o ? organFacts(o, hotspotId) : "Aucun spécimen n'est sélectionné pour l'instant.";

  return [
    "Tu es le Copilote d'anatomie de Mwalimu, une plateforme scolaire hors-ligne en République Démocratique du Congo.",
    isStaff
      ? "Tu parles à un enseignant : tu peux proposer des angles pédagogiques, des analogies de classe et des questions d'évaluation."
      : "Tu parles à un élève de 5e ou 6e des humanités (section Biologie-Chimie). Tu expliques simplement, sans jargon inutile.",
    "",
    "Contexte de la maquette 3D affichée à l'écran :",
    facts,
    "",
    "Règles :",
    "- Réponds en français, en 4 à 8 phrases maximum.",
    "- Appuie-toi d'abord sur les faits ci-dessus ; ils font autorité pour cette maquette.",
    "- Si la question sort de l'anatomie et de la physiologie, ramène poliment vers le sujet.",
    "- N'invente jamais un chiffre ni un nom latin dont tu n'es pas sûr : dis plutôt que tu ne le sais pas.",
    "- Tu peux renvoyer à ce qui est visible sur le modèle 3D (les structures repérées listées ci-dessus).",
    "- Ne donne aucun conseil médical ni diagnostic. Pour une question de santé personnelle, renvoie vers un professionnel de santé.",
  ].join("\n");
}

export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const organId = String(body.organId ?? "");
  const hotspotId = String(body.hotspotId ?? "");
  const content = String(body.content ?? "").trim();
  if (!content) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  if (content.length > 2000) return NextResponse.json({ error: "TOO_LONG" }, { status: 400 });

  // The teacher's Copilot switch governs students here exactly as it does in a
  // lesson — a page outside the curriculum must not become a way around it.
  if (u.role === "STUDENT") {
    const classId = u.classId ?? (await prisma.enrollment.findUnique({ where: { studentId: u.userId } }))?.classId;
    if (!classId) return NextResponse.json({ error: "NO_CLASS" }, { status: 400 });
    if (!(await resolveCopilotEnabled(u.userId, classId))) {
      return NextResponse.json({ error: "COPILOT_DISABLED" }, { status: 403 });
    }
  }

  if (!(await ollamaOnline())) return NextResponse.json({ error: "OLLAMA_OFFLINE" }, { status: 503 });
  if (rateLimited(u.userId)) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

  const history: ChatMessage[] = Array.isArray(body.history)
    ? (body.history as unknown[])
        .slice(-6)
        .filter((m): m is { role: string; content: string } => !!m && typeof m === "object" && "role" in m && "content" in m)
        .map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: String(m.content).slice(0, 1500),
        }))
    : [];

  // Ground the answer in the school's own books when the index has something
  // worth citing. The bar is deliberately much higher than in a lesson: there
  // the retrieval runs against the subject the student is already reading, but
  // the specimen has no lesson of its own, and no anatomy book is digitised yet.
  // At a lesson-grade threshold the nearest neighbours to "cœur" came back as
  // « Structure des métaux » and « Soudure », and the panel cited them — a
  // confident-looking source line pointing at the wrong book is worse for a
  // student than no source line at all.
  const CITE_MIN_SCORE = 0.72;
  let excerpts: { title: string; text: string }[] = [];
  try {
    const o = organById[organId as keyof typeof organById];
    const hs = o?.hotspots.find((h) => h.id === hotspotId);
    const query = o ? `${hs?.label ?? o.name} ${o.system} ${content}` : content;
    const classId = u.classId ?? undefined;
    const slugs = classId ? await accessibleSubjectSlugs(classId) : undefined;
    const found = await retrieveChunks(query, { k: 3, subjectSlugs: slugs });
    excerpts = found.filter((h) => h.score > CITE_MIN_SCORE).map((h) => ({ title: h.lessonTitle, text: h.text }));
  } catch {
    excerpts = [];
  }

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(organId, hotspotId, u.role !== "STUDENT") },
  ];
  if (excerpts.length) {
    messages.push({
      role: "system",
      content:
        "Extraits des manuels de l'école (cite le titre quand tu t'en sers) :\n\n" +
        excerpts.map((e) => `« ${e.title} »\n${e.text}`).join("\n\n---\n\n"),
    });
  }
  messages.push(...history, { role: "user", content });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      await acquireSlot();
      try {
        if (excerpts.length) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ sources: excerpts.map((e) => e.title) })}\n\n`));
        }
        for await (const delta of streamChat(messages)) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`));
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
      } catch {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "GEN_FAILED" })}\n\n`));
      } finally {
        releaseSlot();
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
