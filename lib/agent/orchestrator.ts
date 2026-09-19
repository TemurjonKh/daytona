import { extractText } from "@/lib/openai/extract-text";
import { groundResult, noDateResult } from "./grounding";
import { computeConfidence } from "./confidence";
import { validateUrl } from "@/lib/security/validate-url";
import { plainFetch } from "@/lib/fetch/plain-fetch";
import { usefulSource } from "@/lib/fetch/escalate";
import { renderInDaytona } from "@/lib/daytona/client";
import type { Emit, Source } from "./types";
export async function investigate(input:string,emit:Emit,goal?:string) {
  const url=await validateUrl(input);emit('stage',{stage:'validated',status:'completed'});
  let source:Source|undefined;const started=Date.now();emit('stage',{stage:'fetching',status:'started'});
  try {source=await plainFetch(url);emit('stage',{stage:'page_fetched',status:'completed',durationMs:Date.now()-started,message:usefulSource(source)?'Useful page content found':'Insufficient page text; escalating to Daytona'});}
  catch{emit('stage',{stage:'page_fetched',status:'failed',durationMs:Date.now()-started,message:'Page fetch failed; escalating to Daytona'});}
  if(!source||!usefulSource(source))source=await renderInDaytona(url,emit);
  if(!usefulSource(source))throw new Error('Could not extract useful page content');
  emit('stage',{stage:'source_extracted',status:'completed'});emit('source',source);
  const extractionStarted=Date.now();emit('stage',{stage:'extracting_opportunity',status:'started'});
  try {
    const draft=await extractText(source,goal);emit('stage',{stage:'extracting_opportunity',status:'completed',durationMs:Date.now()-extractionStarted});
    emit('stage',{stage:'verifying_evidence',status:'started'});
    const grounded=groundResult(draft,source);
    emit('stage',{stage:'verifying_evidence',status:'completed',message:grounded.dropped?`${grounded.dropped} ungrounded date entries dropped`:'Date quotes verified against the exact source slice'});
    emit('stage',{stage:'computing_confidence',status:'started'});
    grounded.result.confidence=computeConfidence(grounded.result,url,grounded.dropped,grounded.weak);
    emit('stage',{stage:'computing_confidence',status:'completed'});emit('result',grounded.result);
  }catch(error){const message=error instanceof Error?error.message:'Opportunity extraction failed';emit('stage',{stage:'extracting_opportunity',status:'failed',message,durationMs:Date.now()-extractionStarted});emit('result',noDateResult(source,message));emit('error',{message});emit('done',{ok:false});return;}
  emit('stage',{stage:'completed',status:'completed'});emit('done',{ok:true});
}
