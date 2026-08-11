import Marketing from "./Marketing";

// Public presentation route. "/" no longer shows this — it redirects to the
// role home or to /login/ (see src/app/page.js).
export const metadata = {
  title: "Mwalimu — La plateforme d’apprentissage hors ligne des écoles secondaires",
  description:
    "Tout le programme du secondaire congolais avec un tuteur IA qui fonctionne sans internet, sur le serveur local de l’école.",
};

export default function PresentationPage() {
  return <Marketing />;
}
