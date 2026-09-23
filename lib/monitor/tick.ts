import type { Db } from "@/lib/db/client";
import { checkOpportunity } from "./check";
import { sendNotificationRef } from "@/lib/push/deliveries";
export async function monitorTick(db:Db,deadline:number){
 const counts={checksClaimed:0,unchanged:0,changed:0,failed:0};
 // 190s original check estimate + 60s deletion + 20s fetch/dispatch margin. Concurrency is one.
 if(deadline-Date.now()>=270000){
 const due=(await db.query<{id:string;installation_id:string}>(`SELECT id,installation_id FROM opportunities WHERE monitoring_enabled AND next_check_at<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY next_check_at LIMIT 1`)).rows[0];
 if(due){try{const result=await checkOpportunity(due.installation_id,due.id,{db,deadline});counts.checksClaimed++;if(result.status==='failed')counts.failed++;else if(result.status==='unchanged')counts.unchanged++;else if(result.changes)counts.changed++;}catch{/* Another tick may win the lease. */}}
 }
 // Also repairs the gap if a process dies after persisting a change but before inserting deliveries.
 const pending=(await db.query<{id:string;opportunity_id:string;installation_id:string}>(`SELECT c.id,c.opportunity_id,o.installation_id FROM detected_changes c JOIN opportunities o ON o.id=c.opportunity_id WHERE c.change_type<>'baseline_review' AND c.status='pending_review' ORDER BY c.created_at LIMIT 50`)).rows;
 for(const c of pending){if(Date.now()+16000>deadline)break;await sendNotificationRef(db,c.installation_id,c.opportunity_id,'change',c.id,{title:'Opportunity changed: review update',url:'/?opportunity='+c.opportunity_id+'&review='+c.id},deadline);}
 return counts;
}
