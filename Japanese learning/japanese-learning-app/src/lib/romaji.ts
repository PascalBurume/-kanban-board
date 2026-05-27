// Lightweight romaji → hiragana converter for the SRS "type the reading"
// input. Greedy left-to-right match over a hand-tuned table. Covers Hepburn
// and most kunrei variants; small-tsu (っ) via doubled consonant.

const TABLE: Record<string, string> = {
  // 5 vowels
  a: "あ", i: "い", u: "う", e: "え", o: "お",
  // k
  ka: "か", ki: "き", ku: "く", ke: "け", ko: "こ",
  kya: "きゃ", kyu: "きゅ", kyo: "きょ",
  // g
  ga: "が", gi: "ぎ", gu: "ぐ", ge: "げ", go: "ご",
  gya: "ぎゃ", gyu: "ぎゅ", gyo: "ぎょ",
  // s
  sa: "さ", shi: "し", si: "し", su: "す", se: "せ", so: "そ",
  sha: "しゃ", shu: "しゅ", sho: "しょ",
  sya: "しゃ", syu: "しゅ", syo: "しょ",
  // z
  za: "ざ", ji: "じ", zi: "じ", zu: "ず", ze: "ぜ", zo: "ぞ",
  ja: "じゃ", ju: "じゅ", jo: "じょ",
  jya: "じゃ", jyu: "じゅ", jyo: "じょ",
  // t
  ta: "た", chi: "ち", ti: "ち", tsu: "つ", tu: "つ", te: "て", to: "と",
  cha: "ちゃ", chu: "ちゅ", cho: "ちょ",
  tya: "ちゃ", tyu: "ちゅ", tyo: "ちょ",
  // d
  da: "だ", di: "ぢ", du: "づ", de: "で", do: "ど",
  // n
  na: "な", ni: "に", nu: "ぬ", ne: "ね", no: "の",
  nya: "にゃ", nyu: "にゅ", nyo: "にょ",
  // h
  ha: "は", hi: "ひ", fu: "ふ", hu: "ふ", he: "へ", ho: "ほ",
  hya: "ひゃ", hyu: "ひゅ", hyo: "ひょ",
  // b
  ba: "ば", bi: "び", bu: "ぶ", be: "べ", bo: "ぼ",
  bya: "びゃ", byu: "びゅ", byo: "びょ",
  // p
  pa: "ぱ", pi: "ぴ", pu: "ぷ", pe: "ぺ", po: "ぽ",
  pya: "ぴゃ", pyu: "ぴゅ", pyo: "ぴょ",
  // m
  ma: "ま", mi: "み", mu: "む", me: "め", mo: "も",
  mya: "みゃ", myu: "みゅ", myo: "みょ",
  // y
  ya: "や", yu: "ゆ", yo: "よ",
  // r
  ra: "ら", ri: "り", ru: "る", re: "れ", ro: "ろ",
  rya: "りゃ", ryu: "りゅ", ryo: "りょ",
  // w
  wa: "わ", wo: "を",
  // n consonant
  nn: "ん", n: "ん",
  "-": "ー",
};

export function romajiToHiragana(input: string): string {
  const s = input.toLowerCase();
  let i = 0;
  let out = "";
  while (i < s.length) {
    // small tsu via doubled consonant (kk, tt, ss, …)
    if (
      i + 1 < s.length &&
      s[i] === s[i + 1] &&
      "kgsztdhbpmrjcfn".includes(s[i])
    ) {
      out += "っ";
      i++;
      continue;
    }
    // try longest match first (3 → 2 → 1)
    let matched = false;
    for (const len of [3, 2, 1]) {
      const chunk = s.slice(i, i + len);
      if (TABLE[chunk]) {
        out += TABLE[chunk];
        i += len;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out += s[i];
      i++;
    }
  }
  // n + vowel disambiguation isn't handled — users can type "nn" to force ん
  return out;
}
