import { z } from "zod";
import { allowedEndpoint } from "@/lib/push/subscriptions";
import { saveSubscription } from "@/lib/db/repository";
import { installationRoute,boundedJson } from "@/lib/http";
export const runtime='nodejs';
const Subscription=z.object({endpoint:z.url().refine(allowedEndpoint),keys:z.object({p256dh:z.string().min(20).max(256),auth:z.string().min(10).max(128)})});
export async function GET(request:Request){return installationRoute(request,false,async()=>process.env.VAPID_PUBLIC_KEY?Response.json({publicKey:process.env.VAPID_PUBLIC_KEY},{headers:{'Cache-Control':'no-store'}}):Response.json({error:'Push configuration unavailable'},{status:503}));}
export async function POST(request:Request){return installationRoute(request,true,async(db,id)=>{
 const parsed=Subscription.safeParse(await boundedJson(request,16384));if(!parsed.success)return Response.json({error:'Invalid subscription'},{status:400});
 await saveSubscription(db,id,parsed.data);return Response.json({ok:true});
});}
