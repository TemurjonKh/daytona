export function vapidKeys() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) throw new Error("VAPID keys are not configured");
  if (!process.env.VAPID_SUBJECT) throw new Error("VAPID_SUBJECT is required");
  return {publicKey, privateKey, subject:process.env.VAPID_SUBJECT};
}
export function allowedEndpoint(endpoint: string) {
  try {const u = new URL(endpoint); return u.protocol === "https:" && !u.username && !u.password && !u.port && ["fcm.googleapis.com", "updates.push.services.mozilla.com", "notify.windows.com", "push.apple.com"].some(host => u.hostname === host || u.hostname.endsWith("."+host));} catch {return false;}
}
