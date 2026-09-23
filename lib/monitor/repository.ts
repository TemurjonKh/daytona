import type { Db } from "@/lib/db/client";
import { getOpportunity } from "@/lib/db/repository";
import { OpportunityResult } from "@/lib/schema";
import { automaticReminders,selectReminderTarget } from "@/lib/dates";
import { CheckError } from "./check";
export async function monitoring(db:Db,i:string,id:string,enabled:boolean,frequency:'daily'|'weekly'){
 const o=await getOpportunity(db,i,id);if(!o)throw new CheckError(404,'Opportunity not found');
 if(!/^https?:/.test(o.source_url))throw new CheckError(400,'Uploaded posters cannot be monitored.');
 await db.query(`UPDATE opportunities SET monitoring_enabled=$3,monitoring_frequency=$4,next_check_at=CASE WHEN $3 AND NOT monitoring_enabled THEN now() ELSE next_check_at END,updated_at=now() WHERE installation_id=$1 AND id=$2`,[i,id,enabled,frequency]);
}
export async function history(db:Db,i:string,id:string){
 if(!await getOpportunity(db,i,id))throw new CheckError(404,'Opportunity not found');
 const changes=(await db.query(`SELECT c.*,a.text_slice AS old_text,a.observed_at AS old_observed_at,b.text_slice AS new_text,b.observed_at AS new_observed_at,o.source_url FROM detected_changes c JOIN opportunities o ON o.id=c.opportunity_id LEFT JOIN source_snapshots a ON a.id=c.old_snapshot_id JOIN source_snapshots b ON b.id=c.new_snapshot_id WHERE o.installation_id=$1 AND o.id=$2 ORDER BY c.created_at DESC LIMIT 10`,[i,id])).rows;
 const checks=(await db.query(`SELECT h.status,h.note,h.observed_at FROM check_history h JOIN opportunities o ON o.id=h.opportunity_id WHERE o.installation_id=$1 AND o.id=$2 ORDER BY h.observed_at DESC LIMIT 10`,[i,id])).rows;
 return {changes,checks};
}
export async function review(db:Db,i:string,id:string,accept:boolean){return db.tx(async tx=>{
 const change=(await tx.query<{opportunity_id:string;new_snapshot_id:string;status:string;extracted_result:unknown;timezone:string}>(`SELECT c.*,s.extracted_result,o.timezone FROM detected_changes c JOIN opportunities o ON o.id=c.opportunity_id JOIN source_snapshots s ON s.id=c.new_snapshot_id WHERE o.installation_id=$1 AND c.id=$2 FOR UPDATE OF c,o`,[i,id])).rows[0];
 if(!change)throw new CheckError(404,'Change not found');
 if(change.status!=='pending_review')return;
 if(accept){
 const next=OpportunityResult.parse(change.extracted_result);const target=selectReminderTarget(next).target;
 // Reject while a reminder is being sent, so review cannot race its lease.
 if((await tx.query(`SELECT r.id FROM reminders r JOIN opportunities o ON o.id=r.opportunity_id WHERE o.installation_id=$1 AND o.id=$2 AND r.sent_at IS NULL AND r.lease_until>now()`,[i,change.opportunity_id])).rows.length)throw new CheckError(409,'A reminder is being delivered. Please retry shortly.');
 await tx.query(`UPDATE opportunities SET accepted_result=$3,due_at=$4,kind=$5,confidence=$6,accepted_snapshot_id=$7,updated_at=now() WHERE installation_id=$1 AND id=$2`,[i,change.opportunity_id,JSON.stringify(next),target?.value??null,target?.kind??'other',next.confidence,change.new_snapshot_id]);
 await tx.query(`DELETE FROM reminders r USING opportunities o WHERE r.opportunity_id=o.id AND o.installation_id=$1 AND o.id=$2 AND r.sent_at IS NULL`,[i,change.opportunity_id]);
 if(target)for(const reminder of automaticReminders(target,change.timezone).filter(r=>Date.parse(r.at)>Date.now()))await tx.query(`INSERT INTO reminders(opportunity_id,at,label) SELECT id,$3,$4 FROM opportunities WHERE installation_id=$1 AND id=$2 ON CONFLICT(opportunity_id,at) DO NOTHING`,[i,change.opportunity_id,reminder.at,reminder.days+' days before']);
 // Accepting a snapshot reviews all its fields; retain each corresponding change record.
 await tx.query(`UPDATE detected_changes c SET status='accepted',reviewed_at=now() FROM opportunities o WHERE c.opportunity_id=o.id AND o.installation_id=$1 AND o.id=$2 AND c.new_snapshot_id=$3 AND c.status='pending_review'`,[i,change.opportunity_id,change.new_snapshot_id]);
 }else await tx.query(`UPDATE detected_changes c SET status='dismissed',reviewed_at=now() FROM opportunities o WHERE c.opportunity_id=o.id AND o.installation_id=$1 AND c.id=$2`,[i,id]);
 });}
