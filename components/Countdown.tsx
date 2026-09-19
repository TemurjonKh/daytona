"use client";
import { useEffect, useState } from "react";
export function countdownLabel(dueAt: string, now: number) {
  if(/^\d{4}-\d{2}-\d{2}$/.test(dueAt)) {
    const [year,month,day]=dueAt.split("-").map(Number);const today=new Date(now);
    const days=Math.round((Date.UTC(year,month-1,day)-Date.UTC(today.getFullYear(),today.getMonth(),today.getDate()))/86400000);
    return days<0?"Date passed":days===0?"Today":`${days} days left`;
  }
  const remaining = new Date(dueAt).getTime() - now;
  if (!Number.isFinite(remaining)) return "Date unavailable";
  if (remaining <= 0) return "Date passed";
  const minutes = Math.floor(remaining / 60000);
  if (minutes < 1) return "Less than 1m left";
  if (minutes < 60) return `${minutes}m left`;
  const hours = Math.floor(minutes / 60);
  return hours >= 24 ? `${Math.floor(hours/24)}d ${hours%24}h left` : `${hours}h ${minutes%60}m left`;
}
export default function Countdown({dueAt}: {dueAt: string}) {
  const [now,setNow] = useState<number | null>(null);
  useEffect(() => {const tick=() => setNow(Date.now()); tick(); const timer=setInterval(tick,30000); return () => clearInterval(timer);},[]);
  return <span>{now === null ? "Calculating…" : countdownLabel(dueAt,now)}</span>;
}
