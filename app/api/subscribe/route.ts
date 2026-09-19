import { z } from "zod";
import { allowedEndpoint, pushStore, vapidKeys } from "@/lib/push/subscriptions";
import { startScheduler } from "@/lib/push/scheduler";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const Subscription = z.object({endpoint: z.url().refine(allowedEndpoint), keys: z.object({p256dh: z.string().min(20).max(256), auth: z.string().min(10).max(128)})});
export async function GET() {
  startScheduler();
  try {return Response.json({publicKey: vapidKeys().publicKey}, {headers:{"Cache-Control":"no-store"}});} catch {return Response.json({error:"VAPID keys are not configured"},{status:503});}
}
export async function POST(request: Request) {
  startScheduler();
  if (request.headers.get("origin") && new URL(request.headers.get("origin")!).host !== request.headers.get("host")) return new Response(null,{status:403});
  try {
    const result = Subscription.safeParse(await request.json());
    if (!result.success) return Response.json({error:"Invalid push subscription"},{status:400});
    pushStore().subscriptions.set(result.data.endpoint,result.data);
    return Response.json({ok:true});
  } catch {return Response.json({error:"Invalid request"},{status:400});}
}
