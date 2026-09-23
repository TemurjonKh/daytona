import type { Db } from "@/lib/db/client";
import { getOpportunity } from "@/lib/db/repository";
import { sendNotificationRef } from "./deliveries";
export const reminderClaimSql=`UPDATE reminders SET lease_until=now()+interval '2 minutes',attempt_count=attempt_count+1
 WHERE id IN (SELECT id FROM reminders WHERE sent_at IS NULL AND at<=now() AND attempt_count<3
 AND (next_attempt_at IS NULL OR next_attempt_at<=now()) AND (lease_until IS NULL OR lease_until<now()) ORDER BY at FOR UPDATE SKIP LOCKED LIMIT 50) RETURNING id,opportunity_id,attempt_count`;
export async function deliverReminders(db:Db,deadline=Date.now()+45000) {
 const claimed=(await db.query<{id:string;opportunity_id:string;attempt_count:number}>(reminderClaimSql)).rows;
 let remindersSent=0,remindersFailed=0;const unprocessed=new Set(claimed.map(r=>r.id));
 for(const reminder of claimed){
   if(Date.now()+16000>deadline)break;
   // Internal claim returns ownership only; all subsequent user-data operations are scoped.
   const owner=(await db.query<{installation_id:string}>('SELECT installation_id FROM opportunities WHERE id=$1',[reminder.opportunity_id])).rows[0];
   const i=owner.installation_id;const opportunity=await getOpportunity(db,i,reminder.opportunity_id);if(!opportunity)continue;
   unprocessed.delete(reminder.id);
   const deliveries=await sendNotificationRef(db,i,opportunity.id,'reminder',reminder.id,{title:'Opportunity reminder',url:`/?opportunity=${opportunity.id}`},deadline);
   let terminal=deliveries.length>0 && deliveries.every(d=>d.status==='sent'||d.status==='gone'||d.status==='failed'&&d.attempt_count>=3);
   if(reminder.attempt_count>=3){await db.query(`UPDATE notification_deliveries SET status='failed',attempt_count=3,error_code=COALESCE(error_code,'retry_exhausted'),updated_at=now() WHERE installation_id=$1 AND kind='reminder' AND ref_id=$2 AND status NOT IN ('sent','gone')`,[i,reminder.id]);terminal=true;}
   const failed=deliveries.length===0||deliveries.some(d=>d.status==='failed');
   await db.query(`UPDATE reminders r SET sent_at=CASE WHEN $3 THEN now() ELSE NULL END,lease_until=NULL,next_attempt_at=CASE WHEN $3 THEN NULL ELSE now()+($4 * interval '1 second') END,last_error_code=$5,updated_at=now() FROM opportunities o WHERE r.opportunity_id=o.id AND o.installation_id=$1 AND r.id=$2`,[i,reminder.id,terminal,60*2**(reminder.attempt_count-1),failed?'delivery_incomplete':null]);
   if(terminal){if(failed)remindersFailed++;else remindersSent++;}
 }
 // A batch claim must not consume attempts for work skipped by the time budget.
 if(unprocessed.size)await db.query('UPDATE reminders SET lease_until=NULL,attempt_count=GREATEST(0,attempt_count-1) WHERE id=ANY($1::uuid[]) AND sent_at IS NULL',[Array.from(unprocessed)]);
 return {remindersSent,remindersFailed};
}
