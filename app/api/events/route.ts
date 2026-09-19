import { z } from "zod";
import { SavedEvent } from "@/lib/schema";
import { pushStore } from "@/lib/push/subscriptions";
import { startScheduler } from "@/lib/push/scheduler";
export const runtime = "nodejs";
const Input = z.object({event: SavedEvent.extend({reminderAt:z.iso.datetime({offset:true})}), subscriptionEndpoint:z.url().optional()});
export async function POST(request: Request) {
  startScheduler();
  if (request.headers.get("origin") && new URL(request.headers.get("origin")!).host !== request.headers.get("host")) return new Response(null,{status:403});
  try {
    const parsed=Input.safeParse(await request.json());
    if (!parsed.success) return Response.json({error:"Invalid saved event"},{status:400});
    const {event,subscriptionEndpoint}=parsed.data;
    const store=pushStore();
    if (subscriptionEndpoint && !store.subscriptions.has(subscriptionEndpoint)) return Response.json({error:"Subscribe before scheduling"},{status:400});
    const existing=store.events.get(event.id);
    if (existing) {
      if (JSON.stringify(existing.event)!==JSON.stringify(event)) return Response.json({error:"Event ID already exists"},{status:409});
      if (existing.state === "pending" && subscriptionEndpoint) existing.endpoint=subscriptionEndpoint;
    } else store.events.set(event.id,{event,endpoint:subscriptionEndpoint,state:"pending"});
    return Response.json({ok:true,scheduled:!!subscriptionEndpoint});
  } catch {return Response.json({error:"Invalid request"},{status:400});}
}
