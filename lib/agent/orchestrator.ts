import { validateUrl } from "@/lib/security/validate-url";
import { plainFetch } from "@/lib/fetch/plain-fetch";
import { usefulSource } from "@/lib/fetch/escalate";
import { renderInDaytona } from "@/lib/daytona/client";
import type { Emit, Source } from "./types";
export async function investigate(input:string,emit:Emit) {
  const url=await validateUrl(input);emit('stage',{stage:'validated',status:'completed'});
  let source:Source|undefined;const started=Date.now();emit('stage',{stage:'fetching',status:'started'});
  try {source=await plainFetch(url);emit('stage',{stage:'page_fetched',status:'completed',durationMs:Date.now()-started,message:usefulSource(source)?'Useful page content found':'Insufficient page text; escalating to Daytona'});}
  catch{emit('stage',{stage:'page_fetched',status:'failed',durationMs:Date.now()-started,message:'Page fetch failed; escalating to Daytona'});}
  if(!source||!usefulSource(source))source=await renderInDaytona(url,emit);
  if(!usefulSource(source))throw new Error('Could not extract useful page content');
  emit('stage',{stage:'source_extracted',status:'completed'});emit('source',source);emit('stage',{stage:'completed',status:'completed'});emit('done',{ok:true});
}
