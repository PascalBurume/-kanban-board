// A permanent, unmissable statement that this build takes no payment, files
// nothing, and issues no government document. Spec §5.2 step 4 and §6.1 both
// require the demonstration build to say so plainly rather than simulate a
// completion we have not achieved.
export default function DemoBanner({ text }: { text: string }) {
  return (
    <div
      className="rj-noprint"
      style={{
        background: "#202124",
        color: "#fff",
        fontSize: 13,
        padding: "8px 20px",
        textAlign: "center",
        lineHeight: 1.4,
      }}
    >
      <strong style={{ fontFamily: "var(--font-display)" }}>Demonstration build</strong>
      {" — "}
      {text}
    </div>
  );
}
