// Lightweight SVG path sampler — extracts a polyline of points from a
// KanjiVG "d" string so we can score user strokes against ground truth.
//
// KanjiVG paths use M, c, C, s, S, q, Q, t, T, l, L, h, v, z. We resolve
// every command into an absolute (x, y) endpoint and walk the resulting
// vertex list. Control points are approximated by their endpoint — good
// enough for direction-cosine + bounding-box-IoU scoring.

export interface Point {
  x: number;
  y: number;
}

export function sampleSvgPath(d: string): Point[] {
  const cmds = d.match(/[a-zA-Z][^a-zA-Z]*/g) || [];
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;
  const points: Point[] = [];

  function nums(s: string): number[] {
    return (s.match(/-?\d*\.?\d+(?:e-?\d+)?/g) || []).map(Number);
  }

  for (const cmd of cmds) {
    const op = cmd[0];
    const args = nums(cmd.slice(1));
    const isRel = op === op.toLowerCase();
    switch (op.toUpperCase()) {
      case "M": {
        for (let i = 0; i < args.length; i += 2) {
          let x = args[i];
          let y = args[i + 1];
          if (isRel) {
            x += cx;
            y += cy;
          }
          if (i === 0) {
            startX = x;
            startY = y;
          }
          points.push({ x, y });
          cx = x;
          cy = y;
        }
        break;
      }
      case "L":
      case "T": {
        for (let i = 0; i < args.length; i += 2) {
          let x = args[i];
          let y = args[i + 1];
          if (isRel) {
            x += cx;
            y += cy;
          }
          points.push({ x, y });
          cx = x;
          cy = y;
        }
        break;
      }
      case "H": {
        for (const v of args) {
          const x = isRel ? cx + v : v;
          points.push({ x, y: cy });
          cx = x;
        }
        break;
      }
      case "V": {
        for (const v of args) {
          const y = isRel ? cy + v : v;
          points.push({ x: cx, y });
          cy = y;
        }
        break;
      }
      case "C": {
        for (let i = 0; i < args.length; i += 6) {
          let x = args[i + 4];
          let y = args[i + 5];
          if (isRel) {
            x += cx;
            y += cy;
          }
          points.push({ x, y });
          cx = x;
          cy = y;
        }
        break;
      }
      case "S":
      case "Q": {
        for (let i = 0; i < args.length; i += 4) {
          let x = args[i + 2];
          let y = args[i + 3];
          if (isRel) {
            x += cx;
            y += cy;
          }
          points.push({ x, y });
          cx = x;
          cy = y;
        }
        break;
      }
      case "Z":
        points.push({ x: startX, y: startY });
        cx = startX;
        cy = startY;
        break;
    }
  }
  return points;
}

export function bbox(points: Point[]) {
  if (points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let xMin = Infinity;
  let yMin = Infinity;
  let xMax = -Infinity;
  let yMax = -Infinity;
  for (const p of points) {
    if (p.x < xMin) xMin = p.x;
    if (p.x > xMax) xMax = p.x;
    if (p.y < yMin) yMin = p.y;
    if (p.y > yMax) yMax = p.y;
  }
  return { x: xMin, y: yMin, w: xMax - xMin, h: yMax - yMin };
}

function bboxIoU(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const area = a.w * a.h + b.w * b.h - inter;
  return area > 0 ? inter / area : 0;
}

function directionCosine(a: Point[], b: Point[]) {
  if (a.length < 2 || b.length < 2) return 0;
  const av = { x: a[a.length - 1].x - a[0].x, y: a[a.length - 1].y - a[0].y };
  const bv = { x: b[b.length - 1].x - b[0].x, y: b[b.length - 1].y - b[0].y };
  const dot = av.x * bv.x + av.y * bv.y;
  const ma = Math.hypot(av.x, av.y);
  const mb = Math.hypot(bv.x, bv.y);
  return ma * mb === 0 ? 0 : dot / (ma * mb);
}

export interface ScoredStroke {
  score: "great" | "okay" | "again";
  cosine: number;
  iou: number;
}

export function scoreStroke(
  user: Point[],
  ground: Point[],
  groundBox: { x: number; y: number; w: number; h: number }
): ScoredStroke {
  const cosine = directionCosine(user, ground);
  const userBox = bbox(user);
  const iou = bboxIoU(userBox, groundBox);
  let score: ScoredStroke["score"] = "again";
  if (cosine > 0.7 && iou > 0.4) score = "great";
  else if (cosine > 0.5 && iou > 0.2) score = "okay";
  return { score, cosine, iou };
}
