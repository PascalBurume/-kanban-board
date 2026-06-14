"use client";
import SetsVenn from "./SetsVenn";
import FunctionPlotter from "./FunctionPlotter";
import SecondDegree from "./SecondDegree";
import UnitCircle from "./UnitCircle";
import Sequences from "./Sequences";
import Combinatorics from "./Combinatorics";
import CoulombLaw from "./CoulombLaw";
import OhmCircuit from "./OhmCircuit";
import ForceVectors from "./ForceVectors";
import OxidationNumber from "./OxidationNumber";
import Concentration from "./Concentration";
import { SIM_TITLES, matchSimKeys } from "@/lib/simMatch";

// key → component (keys come from src/lib/simMatch.ts).
const REGISTRY = {
  "sets-venn": SetsVenn,
  "function-plotter": FunctionPlotter,
  "second-degree": SecondDegree,
  "unit-circle": UnitCircle,
  sequences: Sequences,
  combinatorics: Combinatorics,
  coulomb: CoulombLaw,
  "ohm-circuit": OhmCircuit,
  "force-vectors": ForceVectors,
  oxidation: OxidationNumber,
  concentration: Concentration,
};

export const getSim = (key) => REGISTRY[key] || null;
export { SIM_TITLES, matchSimKeys };

// Render the matched sims for a chapter; returns null if none match.
export default function Sims({ keys }) {
  const comps = (keys || []).map((k) => [k, getSim(k)]).filter(([, c]) => c);
  if (!comps.length) return null;
  return (
    <div className="sim-list">
      {comps.map(([k, C]) => (
        <C key={k} />
      ))}
    </div>
  );
}
