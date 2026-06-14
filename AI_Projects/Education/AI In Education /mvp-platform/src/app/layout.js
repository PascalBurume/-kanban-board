import { Lexend, Inter } from "next/font/google";
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
  return (
    <html lang="en" className={`${lexend.variable} ${inter.variable}`}>
      <body>
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('sw.js').catch(function(){})})}",
          }}
        />
      </body>
    </html>
  );
}
