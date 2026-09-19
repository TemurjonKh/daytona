self.addEventListener("push", event => {
  let payload = {};
  try { payload = event.data?.json() ?? {}; } catch { /* Generic notification for malformed payload. */ }
  event.waitUntil(self.registration.showNotification("Opportunity reminder", {
    body: payload.body || "Your opportunity — deadline reminder",
    tag: payload.id || "opportunity-reminder",
    data: {url: self.location.origin + "/"},
  }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({type:"window",includeUncontrolled:true});
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) return existing.focus();
    return self.clients.openWindow(self.location.origin + "/");
  })());
});
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
