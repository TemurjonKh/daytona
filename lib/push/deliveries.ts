import webpush from "web-push";
import type { Db } from "@/lib/db/client";
import { vapidKeys } from "./subscriptions";
export type NotificationKind='reminder'|'change';
export async function sendNotificationRef(db:Db,installationId:string,opportunityId:string,kind:NotificationKind,refId:string,payload:{title:string;url:string},deadline=Infinity) {
 await db.query(`INSERT INTO notification_deliveries(installation_id,opportunity_id,subscription_id,kind,ref_id,idempotency_key)
 SELECT $1,o.id,s.id,$3,$4::uuid,$3||':'||$4::uuid::text||':'||s.id FROM push_subscriptions s JOIN opportunities o ON o.installation_id=s.installation_id
 WHERE s.installation_id=$1 AND o.id=$2 AND s.active ON CONFLICT(idempotency_key) DO NOTHING`,[installationId,opportunityId,kind,refId]);
 const rows=(await db.query<{id:string;subscription_id:string}>(`SELECT id,subscription_id FROM notification_deliveries WHERE installation_id=$1 AND opportunity_id=$2 AND kind=$3 AND ref_id=$4 AND status IN ('pending','failed') AND attempt_count<3 AND (next_attempt_at IS NULL OR next_attempt_at<=now())`,[installationId,opportunityId,kind,refId])).rows;
 for(const row of rows){
   if(Date.now()+16000>deadline)break;
   const claim=(await db.query<{attempt_count:number}>(`UPDATE notification_deliveries SET lease_until=now()+interval '2 minutes',attempt_count=attempt_count+1,attempted_at=now(),updated_at=now() WHERE installation_id=$1 AND id=$2 AND status IN ('pending','failed') AND attempt_count<3 AND (lease_until IS NULL OR lease_until<now()) RETURNING attempt_count`,[installationId,row.id])).rows[0];
   if(!claim)continue;
   const sub=(await db.query<{endpoint:string;p256dh:string;auth:string;active:boolean}>('SELECT endpoint,p256dh,auth,active FROM push_subscriptions WHERE installation_id=$1 AND id=$2',[installationId,row.subscription_id])).rows[0];
   let status='sent',code:string|null=null;
   try {
     if(!sub?.active){status='gone';code='inactive';}
     else await webpush.sendNotification({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},JSON.stringify({...payload,id:`${kind}:${refId}`}),{TTL:43200,timeout:15000,vapidDetails:vapidKeys()});
   }catch(error){
     const http=(error as {statusCode?:number}).statusCode;
     status=http===404||http===410?'gone':'failed';code=http?`http_${http}`:'network';
     if(status==='gone')await db.query('UPDATE push_subscriptions SET active=false,updated_at=now() WHERE installation_id=$1 AND id=$2',[installationId,row.subscription_id]);
     else if(http && http!==429 && http<500)await db.query('UPDATE notification_deliveries SET attempt_count=3 WHERE installation_id=$1 AND id=$2',[installationId,row.id]);
   }
   await db.query(`UPDATE notification_deliveries SET status=$3,error_code=$4,lease_until=NULL,delivered_at=CASE WHEN $3='sent' THEN now() ELSE NULL END,next_attempt_at=CASE WHEN $3='failed' THEN now()+($5 * interval '1 second') ELSE NULL END,updated_at=now() WHERE installation_id=$1 AND id=$2`,[installationId,row.id,status,code,60*2**(claim.attempt_count-1)]);
 }
 return (await db.query<{status:string;attempt_count:number}>('SELECT status,attempt_count FROM notification_deliveries WHERE installation_id=$1 AND opportunity_id=$2 AND kind=$3 AND ref_id=$4',[installationId,opportunityId,kind,refId])).rows;
}
