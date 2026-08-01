/**
 * Template substitution for copy strings.
 *
 * Lives in its own file, separate from ./index.ts, because index.ts imports
 * getLocale() -> next/headers. Client components (RegisterFlow) need `fill`
 * but must not pull server-only code into the browser bundle, which fails the
 * build. Server components can keep importing it from ./index, which re-exports
 * this.
 */

/** Fill {placeholders}. Deliberately tiny — the alternative is pulling in an
 *  ICU message formatter for what is, across the whole site, a handful of
 *  interpolations (fee, minutes, phone, service counts, language name). */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k) =>
    k in vars ? String(vars[k]) : m,
  );
}
