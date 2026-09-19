export type Source = {title:string;url:string;canonicalUrl:string|null;text:string;links:string[];method:"plain fetch"|"Daytona Chromium"};
export type Stage = {stage:string;status:"started"|"completed"|"failed";durationMs?:number;sandboxId?:string;message?:string};
export type Emit = (event:"stage"|"source"|"error"|"done",data:Stage|Source|{message:string}|{ok:boolean})=>void;
