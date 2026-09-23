import { cookies } from "next/headers";
import { getDb, type Db } from "./db/client";
import { resolveInstallation } from "./installations";
export function sameOrigin(request:Request) {
 try {const origin=request.headers.get('origin');return !!origin && new URL(origin).host===request.headers.get('host');}catch{return false;}
}
export async function installationRoute(request:Request,mutates:boolean,action:(db:Db,id:string)=>Promise<Response>) {
 if(mutates&&!sameOrigin(request))return Response.json({error:'Origin required'},{status:403});
 try {
   const db=getDb();const jar=await cookies();const identity=await resolveInstallation(db,jar.get('oa_install')?.value);
   const response=await action(db,identity.id);
   if(identity.created)response.headers.append('Set-Cookie',`oa_install=${identity.id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000${process.env.NODE_ENV==='production'?'; Secure':''}`);
   return response;
 }catch{console.error('request_failed',{code:process.env.DATABASE_URL?'storage_operation_failed':'database_not_configured'});return Response.json({error:process.env.DATABASE_URL?'Could not complete this request.':'DATABASE_URL is required.'},{status:503});}
}
export async function boundedJson(request:Request,maxBytes=1048576) {
 if(Number(request.headers.get('content-length')??0)>maxBytes)throw new RangeError('Body too large');
 const reader=request.body?.getReader();if(!reader)return null;const chunks:Uint8Array[]=[];let size=0;
 while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes){await reader.cancel();throw new RangeError('Body too large');}chunks.push(value);}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
