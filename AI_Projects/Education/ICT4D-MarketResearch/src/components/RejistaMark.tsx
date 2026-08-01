// The brand mark: a certificate seal built from the same diamond lattice as
// the site texture, so the identity and the pattern share one geometry.
export default function RejistaMark({
  size = 32,
  mono,
}: {
  size?: number;
  mono?: boolean;
}) {
  const indigo = mono ? "currentColor" : "#1A3A8F";
  const gold = mono ? "currentColor" : "#E8A33D";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role="img"
      aria-label="Rejista"
      fill="none"
    >
      <rect width="40" height="40" rx="10" fill={indigo} />
      <path
        d="M20 7 L33 20 L20 33 L7 20 Z"
        stroke={gold}
        strokeWidth="1.6"
        opacity="0.75"
      />
      <path
        d="M20 12.5 L27.5 20 L20 27.5 L12.5 20 Z"
        fill={gold}
        opacity="0.22"
      />
      <path
        d="M14.5 20.2 L18.4 24 L26 15.6"
        stroke={mono ? "currentColor" : "#FFFFFF"}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
