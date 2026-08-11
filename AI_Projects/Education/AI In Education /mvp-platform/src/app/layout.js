import { Lexend, Inter, Cormorant_Garamond, DM_Sans } from "next/font/google";
import "./globals.css";
import "../styles/mwalimu.css";
import "../styles/teacher.css";

// Self-hosted at build time → works on the air-gapped school server.
const lexend = Lexend({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-lexend",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

// The anatomy atlas carries its own pair, from the explorer this page is ported
// from: a Garamond for headings and part names, DM Sans for the interface. They
// are declared here so next/font self-hosts them at build time like the other
// two — a school server has no route to fonts.googleapis.com. Only /anatomie
// references them, via --font-serif / --font-sans inside .an-shell.
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-serif",
  display: "swap",
});
const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata = {
  title: "Mwalimu — Offline learning platform",
  description:
    "A fully offline learning platform for secondary schools in the DRC, with an on-device AI tutor inside every lesson.",
  manifest: "/manifest.webmanifest",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#4f46e5",
};

export default function RootLayout({ children }) {
  // In production, register the offline service worker at its absolute root path
  // (a relative "sw.js" resolved to /login/sw.js, /student/sw.js … → 404, so it
  // never registered correctly). In development we actively UNREGISTER any
  // previously-installed worker and drop its caches — a stale cache-first worker
  // intercepts Next.js assets/RSC and is what forced the "click twice" behavior.
  const swScript =
    process.env.NODE_ENV === "production"
      ? "if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})}"
      : // DEV: unregister any stale worker + clear its caches, then force ONE reload
        // if the page is still controlled by an old worker (it keeps intercepting
        // navigations until the tab is reloaded — this is what caused 'click twice').
        // A sessionStorage flag prevents a reload loop.
        "if('serviceWorker' in navigator){" +
        "Promise.all([" +
        "navigator.serviceWorker.getRegistrations().then(function(rs){return Promise.all(rs.map(function(r){return r.unregister()}))})," +
        "(self.caches?caches.keys().then(function(ks){return Promise.all(ks.map(function(k){return caches.delete(k)}))}):Promise.resolve())" +
        "]).then(function(){" +
        "if(navigator.serviceWorker.controller && !sessionStorage.getItem('sw-evicted')){" +
        "sessionStorage.setItem('sw-evicted','1');location.reload()}" +
        "});}";

  return (
    <html lang="en" className={`${lexend.variable} ${inter.variable} ${cormorant.variable} ${dmSans.variable}`}>
      <body>
        {children}
        <script dangerouslySetInnerHTML={{ __html: swScript }} />
      </body>
    </html>
  );
}
