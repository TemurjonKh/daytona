import { OpportunityResult } from "@/lib/schema";
import type { Source, Stage } from "./types";
export async function streamInvestigation(url:string,onStage:(stage:Stage)=>void,onSource:(source:Source)=>void,onResult:(result:OpportunityResult)=>void,goal?:string) {
  const response=await fetch('/api/investigate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url,goal})});
  if(!response.ok||!response.body)throw new Error('Investigation could not start');
  const reader=response.body.getReader();const decoder=new TextDecoder();let buffer='';let completed=false;let failure='';
  try{while(true){const {value,done}=await reader.read();buffer+=done?decoder.decode():decoder.decode(value,{stream:true});let end:number;
    while((end=buffer.indexOf('\n\n'))!==-1){const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);const event=frame.split('\n').find(x=>x.startsWith('event:'))?.slice(6).trim();const payload=frame.split('\n').filter(x=>x.startsWith('data:')).map(x=>x.slice(5).trimStart()).join('\n');if(!payload)continue;const data=JSON.parse(payload);if(event==='stage')onStage(data);if(event==='source')onSource(data);if(event==='result')onResult(OpportunityResult.parse(data));if(event==='error')failure=data.message;if(event==='done'){completed=true;if(!data.ok&&!failure)failure='Investigation failed';}}
    if(done)break;
  }}finally{reader.releaseLock();}
  if(failure)throw new Error(failure);if(!completed)throw new Error('Investigation connection ended early');
}
