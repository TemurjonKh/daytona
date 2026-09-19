import { getDomain } from "tldts";
const ats=new Set(["greenhouse.io","lever.co","ashbyhq.com","myworkdayjobs.com","wanted.co.kr","saramin.co.kr","jobkorea.co.kr"]);
export function isOfficialDomain(sourceUrl:string,submittedUrl:string):boolean {
  try{const source=getDomain(new URL(sourceUrl).hostname);const submitted=getDomain(new URL(submittedUrl).hostname);return !!source&&(source===submitted||ats.has(source));}catch{return false;}
}
