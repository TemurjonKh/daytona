import { z } from "zod";
import { OpportunityResult, SavedEvent } from "@/lib/schema";
import { listOpportunities,saveOpportunity } from "@/lib/db/repository";
import { boundedJson,installationRoute } from "@/lib/http";
export const runtime='nodejs';
const Input=z.object({event:SavedEvent,result:OpportunityResult});
export async function GET(request:Request){return installationRoute(request,false,async(db,id)=>Response.json({opportunities:await listOpportunities(db,id)}));}
export async function POST(request:Request){return installationRoute(request,true,async(db,id)=>{
 try {const parsed=Input.safeParse(await boundedJson(request));if(!parsed.success)return Response.json({error:'Invalid opportunity'},{status:400});
 const event=await saveOpportunity(db,id,parsed.data.event,parsed.data.result);return Response.json({event});
 }catch(error){return Response.json({error:error instanceof RangeError?'Body too large':'Unable to save. Review any pending date change first.'},{status:error instanceof RangeError?413:400});}
});}
