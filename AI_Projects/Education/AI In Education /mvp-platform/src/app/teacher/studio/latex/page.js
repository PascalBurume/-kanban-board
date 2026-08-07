import LatexClient from "./LatexClient";

// The LaTeX workspace: a whole document written in markdown + LaTeX, with the render
// beside the source and Copilot able to write the maths.
//
// It is deliberately separate from /rediger. A lesson is a lesson — prose, sections, a
// quiz, a link to the book chapter. This page is for the artefacts that are almost
// entirely maths: a worked derivation, an interrogation, a formulary. Those need the
// render pane and the function palette permanently on screen, which would crowd the
// lesson editor for the teacher who is mostly writing sentences.
export const metadata = { title: "Atelier LaTeX — Mwalimu" };

export default function Page() {
  return <LatexClient />;
}
