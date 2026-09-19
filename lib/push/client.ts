import type { SavedEvent } from "@/lib/schema";
export async function registerEvent(event: SavedEvent, subscriptionEndpoint?: string) {
  const response = await fetch("/api/events",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event,subscriptionEndpoint})});
  if (!response.ok) throw new Error("Event could not be saved to the server.");
}
export function requestPushPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return Promise.resolve("unsupported");
  return Notification.permission === "default" ? Notification.requestPermission() : Promise.resolve(Notification.permission);
}
export async function enablePush(): Promise<string> {
  if (Notification.permission !== "granted") throw new Error(`Notification permission: ${Notification.permission}`);
  const response=await fetch("/api/subscribe");
  if (!response.ok) throw new Error("Push configuration unavailable.");
  const {publicKey}=await response.json();
  const registration=await navigator.serviceWorker.register("/sw.js",{scope:"/"});
  await navigator.serviceWorker.ready;
  if (!registration.active || !navigator.serviceWorker.controller) throw new Error("Notification worker is not controlling this page. Reload and save again.");
  const raw=atob(publicKey.replace(/-/g,"+").replace(/_/g,"/"));
  const applicationServerKey = Uint8Array.from(raw, char => char.charCodeAt(0));
  let subscription = await registration.pushManager.getSubscription();
  const previousKey = subscription?.options.applicationServerKey;
  if (subscription && (!previousKey || !applicationServerKey.every((value, index) => new Uint8Array(previousKey)[index] === value) || previousKey.byteLength !== applicationServerKey.length)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey});
  const saved=await fetch("/api/subscribe",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(subscription)});
  if (!saved.ok) throw new Error("Push subscription could not be saved.");
  return subscription.endpoint;
}
