function safeUrl(value) {try {const url=new URL(typeof value==='string'?value:'/',self.location.origin);return url.origin===self.location.origin?url.href:self.location.origin+'/';}catch{return self.location.origin+'/';}}
async function reportPushStage(stage) {
  console.info(stage);
  try {
    const windows = await self.clients.matchAll({type: "window", includeUncontrolled: true});
    for (const client of windows) client.postMessage({type: "deadline-push-diagnostic", stage});
  } catch { /* Diagnostics must never prevent notification display. */ }
}
self.addEventListener("push", event => {
  let payload = {};
  try {
    const parsed = event.data?.json();
    if (parsed && typeof parsed === "object") payload = parsed;
  } catch { /* Always display a fallback for malformed payloads. */ }
  event.waitUntil((async () => {
    await reportPushStage("SW_PUSH_RECEIVED");
    await reportPushStage("SW_SHOW_NOTIFICATION");
    await self.registration.showNotification(typeof payload.title === "string" ? payload.title.slice(0,120) : "Opportunity reminder", {
      body: typeof payload.body === "string" && payload.body ? payload.body : "You have an upcoming opportunity reminder.",
      tag: typeof payload.id === "string" ? payload.id : "opportunity-reminder",
      data: {url: safeUrl(payload.url)},
    });
    await reportPushStage("SW_SHOW_NOTIFICATION_RESOLVED");
  })());
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({type:"window",includeUncontrolled:true});
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    const url=safeUrl(event.notification.data?.url);
    if (existing) {await existing.navigate(url);return existing.focus();}
    return self.clients.openWindow(url);
  })());
});
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
