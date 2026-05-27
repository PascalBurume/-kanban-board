export type NavKey =
  | "home"
  | "lessons"
  | "kanji"
  | "srs"
  | "nhk"
  | "jlpt"
  | "library"
  | "progress";

export const NAV_ITEMS: {
  key: NavKey;
  label: string;
  jp: string;
  href: string;
}[] = [
  { key: "home", label: "Home", jp: "家", href: "/home" },
  { key: "lessons", label: "Lessons", jp: "課", href: "/lessons" },
  { key: "kanji", label: "Kanji", jp: "漢", href: "/kanji" },
  { key: "srs", label: "SRS review", jp: "復", href: "/srs" },
  { key: "jlpt", label: "JLPT prep", jp: "試", href: "/jlpt" },
  { key: "library", label: "Library", jp: "図", href: "/library" },
  { key: "progress", label: "Progress", jp: "記", href: "/progress" },
];
