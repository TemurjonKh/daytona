import type { OpportunityResult } from "@/lib/schema";
export type Source = {title:string;url:string;canonicalUrl:string|null;text:string;links:string[];method:"plain fetch"|"Daytona Chromium"};
export type Stage = {stage:string;status:"started"|"completed"|"failed";durationMs?:number;sandboxId?:string;message?:string};
export type Emit = (event:"stage"|"source"|"result"|"error"|"done",data:Stage|Source|OpportunityResult|{message:string}|{ok:boolean})=>void;
