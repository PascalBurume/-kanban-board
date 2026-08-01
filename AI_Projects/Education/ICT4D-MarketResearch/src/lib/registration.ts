import { STATES } from "./nigeria";

export interface Registration {
  fullName: string;
  phone: string;
  lang: string;
  bizName: string;
  bizAlt: string;
  trade: string;
  stateId: string;
  market: string;
  consent: boolean;
  marketing: boolean;
}

export const EMPTY: Registration = {
  fullName: "",
  phone: "",
  lang: "pcm",
  bizName: "",
  bizAlt: "",
  trade: "",
  stateId: "LA",
  market: "",
  consent: false,
  marketing: false,
};

export const FEE_SERVICE = 7500;
export const FEE_GOVERNMENT = 10000; // CAC business-name registration, indicative

export function naira(n: number): string {
  return `₦${n.toLocaleString("en-NG")}`;
}

/** Nigerian mobile: 11 digits starting 0, or +234 followed by 10. */
export function validPhone(v: string): boolean {
  const s = v.replace(/[\s-]/g, "");
  return /^0\d{10}$/.test(s) || /^\+?234\d{10}$/.test(s);
}

export function validName(v: string): boolean {
  return v.trim().split(/\s+/).filter(Boolean).length >= 2;
}

export function validBizName(v: string): boolean {
  const s = v.trim();
  if (s.length < 3 || s.length > 100) return false;
  // CAC rejects names implying government or banking status without approval.
  return !/\b(federal|national|government|bank|cooperative|holdings? plc)\b/i.test(s);
}

/**
 * REAL API: CAC public name-search on the Company Registration Portal.
 * There is no published open API; the practical routes are an accredited-agent
 * account or a licensed intermediary (Prembly/Identitypass, Youverify,
 * VerifyMe) reselling a name-search endpoint.
 *
 * Until then this is a deterministic hash of the typed name — instant, stable
 * across keystrokes, and MEANINGLESS. It is presented in the UI as a hint and
 * explicitly not a guarantee, because a false "available" that later fails at
 * filing is exactly the broken promise Rejista exists to replace.
 */
export function availabilityHint(name: string): "unknown" | "likely" | "risky" {
  const s = name.trim().toLowerCase();
  if (s.length < 3) return "unknown";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  // Common single-word names are the ones that actually collide in practice.
  if (s.split(/\s+/).length === 1) return "risky";
  return h % 5 === 0 ? "risky" : "likely";
}

/** Rejista reference: RJ · state code · year · sequence (spec §6). */
export function makeRejistaId(stateId: string, seq: number, year = 2026): string {
  const st = STATES.find((s) => s.id === stateId);
  const code = (st?.name ?? "NGA").slice(0, 3).toUpperCase();
  return `RJ-${code}-${year}-${String(seq).padStart(6, "0")}`;
}

export const FILING_STAGES = [
  {
    key: "name",
    label: "Checking your business name",
    detail: "Searching the CAC register for conflicts",
    seconds: 2.2,
  },
  {
    key: "identity",
    label: "Confirming your identity",
    detail: "Matching your details against your ID record",
    seconds: 2.6,
  },
  {
    key: "filing",
    label: "Filing with CAC",
    detail: "Submitting your registration to the Corporate Affairs Commission",
    seconds: 3.2,
  },
  {
    key: "issue",
    label: "Issuing your tax number and account",
    detail: "Requesting your TIN and opening your business account",
    seconds: 2.4,
  },
] as const;
