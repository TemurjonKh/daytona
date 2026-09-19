import { investigateImage } from "@/lib/openai/extract-image";
import { investigate } from "@/lib/agent/orchestrator";
import type { Emit } from "@/lib/agent/types";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:Request) {
  let run:(emit:Emit)=>Promise<void>;
  if(request.headers.get('content-type')?.includes('multipart/form-data')){
    if(Number(request.headers.get('content-length')??0)>11*1024*1024)return Response.json({error:'Poster must be smaller than 10 MB'},{status:413});
    try{
      const form=await request.formData();const file=form.get('poster');
      if(!(file instanceof File)||!['image/jpeg','image/png','image/webp'].includes(file.type))return Response.json({error:'Choose a JPG, PNG, or WebP poster'},{status:400});
      if(file.size===0||file.size>10*1024*1024)return Response.json({error:'Poster must be smaller than 10 MB'},{status:413});
      const bytes=Buffer.from(await file.arrayBuffer());
      const valid=file.type==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:file.type==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
      if(!valid)return Response.json({error:'Invalid image file'},{status:400});
      const goal=String(form.get('goal')??'').slice(0,1000);run=emit=>investigateImage(bytes,file.type,emit,goal);
    }catch{return Response.json({error:'Could not read poster upload'},{status:400});}
  }else{
    let input:unknown;try{input=await request.json();}catch{return Response.json({error:'Invalid URL'},{status:400});}
    const url=(input as {url?:unknown})?.url;
    if(typeof url!=='string'||url.length>8192)return Response.json({error:'Invalid URL'},{status:400});
    run=emit=>investigate(url,emit,typeof (input as {goal?:unknown}).goal==='string'?(input as {goal:string}).goal.slice(0,1000):undefined);
  }
  let disconnected=false;
  const stream=new ReadableStream({
    start(controller){
      const emit:Emit=(event,data)=>{if(disconnected)return;try{controller.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));}catch{disconnected=true;}};
      void run(emit).catch(error=>{const allowed=['Invalid URL','Page fetch failed','Daytona API key is not configured','Daytona sandbox creation failed','Browser rendering failed','Browser tooling unavailable','Could not extract useful page content','Sandbox cleanup failed; check Daytona dashboard'];const message=error instanceof Error&&allowed.includes(error.message)?error.message:'Investigation failed';console.error('Investigation failed:',message);emit('error',{message});emit('done',{ok:false});}).finally(()=>{if(!disconnected)controller.close();});
    },
    cancel(){disconnected=true;} // Work continues to finally, even when the caller closes the tab.
  });
  return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'}});
}
