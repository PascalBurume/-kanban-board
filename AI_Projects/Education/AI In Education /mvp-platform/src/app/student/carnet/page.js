import CarnetClient from "./CarnetClient";

// The student's personal notebook: maths, physique, chimie — written with the same
// editor teachers use, but stored on the device first so a dropped Wi-Fi link (or a
// closed tab) never costs a student their notes.
export const metadata = { title: "Mon carnet — Mwalimu" };

export default function Page() {
  return <CarnetClient />;
}
