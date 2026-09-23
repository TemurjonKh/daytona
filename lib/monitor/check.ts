import { createHash } from "node:crypto";
import { getDb,type Db } from "@/lib/db/client";
import { getOpportunity } from "@/lib/db/repository";
import { fetchSource,extractGrounded } from "@/lib/agent/orchestrator";
import { normalizeEvidence } from "@/lib/agent/grounding";
import { OpportunityResult } from "@/lib/schema";
import { compareResults,type Change } from "./compare";
import { sendNotificationRef } from "@/lib/push/deliveries";
export class CheckError extends Error{constructor(public status:number,message:string){super(message);}}
export const hashText=(text:string)=>createHash('sha256').update(normalizeEvidence(text)).digest('hex');
export const dueClaimSql=`UPDATE opportunities SET lease_until=now()+interval '6 minutes',attempt_count=attempt_count+1,updated_at=now()
 WHERE id IN(SELECT id FROM opportunities WHERE installation_id=$1 AND id=$2 AND monitoring_enabled AND next_check_at<=now()
 AND (lease_until IS NULL OR lease_until<now()) ORDER BY next_check_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id`;
export async function checkOpportunity(installationId:string,opportunityId:string,options:{db?:Db;manual?:boolean;deadline?:number}={}){
 const db=options.db??getDb();const manual=options.manual??false;
 const old=await getOpportunity(db,installationId,opportunityId);if(!old)throw new CheckError(404,'Opportunity not found');
 if(!/^https?:\/\//.test(old.source_url))throw new CheckError(400,'Uploaded posters cannot be monitored.');
 if(manual&&old.last_checked_at&&Date.now()-new Date(old.last_checked_at).getTime()<600000)throw new CheckError(429,'Please wait 10 minutes between checks.');
 const claim=await db.query(manual?`UPDATE opportunities SET lease_until=now()+interval '6 minutes',attempt_count=attempt_count+1,updated_at=now() WHERE installation_id=$1 AND id=$2 AND (lease_until IS NULL OR lease_until<now()) AND (last_checked_at IS NULL OR last_checked_at<=now()-interval '10 minutes') RETURNING id`:dueClaimSql,[installationId,opportunityId]);
 if(!claim.rows.length)throw new CheckError(409,'A check is already running or is not due.');
 try{
 const source=await fetchSource(old.source_url,()=>{},{context:{run:'monitor',opportunity:opportunityId,deadline:options.deadline??Date.now()+295000}});source.text=source.text.slice(0,15000);
 const hash=hashText(source.text);
 if(hash===old.latest_content_hash){await finish(db,installationId,opportunityId,'unchanged',null,null);return {status:'unchanged',changes:0};}
 // Persist precisely what extraction receives, even when extraction subsequently fails.
 const snap=(await db.query<{id:string}>(`INSERT INTO source_snapshots(opportunity_id,fetch_method,text_slice,content_hash) SELECT id,$3,$4,$5 FROM opportunities WHERE installation_id=$1 AND id=$2 RETURNING id`,[installationId,opportunityId,source.method,source.text,hash])).rows[0];
 const next=OpportunityResult.parse(await extractGrounded(source));
 await db.query(`UPDATE source_snapshots s SET extracted_result=$3 FROM opportunities o WHERE s.opportunity_id=o.id AND o.installation_id=$1 AND s.id=$2`,[installationId,snap.id,JSON.stringify(next)]);
 let status='baseline';let changes:Change[]=[];let ignored:string[]=[];
 if(!old.latest_content_hash){if(old.accepted_result)await db.query('UPDATE opportunities SET accepted_snapshot_id=$3 WHERE installation_id=$1 AND id=$2',[installationId,opportunityId,snap.id]);if(!old.accepted_result)changes=[{type:'baseline_review',fingerprint:'baseline',old:null,next,explanation:'Review the first evidence-backed result for this imported opportunity.'}];}
 else if(old.accepted_result){const diff=compareResults(old.accepted_result,next,source.text);changes=diff.changes;ignored=diff.ignored;status=changes.length?'changed':'changed_no_material_change';}
 const inserted:string[]=[];
 await db.tx(async tx=>{
 for(const c of changes){const key=createHash('sha256').update([opportunityId,c.type,c.fingerprint,hash].join('|')).digest('hex');
 const row=(await tx.query<{id:string}>(`INSERT INTO detected_changes(opportunity_id,old_snapshot_id,new_snapshot_id,change_type,old_value,new_value,explanation,status,idempotency_key) SELECT id,$3,$4,$5,$6,$7,$8,'pending_review',$9 FROM opportunities WHERE installation_id=$1 AND id=$2 ON CONFLICT(idempotency_key) DO NOTHING RETURNING id`,[installationId,opportunityId,old.accepted_snapshot_id??old.latest_snapshot_id,snap.id,c.type,JSON.stringify(c.old),JSON.stringify(c.next),c.explanation,key])).rows[0];if(row&&c.type!=='baseline_review')inserted.push(row.id);}
 if(ignored.length)await tx.query(`INSERT INTO check_history(opportunity_id,status,note) SELECT id,'ignored',$3 FROM opportunities WHERE installation_id=$1 AND id=$2`,[installationId,opportunityId,[...new Set(ignored)].join(', ')]);
 await finish(tx,installationId,opportunityId,status,hash,snap.id);
 });
 for(const id of inserted)await sendNotificationRef(db,installationId,opportunityId,'change',id,{title:'Opportunity changed: review update',url:`/?opportunity=${opportunityId}&review=${id}`},options.deadline);
 return {status,changes:inserted.length};
 }catch{
 await db.tx(async tx=>{await tx.query(`INSERT INTO check_history(opportunity_id,status,note) SELECT id,'failed','We could not check this source today.' FROM opportunities WHERE installation_id=$1 AND id=$2`,[installationId,opportunityId]);
 await tx.query(`UPDATE opportunities SET last_checked_at=now(),last_check_status='failed',last_error_code='check_failed',lease_until=NULL,next_check_at=now()+CASE WHEN attempt_count>=3 THEN CASE WHEN monitoring_frequency='weekly' THEN interval '7 days' ELSE interval '1 day' END ELSE interval '1 minute'*power(2,attempt_count-1) END,attempt_count=CASE WHEN attempt_count>=3 THEN 0 ELSE attempt_count END,updated_at=now() WHERE installation_id=$1 AND id=$2`,[installationId,opportunityId]);});return {status:'failed',changes:0};
 }
}
async function finish(db:Db,i:string,id:string,status:string,hash:string|null,snapshot:string|null){await db.query(`UPDATE opportunities SET last_checked_at=now(),last_check_status=$3,last_error_code=NULL,latest_content_hash=COALESCE($4,latest_content_hash),latest_snapshot_id=COALESCE($5::uuid,latest_snapshot_id),attempt_count=0,lease_until=NULL,next_check_at=now()+CASE WHEN monitoring_frequency='weekly' THEN interval '7 days' ELSE interval '1 day' END,updated_at=now() WHERE installation_id=$1 AND id=$2`,[i,id,status,hash,snapshot]);}
