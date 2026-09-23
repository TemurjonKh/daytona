import { UserTimezone } from "@/lib/schema";
import { importLegacy } from "@/lib/db/repository";
import { boundedJson,installationRoute } from "@/lib/http";
export const runtime='nodejs';
export async function POST(request:Request){return installationRoute(request,true,async(db,id)=>{
 try {const raw=await boundedJson(request);if(!Array.isArray(raw))return Response.json({error:'Expected an array'},{status:400});
 if(raw.length>500)return Response.json({error:'Too many records'},{status:413});
 const timezone=request.headers.get('x-user-timezone');if(!UserTimezone.safeParse(timezone).success)return Response.json({error:'Valid timezone required'},{status:400});
 return Response.json(await importLegacy(db,id,raw,timezone!));
 }catch(error){return Response.json({error:'Invalid import'},{status:error instanceof RangeError?413:400});}
});}
