import { createHash,timingSafeEqual } from "node:crypto";
export function validTickToken(request:Request) {
 const secret=process.env.CRON_SECRET;if(!secret)return false;
 const hash=(s:string)=>createHash('sha256').update(s).digest();
 return timingSafeEqual(hash(request.headers.get('authorization')??''),hash(`Bearer ${secret}`));
}
