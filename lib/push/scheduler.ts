import webpush from "web-push";
import { pushStore, vapidKeys } from "./subscriptions";
export function startScheduler() {
  const store = pushStore();
  if (store.timer) return;
  store.timer = setInterval(() => {void deliverDue();}, 30_000);
  store.timer.unref?.();
}
export async function deliverDue() {
  const store = pushStore();
  for (const record of store.events.values()) {
    if (!record.endpoint) continue;
    const subscription=store.subscriptions.get(record.endpoint);
    if(!subscription)continue;
    for(const reminder of record.event.reminders) {
      if(!record.event.reminders.some(current=>current.at===reminder.at && !current.sent) || reminder.sent || record.delivery.has(reminder.at) || Date.parse(reminder.at)>Date.now())continue;
      record.delivery.set(reminder.at,"sending"); // Claim this instant before any await.
      try {
        const keys=vapidKeys();
        console.info("PUSH_SEND_START",record.event.id,new URL(subscription.endpoint).hostname);
        const response=await webpush.sendNotification(subscription,JSON.stringify({id:record.event.id+":"+reminder.at,title:"Opportunity reminder",body:`${record.event.title} — ${reminder.label}`}),{TTL:120,timeout:15000,vapidDetails:{subject:"mailto:demo@deadline.local",...keys}});
        record.delivery.set(reminder.at,"sent");reminder.sent=true;
        const current=record.event.reminders.find(r=>r.at===reminder.at);if(current)current.sent=true;
        console.info("PUSH_SEND_SUCCESS",record.event.id,response.statusCode);
      } catch(error) {
        const status=(error as {statusCode?:number}).statusCode;
        if(status===404 || status===410)store.subscriptions.delete(record.endpoint);
        // Ambiguous failures are not retried, including after resaving the same instant.
        record.delivery.set(reminder.at,"failed");
        const body=String((error as {body?:string}).body??"").replace(/https?:\/\/\S+/g,"[url]").replace(/[A-Za-z0-9_+/=-]{24,}/g,"[redacted]").slice(0,300);
        console.error("PUSH_SEND_ERROR",record.event.id,status??"network/configuration",body);
        if(status===404 || status===410)break;
      }
    }
  }
}
