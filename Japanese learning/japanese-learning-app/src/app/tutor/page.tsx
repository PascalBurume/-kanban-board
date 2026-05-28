import { Suspense } from "react";
import { TutorClient } from "./Client";

export const metadata = { title: "Tutor · Nihongo" };

export default function TutorPage() {
  return (
    <Suspense fallback={null}>
      <TutorClient />
    </Suspense>
  );
}
