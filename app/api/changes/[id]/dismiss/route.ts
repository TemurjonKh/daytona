import { scoped,type Params } from "@/lib/monitor/route";
import { review } from "@/lib/monitor/repository";
export const runtime='nodejs';
export async function POST(r:Request,p:Params){return scoped(r,p,true,async(db,i,id)=>{await review(db,i,id,false);return Response.json({ok:true});});}
