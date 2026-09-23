import { z } from 'zod';
import { preparePosterUpload } from '@/lib/poster/prepare-upload';
import { OpportunityResult } from '@/lib/schema';
import type { Source, Stage } from './types';
const MultipleResults = z.array(OpportunityResult).min(2);

export async function readInvestigationStream(body:ReadableStream<Uint8Array>,onStage:(stage:Stage)=>void,onSource:(source:Source)=>void,onResults:(results:OpportunityResult[])=>void) {
 const reader=body.getReader();const decoder=new TextDecoder();let buffer='';let completed=false;let failure='';
 try{
  while(true){
   const {value,done}=await reader.read();buffer+=done?decoder.decode():decoder.decode(value,{stream:true});
   let boundary:RegExpMatchArray|null;
   while((boundary=buffer.match(/\r?\n\r?\n/))){
    const frame=buffer.slice(0,boundary.index);buffer=buffer.slice(boundary.index!+boundary[0].length);
    const lines=frame.split(/\r?\n/);const event=lines.find(x=>x.startsWith('event:'))?.slice(6).trim();
    const payload=lines.filter(x=>x.startsWith('data:')).map(x=>x.slice(5).trimStart()).join('\n');if(!payload)continue;
    let data:unknown;try{data=JSON.parse(payload);}catch{throw new Error('Invalid investigation response');}
    if(event==='stage')onStage(data as Stage);
    if(event==='source')onSource(data as Source);
    if(event==='result'){
     const parsed=OpportunityResult.safeParse(data);if(!parsed.success)throw new Error('Invalid opportunity response');
     onResults([parsed.data]);
    }
    if(event==='results'){
     // Validate the entire array before invoking the renderer; never publish a partial array.
     const parsed=MultipleResults.safeParse(data);if(!parsed.success)throw new Error('Invalid multi-poster response');
     onResults(parsed.data);
    }
    if(event==='error')failure=(data as {message:string}).message;
    if(event==='done'){completed=true;if(!(data as {ok:boolean}).ok&&!failure)failure='Investigation failed';}
   }
   if(done)break;
  }
 }finally{reader.releaseLock();}
 if(failure)throw new Error(failure);if(!completed)throw new Error('Investigation connection ended early');
}
export async function streamInvestigation(url:string,onStage:(stage:Stage)=>void,onSource:(source:Source)=>void,onResults:(results:OpportunityResult[])=>void,goal?:string,poster?:File) {
 const form=new FormData();if(poster){onStage({stage:'reading_poster',status:'started',message:'Preparing a readable poster upload'});const prepared=await preparePosterUpload(poster);form.set('poster',prepared.file);form.set('uploadMetadata',JSON.stringify(prepared.metadata));}if(goal)form.set('goal',goal.slice(0,1000));
 const response=await fetch('/api/investigate',poster?{method:'POST',body:form}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url,goal})});
 if(!response.ok||!response.body)throw new Error('Investigation could not start');
 await readInvestigationStream(response.body,onStage,onSource,onResults);
}
