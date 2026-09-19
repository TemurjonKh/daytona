import { investigate } from "@/lib/agent/orchestrator";
import type { Emit } from "@/lib/agent/types";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:Request) {
  let input:unknown;
  try{input=await request.json();}catch{return Response.json({error:'Invalid URL'},{status:400});}
  const url=(input as {url?:unknown})?.url;
  if(typeof url!=='string'||url.length>8192)return Response.json({error:'Invalid URL'},{status:400});
  let disconnected=false;
  const stream=new ReadableStream({
    start(controller){
      const emit:Emit=(event,data)=>{if(disconnected)return;try{controller.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));}catch{disconnected=true;}};
      void investigate(url,emit).catch(error=>{const allowed=['Invalid URL','Page fetch failed','Daytona API key is not configured','Daytona sandbox creation failed','Browser rendering failed','Browser tooling unavailable','Could not extract useful page content','Sandbox cleanup failed; check Daytona dashboard'];const message=error instanceof Error&&allowed.includes(error.message)?error.message:'Investigation failed';console.error('Investigation failed:',message);emit('error',{message});emit('done',{ok:false});}).finally(()=>{if(!disconnected)controller.close();});
    },
    cancel(){disconnected=true;} // Work continues to finally, even when the caller closes the tab.
  });
  return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'}});
}
