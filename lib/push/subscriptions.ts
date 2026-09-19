import webpush from "web-push";
import type { SavedEvent } from "@/lib/schema";
export type PendingEvent = {event: SavedEvent; endpoint?: string; delivery: Map<string, "sending" | "sent" | "failed">};
type Store = {subscriptions: Map<string, webpush.PushSubscription>; events: Map<string, PendingEvent>; timer?: ReturnType<typeof setInterval>};
const root = globalThis as typeof globalThis & {deadlinePush?: Store};
export function pushStore(): Store {
  return root.deadlinePush ??= {subscriptions: new Map(), events: new Map()};
}
export function vapidKeys() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) throw new Error("VAPID keys are not configured");
  return {publicKey, privateKey};
}
export function allowedEndpoint(endpoint: string) {
  try {const u = new URL(endpoint); return u.protocol === "https:" && !u.username && !u.password && !u.port && ["fcm.googleapis.com", "updates.push.services.mozilla.com", "notify.windows.com", "push.apple.com"].some(host => u.hostname === host || u.hostname.endsWith("."+host));} catch {return false;}
}
