import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import type OpenAI from 'openai';
import { preparePosterViews } from './preprocess';
import { readTranscription, deduplicateTranscription, orderedPosterRegionIds, TranscriptionSchema } from './transcription';
import { discoverDateEvidence } from '@/lib/dates/evidence';
import { ClassificationSchema, mergePosterEvidence } from './classification';
import { transcribeInstructions, classifyInstructions } from './prompts';
import type { UploadMetadata } from './prepare-upload';

export const TRANSCRIBE_OUTPUT_TOKENS = 24_000;
export const CLASSIFY_OUTPUT_TOKENS = 8_000;
export const POSTER_CALL_TIMEOUT_MS = 45_000;
export const UploadMetadataSchema = z.object({
 originalWidth:z.number().int().positive().max(60000),originalHeight:z.number().int().positive().max(60000),
 preparedWidth:z.number().int().positive().max(4096),preparedHeight:z.number().int().positive().max(4096),
 originalBytes:z.number().int().nonnegative().max(30_000_000),preparedBytes:z.number().int().nonnegative().max(3_800_000),
 originalMime:z.enum(['image/jpeg','image/png','image/webp']),mime:z.literal('image/jpeg'),preprocessingMs:z.number().nonnegative().max(600_000),
});
export type PosterClient = Pick<OpenAI, 'chat'>;
const callUsage=(response:OpenAI.Chat.Completions.ChatCompletion,model:string,latencyMs:number)=>{
 const inputTokens=response.usage?.prompt_tokens??null,outputTokens=response.usage?.completion_tokens??null;
 const cachedTokens=response.usage?.prompt_tokens_details?.cached_tokens??0;
 const knownPrice=/^gpt-4\.1-mini(?:-2025-04-14)?$/.test(model);
 return {latencyMs,inputTokens,outputTokens,cachedTokens,estimatedUsd:knownPrice&&inputTokens!==null&&outputTokens!==null?((inputTokens-cachedTokens)*0.4+cachedTokens*0.1+outputTokens*1.6)/1_000_000:null};
};
export async function runPosterPipeline(bytes:Buffer,sourceId:string,client:PosterClient,model:string,goal?:string,upload?:UploadMetadata) {
 const started=performance.now();
 const prepared=await preparePosterViews(bytes,model);
 const image=(view:typeof prepared.views[number]):OpenAI.Chat.Completions.ChatCompletionContentPart=>({type:'image_url',image_url:{url:`data:image/jpeg;base64,${view.bytes.toString('base64')}`,detail:'high'}});
 const viewMetadata=prepared.views.map(({bytes:encoded,...view})=>({...view,bytes:encoded.length}));
 const transcriptionStart=performance.now();
 // create(), not parse(): retain the raw finish_reason/content on length termination.
 const transcribed=await client.chat.completions.create({model,max_completion_tokens:TRANSCRIBE_OUTPUT_TOKENS,
  messages:[{role:'developer',content:transcribeInstructions},{role:'user',content:[
   {type:'text',text:JSON.stringify({views:viewMetadata})},...prepared.views.flatMap(view=>[{type:'text' as const,text:`View: ${view.viewId}`},image(view)])]}],
  response_format:zodResponseFormat(TranscriptionSchema,'poster_transcription'),
 },{timeout:POSTER_CALL_TIMEOUT_MS,signal:AbortSignal.timeout(POSTER_CALL_TIMEOUT_MS)});
 const transcriptionUsage=callUsage(transcribed,model,Math.round(performance.now()-transcriptionStart));
 const choice=transcribed.choices[0];
 const transcription=readTranscription(choice?.message.content??null,choice?.finish_reason??null,prepared.views);
 const discoveryStart=performance.now();
 const lines=deduplicateTranscription(transcription.transcript,prepared.views);
 const dateEvidence=discoverDateEvidence(lines);
 const discoveryMs=performance.now()-discoveryStart;
 const classificationStart=performance.now();
 let classified:OpenAI.Chat.Completions.ChatCompletion|null=null;
 try{classified=await client.chat.completions.create({model,max_completion_tokens:CLASSIFY_OUTPUT_TOKENS,
  messages:[{role:'developer',content:classifyInstructions},{role:'user',content:[
   {type:'text',text:JSON.stringify({goal:goal?.slice(0,1000)??null,transcriptionTruncated:transcription.truncated,dateEvidence,lines})},image(prepared.views[0])]}],
  response_format:zodResponseFormat(ClassificationSchema,'poster_classification'),
 },{timeout:POSTER_CALL_TIMEOUT_MS,signal:AbortSignal.timeout(POSTER_CALL_TIMEOUT_MS)});
 }catch{/* No retry: deterministically retain all transcription evidence if classification fails. */}
 const classificationUsage=classified?callUsage(classified,model,Math.round(performance.now()-classificationStart)):{latencyMs:Math.round(performance.now()-classificationStart),inputTokens:null,outputTokens:null,cachedTokens:0,estimatedUsd:null};
 let classification:unknown;
 try{classification=JSON.parse(classified?.choices[0]?.message.content??'');}catch{classification=null;}
 const parsed=ClassificationSchema.safeParse(classification);
 const normalizationStart=performance.now();
 const merged=mergePosterEvidence(lines,dateEvidence,parsed.success?parsed.data:{regions:[],mappings:[]},sourceId,{
  truncated:transcription.truncated,resolutionInsufficient:prepared.resolutionInsufficient,regionOrder:orderedPosterRegionIds(transcription.transcript,prepared.views),
  classificationIncomplete:!parsed.success||classified?.choices[0]?.finish_reason!=='stop',
 });
 const diagnostics={model,upload:upload??null,prepared:{width:prepared.width,height:prepared.height,bytes:bytes.length},views:viewMetadata,
  browserPreprocessingMs:upload?.preprocessingMs??null,serverPreprocessingMs:prepared.preprocessingMs,
  transcription:transcriptionUsage,classification:classificationUsage,normalizationMs:Math.round(discoveryMs+performance.now()-normalizationStart),
  totalMs:Math.round(performance.now()-started)+(upload?.preprocessingMs??0),transcriptionTruncated:transcription.truncated,lineCount:lines.length,
  evidenceCount:dateEvidence.length,reasons:merged.reasons,
 };
 return {...merged,diagnostics,lines,dateEvidence,mappings:parsed.success?parsed.data.mappings:[]};
}
