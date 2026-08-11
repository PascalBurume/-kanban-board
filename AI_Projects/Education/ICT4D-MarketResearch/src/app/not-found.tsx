import { getCopy } from "@/lib/copy";
import Link from "next/link";
import { BRAND } from "@/lib/content";

/* The safety net. Every route that does not exist lands here rather than on
   Next's default error screen. The audience is described in the spec as wary
   of institutions, so this page apologises plainly, does not blame the reader,
   and always offers a way forward and a real person to call. */

export default async function NotFound() {
  const t = await getCopy();
  return (
    <div className="rj-wrap rj-narrow" style={{ paddingBlock: "var(--s16)" }}>
      <p className="rj-eyebrow">{t.notFound.eyebrow}</p>
      <h1 style={{ fontSize: "clamp(28px,4.4vw,40px)", marginTop: "var(--s3)" }}>
        {t.notFound.title}
      </h1>
      <p className="rj-lede" style={{ marginTop: "var(--s4)" }}>
        {t.notFound.lede}
      </p>

      <div style={{ display: "flex", gap: "var(--s3)", marginTop: "var(--s8)", flexWrap: "wrap" }}>
        <Link href="/" className="rj-btn rj-btn--primary">
          {t.notFound.home}
        </Link>
        <Link href="/register" className="rj-btn rj-btn--outline">
          {t.notFound.register}
        </Link>
        <Link href="/faq" className="rj-btn rj-btn--outline">
          {t.notFound.questions}
        </Link>
      </div>

      <p className="rj-note" style={{ marginTop: "var(--s8)" }}>
        {t.notFound.stuck} {BRAND.phone}.
      </p>
    </div>
  );
}
