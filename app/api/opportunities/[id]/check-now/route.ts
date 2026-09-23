import { scoped,type Params } from "@/lib/monitor/route";
import { checkOpportunity } from "@/lib/monitor/check";
export const runtime='nodejs';
export const maxDuration=300;
export async function POST(r:Request,p:Params){return scoped(r,p,true,async(db,i,id)=>Response.json(await checkOpportunity(i,id,{db,manual:true})));}
