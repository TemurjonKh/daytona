import { z } from "zod";
import { SavedEvent } from "@/lib/schema";
import { mergeReminders, opportunityIdentity } from "@/lib/saved-events";
import { pushStore } from "@/lib/push/subscriptions";
import { startScheduler } from "@/lib/push/scheduler";
export const runtime = "nodejs";
const Input=z.object({event:SavedEvent,subscriptionEndpoint:z.url().optional()});
export async function POST(request:Request) {
  startScheduler();
  if(request.headers.get("origin") && new URL(request.headers.get("origin")!).host!==request.headers.get("host"))return new Response(null,{status:403});
  try {
    const parsed=Input.safeParse(await request.json());
    if(!parsed.success)return Response.json({error:"Invalid saved event"},{status:400});
    const {event,subscriptionEndpoint}=parsed.data;const store=pushStore();
    if(subscriptionEndpoint && !store.subscriptions.has(subscriptionEndpoint))return Response.json({error:"Subscribe before scheduling"},{status:400});
    const existing=store.events.get(event.id);
    if(existing && opportunityIdentity(existing.event)!==opportunityIdentity(event))return Response.json({error:"Event identity mismatch"},{status:409});
    const reminders=mergeReminders(event.reminders,existing?.event.reminders).map(r=>({...r,sent:r.sent || existing?.delivery.get(r.at)==="sent"}));
    if(existing) {
      // Keep the record object and delivery claims alive across an in-flight upsert.
      existing.event={...event,reminders};
      if(subscriptionEndpoint)existing.endpoint=subscriptionEndpoint;
    } else store.events.set(event.id,{event:{...event,reminders},endpoint:subscriptionEndpoint,delivery:new Map()});
    const record=store.events.get(event.id)!;
    return Response.json({ok:true,scheduled:!!record.endpoint,event:record.event});
  } catch {return Response.json({error:"Invalid request"},{status:400});}
}
