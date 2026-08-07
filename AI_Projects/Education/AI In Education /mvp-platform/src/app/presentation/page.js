import Marketing from "./Marketing";

// Public presentation route. The same marketing page is also served at "/"
// for anonymous visitors (see src/app/page.js).
export const metadata = {
  title: "Mwalimu — Offline learning platform for secondary schools",
  description:
    "The full Congolese secondary-school curriculum with an AI tutor that works with no internet, on the school's local server.",
};

export default function PresentationPage() {
  return <Marketing />;
}
