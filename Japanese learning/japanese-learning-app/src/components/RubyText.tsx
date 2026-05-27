const RUBY_RE = /([一-龯々ヶ]+)\(([^)]+)\)/g;

export function RubyText({ text }: { text: string }) {
  const parts: Array<string | { base: string; rt: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = RUBY_RE.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push({ base: match[1], rt: match[2] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));

  return (
    <>
      {parts.map((p, i) =>
        typeof p === "string" ? (
          <span key={i}>{p}</span>
        ) : (
          <ruby key={i}>
            {p.base}
            <rt>{p.rt}</rt>
          </ruby>
        ),
      )}
    </>
  );
}
