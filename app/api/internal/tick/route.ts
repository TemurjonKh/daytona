import { getDb } from "@/lib/db/client";
import { validTickToken } from "@/lib/internal-auth";
import { deliverReminders } from "@/lib/push/scheduler";
export const runtime='nodejs';
// Requested budget supported by Vercel Fluid Compute; deployment settings must be verified before enabling cron.
export const maxDuration=300;
export async function POST(request:Request){
 if(!validTickToken(request))return Response.json({error:'Unauthorized'},{status:401});
 try {const counts=await deliverReminders(getDb());return Response.json({...counts,checksClaimed:0,unchanged:0,changed:0,failed:0});}
 catch{console.error('tick_failed',{code:'storage_or_configuration'});return Response.json({error:'Tick unavailable'},{status:503});}
}
export const GET=POST;
