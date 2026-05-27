// 8-question adaptive placement test.
// Each question maps to a JLPT level "anchor"; the user self-rates fluency
// on a 3-point scale and we score: ✓=2, ~=1, ✗=0. We project the running
// score onto the highest level the user comfortably handles.

export type PlacementAnswer = 0 | 1 | 2;

export interface PlacementQuestion {
  id: string;
  level: "N5" | "N4" | "N3" | "N2" | "N1";
  jp: string;
  romaji: string;
  en: string;
  promptEn: string;
}

export const PLACEMENT_QUESTIONS: PlacementQuestion[] = [
  {
    id: "q1",
    level: "N5",
    jp: "わたしは がくせい です。",
    romaji: "watashi wa gakusei desu.",
    en: "I am a student.",
    promptEn: "Read this aloud — how does it feel?",
  },
  {
    id: "q2",
    level: "N5",
    jp: "毎朝コーヒーを飲みます。",
    romaji: "mai-asa koohii wo nomimasu.",
    en: "I drink coffee every morning.",
    promptEn: "Read this aloud — how does it feel?",
  },
  {
    id: "q3",
    level: "N4",
    jp: "雨が降っているので、傘を持って行きます。",
    romaji: "ame ga futte-iru node, kasa wo motte ikimasu.",
    en: "Because it's raining, I'll take an umbrella.",
    promptEn: "Can you parse the connective and verb?",
  },
  {
    id: "q4",
    level: "N4",
    jp: "友達に新しい本を貸してもらいました。",
    romaji: "tomodachi ni atarashii hon wo kashite moraimashita.",
    en: "I had my friend lend me a new book.",
    promptEn: "Try the giving/receiving verb pattern.",
  },
  {
    id: "q5",
    level: "N3",
    jp: "明日の会議は中止になるかもしれません。",
    romaji: "ashita no kaigi wa chuushi ni naru kamoshiremasen.",
    en: "Tomorrow's meeting may be cancelled.",
    promptEn: "Modal expression of possibility.",
  },
  {
    id: "q6",
    level: "N3",
    jp: "彼は日本に来てからずっとこの会社で働いています。",
    romaji: "kare wa nihon ni kite kara zutto kono kaisha de hataraite imasu.",
    en: "He's worked at this company ever since coming to Japan.",
    promptEn: "Continuous-since-event grammar.",
  },
  {
    id: "q7",
    level: "N2",
    jp: "経済状況の悪化に伴い、雇用も減少傾向にある。",
    romaji:
      "keizai jōkyō no akka ni tomonai, koyō mo genshō keikō ni aru.",
    en: "Alongside the worsening economy, employment is also trending downward.",
    promptEn: "Formal news-style register.",
  },
  {
    id: "q8",
    level: "N1",
    jp: "彼の発言は事態をいっそう複雑化させる結果となった。",
    romaji:
      "kare no hatsugen wa jitai wo issō fukuzatsuka saseru kekka to natta.",
    en: "His remarks ended up making the situation even more complex.",
    promptEn: "Editorial / abstract register.",
  },
];

const LEVEL_VALUE = { N5: 1, N4: 2, N3: 3, N2: 4, N1: 5 } as const;
const VALUE_LEVEL = ["", "N5", "N4", "N3", "N2", "N1"] as const;

export function scorePlacement(
  answers: Record<string, PlacementAnswer>
): {
  level: "Curious" | "N5" | "N4" | "N3" | "N2" | "N1";
  confidence: number;
  weighted: number;
} {
  let weighted = 0;
  let total = 0;
  for (const q of PLACEMENT_QUESTIONS) {
    const v = answers[q.id];
    if (v === undefined) continue;
    const w = LEVEL_VALUE[q.level];
    weighted += v * w; // ✓ at higher level counts more
    total += 2 * w;
  }
  if (total === 0) return { level: "Curious", confidence: 0, weighted: 0 };

  const pct = weighted / total;
  // Map cumulative comfort onto a target level.
  // 0–10% → Curious, 10–35% → N5, 35–55% → N4, 55–72% → N3, 72–88% → N2, 88%+ → N1
  let targetIdx = 0;
  if (pct >= 0.88) targetIdx = 5;
  else if (pct >= 0.72) targetIdx = 4;
  else if (pct >= 0.55) targetIdx = 3;
  else if (pct >= 0.35) targetIdx = 2;
  else if (pct >= 0.1) targetIdx = 1;
  const level = targetIdx === 0 ? "Curious" : VALUE_LEVEL[targetIdx];
  return { level: level as any, confidence: Math.round(pct * 100), weighted };
}

export const LEVELS = [
  { code: "Curious", kanji: "🌱", title: "Curious", subtitle: "never studied" },
  { code: "N5", kanji: "N5", title: "Survival", subtitle: "~100 kanji" },
  { code: "N4", kanji: "N4", title: "Tourist", subtitle: "~300 kanji" },
  { code: "N3", kanji: "N3", title: "Conversational", subtitle: "~650 kanji" },
  { code: "N2", kanji: "N2", title: "Fluent reader", subtitle: "~1,000 kanji" },
  { code: "N1", kanji: "N1", title: "Advanced", subtitle: "2,000+ kanji" },
];
