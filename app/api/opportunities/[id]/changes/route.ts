import { scoped,type Params } from "@/lib/monitor/route";
import { history } from "@/lib/monitor/repository";
export const runtime='nodejs';
export async function GET(r:Request,p:Params){return scoped(r,p,false,async(db,i,id)=>Response.json(await history(db,i,id)));}
