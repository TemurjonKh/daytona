import webpush from "web-push";
import { pushStore, vapidKeys } from "./subscriptions";
export function startScheduler() {
  const store = pushStore();
  if (store.timer) return;
  store.timer = setInterval(() => {void deliverDue();}, 30_000);
  store.timer.unref?.();
}
async function deliverDue() {
  const store = pushStore();
  for (const record of store.events.values()) {
    if (record.state !== "pending" || !record.endpoint || Date.parse(record.event.reminderAt) > Date.now()) continue;
    const subscription = store.subscriptions.get(record.endpoint);
    if (!subscription) continue;
    record.state = "sending"; // Claim before awaiting: overlapping ticks cannot duplicate delivery.
    try {
      const keys = vapidKeys();
      await webpush.sendNotification(subscription, JSON.stringify({id: record.event.id, title: "Opportunity reminder", body: `${record.event.title} — deadline reminder`}), {TTL: 120, timeout: 15_000, vapidDetails: {subject: "mailto:demo@deadline.local", ...keys}});
      record.state = "sent";
      console.info("Reminder accepted by push service:", record.event.id);
    } catch (error) {
      const status = (error as {statusCode?: number}).statusCode;
      if (status === 404 || status === 410) store.subscriptions.delete(record.endpoint);
      // No automatic retry after ambiguous network errors: avoid duplicate notifications.
      record.state = "failed";
      console.error("Reminder delivery failed:", record.event.id, status ?? "network/configuration");
    }
  }
}
