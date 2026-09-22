import { useState } from "react";
import { ClipboardList, Copy, Check, RefreshCw } from "lucide-react";
import { operatorPrompts } from "../data/mockData";
import { Card } from "./ui";

// Instructions for the human operator when the AI model cannot fully
// verify a call (medium/high risk, suspicious clone score, or challenge).
// The operator reads an unpredictable prompt so a voice clone fails.
export default function OperatorInstructions({ active, challengePhrase }) {
  const [index, setIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const [done, setDone] = useState({});

  // If a live challenge phrase exists, put it first in the list.
  const prompts = challengePhrase
    ? [{ id: "live", label: "Live challenge", text: `Please repeat the displayed phrase: ${challengePhrase}.` }, ...operatorPrompts]
    : operatorPrompts;

  const current = prompts[index % prompts.length];

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(current.text);
    } catch {
      // clipboard unavailable in some browsers — still show feedback
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const toggleStep = (id) => setDone((d) => ({ ...d, [id]: !d[id] }));

  const steps = [
    { id: "read", text: "1. Read the prompt below to the caller exactly as written." },
    { id: "listen", text: "2. Listen for robotic tone, delay, or refusal to repeat digits." },
    { id: "submit", text: "3. Click SUBMIT CHALLENGE, then Block or Allow based on result." },
  ];

  return (
    <Card title="OPERATOR INSTRUCTIONS — UNVERIFIED CALL">
      {!active ? (
        <p className="text-[13px] text-slate-500">
          Appears automatically when the model cannot fully verify a call
          (medium risk or higher). Start monitoring or run the attack simulation to try it.
        </p>
      ) : (
        <div>
          <div className="flex items-center gap-2 text-[12px] font-extrabold tracking-widest text-amber-700">
            <ClipboardList size={15} /> MODEL UNSURE — FOLLOW THESE STEPS
          </div>

          {/* Current prompt */}
          <div className="mt-3 bg-amber-50 border border-amber-200 p-3">
            <div className="text-[11px] font-bold text-amber-700 tracking-wider">
              SAY TO CALLER · {current.label.toUpperCase()}
            </div>
            <div className="text-[15px] font-bold text-slate-900 mt-1">“{current.text}”</div>
            <div className="flex gap-2 mt-2">
              <button onClick={copyPrompt} className="flex items-center gap-1.5 px-3 py-1.5 border border-amber-300 text-amber-800 text-[12px] font-bold hover:bg-amber-100">
                {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "COPIED" : "COPY"}
              </button>
              <button onClick={() => setIndex((i) => i + 1)} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-white text-[12px] font-bold hover:bg-slate-900">
                <RefreshCw size={13} /> NEXT PROMPT ({(index % prompts.length) + 1}/{prompts.length})
              </button>
            </div>
          </div>

          {/* Steps checklist */}
          <div className="mt-3 space-y-1.5">
            {steps.map((s) => (
              <label key={s.id} className="flex items-start gap-2 text-[13px] text-slate-700 cursor-pointer">
                <input type="checkbox" checked={!!done[s.id]} onChange={() => toggleStep(s.id)} className="mt-1 accent-sky-600" />
                <span className={done[s.id] ? "line-through text-slate-400" : ""}>{s.text}</span>
              </label>
            ))}
          </div>

          <p className="text-[11px] text-slate-400 mt-2">
            Tip: never reuse the same digits twice — clones struggle with unpredictable numbers like “7 3 9 1”.
          </p>
        </div>
      )}
    </Card>
  );
}
