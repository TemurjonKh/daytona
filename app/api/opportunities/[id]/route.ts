import { scoped,type Params } from "@/lib/monitor/route";
import { readOpportunity } from "@/lib/db/repository";
import { monitoring } from "@/lib/monitor/repository";
import { boundedJson } from "@/lib/http";
import { z } from "zod";
export const runtime='nodejs';
export async function GET(r:Request,p:Params){return scoped(r,p,false,async(db,i,id)=>{const event=await readOpportunity(db,i,id);return Response.json(event?{event}:{error:'Not found'},{status:event?200:404});});}
export async function PATCH(r:Request,p:Params){return scoped(r,p,true,async(db,i,id)=>{const body=z.object({enabled:z.boolean(),frequency:z.enum(['daily','weekly'])}).parse(await boundedJson(r,2048));await monitoring(db,i,id,body.enabled,body.frequency);return Response.json({ok:true});});}
