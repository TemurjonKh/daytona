import type { OpportunityResult } from "@/lib/schema";
export default function EvidenceList({result,live=false}:{result:OpportunityResult;live?:boolean}) {
  const groups=new Map<string,{status:"fetched"|"partial"|"failed";quotes:Set<string>}>();
  for(const source of result.sources)groups.set(source.url,{status:source.status,quotes:new Set()});
  for(const date of result.importantDates){
    if(!groups.has(date.sourceUrl))groups.set(date.sourceUrl,{status:"partial",quotes:new Set()});
    if(date.sourceText)groups.get(date.sourceUrl)!.quotes.add(date.sourceText);
  }
  return <section className="border-t border-slate-100 pt-5" aria-label="Source evidence"><h3 className="mb-3 font-semibold">Source evidence {live?"":"· Demo"}</h3><div className="space-y-3">{[...groups].map(([url,group])=>{
    const poster=url.startsWith("urn:poster:");
    const hostname=poster?"":new URL(url).hostname;
    const name=poster?"Uploaded poster":hostname.endsWith("contestkorea.com")?"ContestKorea":hostname;
    return <div key={url} className="rounded-xl border-l-2 border-purple-300 bg-slate-50 p-4"><div className="mb-2 flex items-center justify-between gap-2"><h4 className="text-sm font-semibold">{name}</h4><span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-500">{group.status}</span></div>{poster?<p className="text-xs text-slate-500">Vision transcription; review the original image</p>:<a className="source-link" href={url} target="_blank" rel="noreferrer">{url} ↗</a>}<ul className="mt-3 space-y-2">{[...group.quotes].map(quote=><li key={quote}><blockquote className="text-sm leading-6 text-slate-600">“{quote}”</blockquote></li>)}</ul></div>;
  })}</div></section>;
}
