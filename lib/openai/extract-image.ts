import { runPosterPipeline, POSTER_CALL_TIMEOUT_MS } from "@/lib/poster/pipeline";
import type { UploadMetadata } from "@/lib/poster/prepare-upload";
import OpenAI from "openai";
import { OpportunityResult } from "@/lib/schema";
import { computeConfidence } from "@/lib/agent/confidence";
import { noDateResult } from "@/lib/agent/grounding";
import type { Emit, Source } from "@/lib/agent/types";
import { createHash } from "node:crypto";
import { normalizeDateCandidates,type DateCandidate } from "@/lib/dates/evidence";

export function normalizeImageResult(input:OpportunityResult & {importantDates:DateCandidate[]},id:string){
 const normalized=normalizeDateCandidates(input.importantDates.map(date=>({...date,sourceUrl:id})),{source:'image',allowInferred:false});
 const result=OpportunityResult.parse({...input,importantDates:normalized.dates,sources:[{url:id,title:'Uploaded poster',status:'fetched'}],conflicts:input.conflicts.map(c=>({...c,sourceUrls:[id]})),applicationUrl:input.applicationUrl&&/^https?:\/\//.test(input.applicationUrl)?input.applicationUrl:null});
 const confidence=computeConfidence(result,id,normalized.dropped,normalized.weak,normalized.contextual);
 result.confidence=confidence==='high'?'medium':confidence;
 return {result,...normalized};
}

export async function investigateImage(bytes:Buffer,mime:string,emit:Emit,goal?:string,upload?:UploadMetadata){
 const id='urn:poster:sha256:'+createHash('sha256').update(bytes).digest('hex');
 const source:Source={title:'Uploaded poster',url:id,canonicalUrl:null,text:'',links:[],method:'plain fetch'};
 emit('stage',{stage:'reading_poster',status:'started',message:'Preparing overlapping views and transcribing all visible lines'});
 try{
  if(!process.env.OPENAI_API_KEY)throw new Error('OpenAI API key is not configured');
  const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY,timeout:POSTER_CALL_TIMEOUT_MS,maxRetries:0});
  const model=process.env.OPENAI_MODEL||'gpt-4.1-mini';
  const pipeline=await runPosterPipeline(bytes,id,client,model,goal,upload);
  // Counts, geometry, timing and token usage only; never image bytes, quotes or credentials.
  console.info('Poster pipeline metrics',JSON.stringify(pipeline.diagnostics));
  emit('stage',{stage:'reading_poster',status:'completed',message:pipeline.diagnostics.transcriptionTruncated?'Poster transcription was incomplete; recovered evidence needs review':'Visible text transcribed from overlapping views'});
  emit('stage',{stage:'verifying_dates',status:'completed',message:`${pipeline.dateEvidence.length} date-bearing lines retained for review`});
  if(pipeline.kind==='multiple')emit('results',pipeline.results);else emit('result',pipeline.result);emit('stage',{stage:'completed',status:'completed'});emit('done',{ok:true});
 }catch(error){
  const e=error as {name?:string;status?:number;code?:string};
  const message=e.name?.includes('Timeout')||e.name?.includes('Abort')?'Poster extraction timed out':'Poster extraction failed';
  console.error('Poster extraction failed:',e.name??'error',e.status??'',e.code??'');
  emit('stage',{stage:'extracting_opportunity',status:'failed',message});emit('result',noDateResult(source,message));emit('error',{message});emit('done',{ok:false});
 }
}
