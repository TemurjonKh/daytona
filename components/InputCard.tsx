"use client";
import { useRef, useState } from "react";
export default function InputCard({onInvestigate}: {onInvestigate: () => void}) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  function acceptFile(candidate?: File) {
    if (!candidate) return;
    if (!candidate.type.startsWith("image/")) {setError("Choose a poster image (PNG, JPG, or WebP)."); return;}
    if (candidate.size > 10 * 1024 * 1024) {setError("Please choose an image smaller than 10 MB."); return;}
    setError(""); setFile(candidate);
  }
  return <section className="card p-5 sm:p-7" aria-labelledby="input-title">
    <div className="mb-5 flex items-center gap-3"><span className="step-number">01</span><h2 id="input-title" className="font-semibold">Start with a source</h2></div>
    <form onSubmit={e => {e.preventDefault(); onInvestigate();}} className="space-y-4">
      <div><label htmlFor="source-url" className="field-label">Opportunity link</label><input id="source-url" type="url" placeholder="https://example.com/your-next-opportunity" className="input" /></div>
      <div className="flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-100"/>or upload a poster<span className="h-px flex-1 bg-slate-100"/></div>
      <button type="button" onClick={() => picker.current?.click()} onDragOver={e => {e.preventDefault(); setDragging(true);}} onDragLeave={() => setDragging(false)} onDrop={e => {e.preventDefault(); setDragging(false); acceptFile(e.dataTransfer.files[0]);}} className={`w-full rounded-2xl border border-dashed px-4 py-5 text-center ${dragging ? "border-purple-500 bg-purple-50" : "border-slate-300 bg-slate-50/60"}`}>
        <span className="mb-2 block text-xl text-purple-600" aria-hidden="true">↥</span><span className="block break-all text-sm font-medium">{file ? file.name : "Drop a poster here, or browse files"}</span><span className="mt-1 block text-xs text-slate-500">PNG, JPG or WebP · up to 10 MB · stays on your device</span>
      </button>
      <input ref={picker} type="file" accept="image/*" className="hidden" aria-label="Choose poster" onChange={e => acceptFile(e.target.files?.[0])}/>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div><label htmlFor="goal" className="field-label">Your goal <span className="font-normal text-slate-400">(optional)</span></label><input id="goal" className="input" placeholder="What do I need to apply?" /></div>
      <button className="primary w-full" type="submit">Investigate <span aria-hidden="true">↗</span></button>
      <p className="text-center text-xs text-slate-500">Mock preview only. No sources are fetched or uploaded.</p>
    </form>
  </section>;
}
