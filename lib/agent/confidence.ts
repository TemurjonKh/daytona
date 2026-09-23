import type { OpportunityResult } from "@/lib/schema";
import { isOfficialDomain } from "@/lib/security/official-domain";
export function computeConfidence(result:OpportunityResult,submittedUrl:string,dropped:number,weak:boolean,contextual=false):OpportunityResult['confidence'] {
  if(dropped>0||weak||result.conflicts.length||!result.importantDates.length||result.importantDates.some(d=>d.yearResolution==='inferred_next_occurrence'))return 'low';
  if(contextual)return 'medium';
  if(result.importantDates.every(d=>isOfficialDomain(d.sourceUrl,submittedUrl)&&d.yearResolution==='explicit'&&d.precision!=='unknown'&&d.value!==null))return 'high';
  return 'medium';
}
