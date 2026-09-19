"use client";
import { useRef, useState } from "react";
export default function InputCard({onInvestigate,busy=false}: {onInvestigate: (url:string,goal?:string,poster?:File) => void;busy?:boolean}) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  function acceptFile(candidate?: File) {
    if (!candidate) return;
    if (!["image/jpeg","image/png","image/webp"].includes(candidate.type)) {setError("Choose a poster image (PNG, JPG, or WebP)."); return;}
    if (candidate.size > 10 * 1024 * 1024) {setError("Please choose an image smaller than 10 MB."); return;}
    setError(""); setFile(candidate);
  }
  return <section className="card p-5 sm:p-7" aria-labelledby="input-title">
    <div className="mb-5 flex items-center gap-3"><span className="step-number">01</span><h2 id="input-title" className="font-semibold">Start with a source</h2></div>
    <form onSubmit={e => {e.preventDefault(); const form=new FormData(e.currentTarget);onInvestigate(String(form.get("url")??""),String(form.get("goal")??""),file??undefined);}} className="space-y-4">
      <div><label htmlFor="source-url" className="field-label">Opportunity link</label><input id="source-url" name="url" required={!file} disabled={!!file} type="url" placeholder="https://example.com/your-next-opportunity" className="input" /></div>
      <div className="flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-100"/>or upload a poster<span className="h-px flex-1 bg-slate-100"/></div>
      <button type="button" onClick={() => picker.current?.click()} onDragOver={e => {e.preventDefault(); setDragging(true);}} onDragLeave={() => setDragging(false)} onDrop={e => {e.preventDefault(); setDragging(false); acceptFile(e.dataTransfer.files[0]);}} className={`w-full rounded-2xl border border-dashed px-4 py-5 text-center ${dragging ? "border-purple-500 bg-purple-50" : "border-slate-300 bg-slate-50/60"}`}>
        <span className="mb-2 block text-xl text-purple-600" aria-hidden="true">↥</span><span className="block break-all text-sm font-medium">{file ? file.name : "Drop a poster here, or browse files"}</span><span className="mt-1 block text-xs text-slate-500">PNG, JPG or WebP · up to 10 MB · sent securely for vision analysis</span>
      </button>
      <input ref={picker} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" aria-label="Choose poster" onChange={e => acceptFile(e.target.files?.[0])}/>
      {file&&<button type="button" className="text-xs text-purple-600" onClick={()=>setFile(null)}>Remove poster / use URL instead</button>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div><label htmlFor="goal" className="field-label">Your goal <span className="font-normal text-slate-400">(optional)</span></label><input id="goal" name="goal" className="input" placeholder="What do I need to apply?" /></div>
      <button disabled={busy} className="primary w-full disabled:opacity-50" type="submit">{busy?"Investigating…":"Investigate"} <span aria-hidden="true">↗</span></button>
      <p className="text-center text-xs text-slate-500">Paste a link or select a poster. Image evidence is transcribed by vision.</p>
    </form>
  </section>;
}
