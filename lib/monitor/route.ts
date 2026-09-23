import { installationRoute } from "@/lib/http";
import { CheckError } from "./check";
import type { Db } from "@/lib/db/client";
import { z } from "zod";
export type Params={params:Promise<{id:string}>};
export async function scoped(request:Request,params:Params,mutates:boolean,fn:(db:Db,i:string,id:string)=>Promise<Response>){
 return installationRoute(request,mutates,async(db,i)=>{const {id}=await params.params;if(!z.uuid().safeParse(id).success)return Response.json({error:'Not found'},{status:404});try{return await fn(db,i,id);}catch(error){return Response.json({error:error instanceof CheckError?error.message:'Request could not be completed'},{status:error instanceof CheckError?error.status:400});}});
}
