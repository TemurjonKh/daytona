import { OpportunityResult, SavedEvent } from "@/lib/schema";
import { mergeReminders, opportunityIdentity, migrateSavedEvents } from "@/lib/saved-events";
import type { Db } from "./client";
export type OpportunityRow={id:string;installation_id:string;identity_key:string;title:string;organization:string|null;source_url:string;kind:SavedEvent["kind"];due_at:string|null;timezone:string;confidence:SavedEvent["confidence"];accepted_result:OpportunityResult|null;monitoring_enabled:boolean;monitoring_frequency:"daily"|"weekly";last_checked_at:Date|null;next_check_at:Date|null;last_check_status:string|null;latest_content_hash:string|null;latest_snapshot_id:string|null;accepted_snapshot_id:string|null;lease_until:Date|null;attempt_count:number;last_error_code:string|null};
export type StoredOpportunity=SavedEvent & {acceptedResult:OpportunityResult|null;pendingChange:boolean;monitoringEnabled:boolean;monitoringFrequency:"daily"|"weekly";lastCheckedAt:string|null;nextCheckAt:string|null;lastCheckStatus:string|null};
export const iso=(v:Date|string|null)=>v?new Date(v).toISOString():null;
export async function getOpportunity(db:Db,installationId:string,id:string) {
 const row=(await db.query<OpportunityRow>('SELECT * FROM opportunities WHERE installation_id=$1 AND id=$2',[installationId,id])).rows[0];
 if(row?.accepted_result)row.accepted_result=OpportunityResult.parse(row.accepted_result);
 return row??null;
}
export async function readOpportunity(db:Db,installationId:string,id:string):Promise<StoredOpportunity|null> {
 const row=await getOpportunity(db,installationId,id);if(!row)return null;
 const reminders=(await db.query<{at:Date;label:string;sent_at:Date|null}>('SELECT r.* FROM reminders r JOIN opportunities o ON o.id=r.opportunity_id WHERE o.installation_id=$1 AND o.id=$2 ORDER BY r.at',[installationId,id])).rows;
 const pending=(await db.query("SELECT c.id FROM detected_changes c JOIN opportunities o ON o.id=c.opportunity_id WHERE o.installation_id=$1 AND o.id=$2 AND c.status='pending_review' LIMIT 1",[installationId,id])).rows.length>0;
 return {pendingChange:pending,...SavedEvent.parse({id:row.id,title:row.title,organization:row.organization,sourceUrl:row.source_url,dueAt:row.due_at,kind:row.kind,timezone:row.timezone,confidence:row.confidence,reminders:reminders.map(r=>({at:iso(r.at),label:r.label,sent:!!r.sent_at}))}),acceptedResult:row.accepted_result,monitoringEnabled:row.monitoring_enabled,monitoringFrequency:row.monitoring_frequency,lastCheckedAt:iso(row.last_checked_at),nextCheckAt:iso(row.next_check_at),lastCheckStatus:row.last_check_status};
}
export async function listOpportunities(db:Db,installationId:string) {
 const ids=(await db.query<{id:string}>('SELECT id FROM opportunities WHERE installation_id=$1 ORDER BY created_at DESC',[installationId])).rows;
 return Promise.all(ids.map(r=>readOpportunity(db,installationId,r.id)));
}
export async function replaceReminders(db:Db,installationId:string,id:string,reminders:SavedEvent["reminders"]) {
 // Sent reminders remain as durable tombstones. Active leases cannot be removed mid-send.
 await db.query('DELETE FROM reminders r USING opportunities o WHERE r.opportunity_id=o.id AND o.installation_id=$1 AND o.id=$2 AND r.sent_at IS NULL AND (r.lease_until IS NULL OR r.lease_until<now()) AND NOT(r.at=ANY($3::timestamptz[]))',[installationId,id,reminders.map(r=>r.at)]);
 for(const r of reminders)await db.query(`INSERT INTO reminders(opportunity_id,at,label,sent_at) SELECT id,$3,$4,CASE WHEN $5 THEN now() ELSE NULL END FROM opportunities WHERE installation_id=$1 AND id=$2 ON CONFLICT(opportunity_id,at) DO UPDATE SET label=EXCLUDED.label,sent_at=COALESCE(reminders.sent_at,EXCLUDED.sent_at),updated_at=now()`,[installationId,id,r.at,r.label,r.sent]);
}
export async function saveOpportunity(db:Db,installationId:string,input:SavedEvent,result:OpportunityResult|null,importOnly=false) {
 const event=SavedEvent.parse(input);const accepted=result===null?null:OpportunityResult.parse(result);
 return db.tx(async tx=>{
 const key=opportunityIdentity(event);
 const row=(await tx.query<{id:string}>(`INSERT INTO opportunities(installation_id,identity_key,title,organization,source_url,kind,due_at,timezone,confidence,accepted_result) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(installation_id,identity_key) ${importOnly?'DO NOTHING':`DO UPDATE SET title=EXCLUDED.title,organization=EXCLUDED.organization,source_url=EXCLUDED.source_url,updated_at=now()`} RETURNING id`,[installationId,key,event.title,event.organization,event.sourceUrl,event.kind,event.dueAt,event.timezone,event.confidence,accepted===null?null:JSON.stringify(accepted)])).rows[0];
 if(!row)return null;
 const current=await readOpportunity(tx,installationId,row.id);
 // Subsequent saves may customize reminders, but never silently replace an accepted date/result.
 if(current?.dueAt!==event.dueAt)throw new Error('Review the changed deadline before replacing reminders');
 await replaceReminders(tx,installationId,row.id,mergeReminders(event.reminders,current?.reminders));
 await tx.query('UPDATE opportunities SET timezone=$3,updated_at=now() WHERE installation_id=$1 AND id=$2',[installationId,row.id,event.timezone]);
 return readOpportunity(tx,installationId,row.id);
 });
}
export async function importLegacy(db:Db,installationId:string,raw:unknown[],timezone:string) {
 let imported=0,skippedDuplicates=0;const invalid:{index:number;reason:string}[]=[];
 for(let index=0;index<raw.length;index++) {
   const migrated=migrateSavedEvents([raw[index]],timezone);
   if(!migrated.length){invalid.push({index,reason:'Invalid legacy opportunity'});continue;}
   if(await saveOpportunity(db,installationId,migrated[0],null,true))imported++;else skippedDuplicates++;
 }
 return {imported,skippedDuplicates,invalid};
}
export async function saveSubscription(db:Db,installationId:string,sub:{endpoint:string;keys:{p256dh:string;auth:string}}) {
 const result=await db.query<{id:string}>(`INSERT INTO push_subscriptions(installation_id,endpoint,p256dh,auth) VALUES($1,$2,$3,$4) ON CONFLICT(endpoint) DO UPDATE SET p256dh=EXCLUDED.p256dh,auth=EXCLUDED.auth,active=true,updated_at=now() WHERE push_subscriptions.installation_id=$1 RETURNING id`,[installationId,sub.endpoint,sub.keys.p256dh,sub.keys.auth]);
 if(!result.rows.length)throw new Error('Subscription belongs to another installation');
 return result.rows[0];
}
