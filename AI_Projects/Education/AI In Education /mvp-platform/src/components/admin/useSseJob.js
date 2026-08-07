"use client";
import { useState } from "react";

// Generic SSE job client for routes emitting the shared step-event protocol:
//   data: {"step":{id,status,label,detail?}} … {"result":…} … {"done":true} | {"error":…}
// (Same shape as /api/teacher/agent — this hook just takes the URL.)
export function useSseJob(url) {
  const [steps, setSteps] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);

  async function start(body) {
    setSteps([]); setResult(null); setError(null); setRunning(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || `HTTP_${res.status}`);
        return null;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "", final = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const line = buf.slice(0, idx); buf = buf.slice(idx + 2);
          if (!line.startsWith("data: ")) continue;
          let o;
          try { o = JSON.parse(line.slice(6)); } catch { continue; }
          if (o.step) {
            setSteps((s) => {
              const i = s.findIndex((x) => x.id === o.step.id);
              if (i >= 0) { const c = [...s]; c[i] = o.step; return c; }
              return [...s, o.step];
            });
          }
          if (o.result) { final = o.result; setResult(o.result); }
          if (o.error) setError(o.error);
        }
      }
      return final;
    } catch {
      setError("NETWORK");
      return null;
    } finally {
      setRunning(false);
    }
  }

  return { steps, result, error, running, start };
}

// Step checklist renderer (visible thinking) — mirror of AgentSteps.
export function JobSteps({ steps, Icon }) {
  if (!steps.length) return null;
  return (
    <div className="ag-steps">
      {steps.map((s) => (
        <div key={s.id} className={`ag-step ${s.status}`}>
          <span className="ag-ic">
            <Icon name={s.status === "running" ? "refresh" : s.status === "done" ? "check" : "x"} />
          </span>
          <span>
            <span className="ag-step-l">{s.label}</span>
            {s.detail && <span className="ag-step-d"> — {s.detail}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}
