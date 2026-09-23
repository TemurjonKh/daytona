import type { OpportunityResult } from '@/lib/schema';
import { posterReviewCopy } from './classification';
export function posterDatePresentation(result:OpportunityResult) {
 if(result.summary.includes(posterReviewCopy.unreadable))return {title:'Image needs a clearer reading',body:posterReviewCopy.unreadable};
 if(result.importantDates.some(d=>d.kind==='other'||!d.value&&d.kind!=='rolling'))return {title:'Date detected — review its meaning',body:posterReviewCopy.uncertain};
 if(result.importantDates.some(d=>d.kind==='event_start'||d.kind==='event_end'))return {title:'Event date found',body:posterReviewCopy.event};
 if(result.importantDates.length)return {title:'Important dates found',body:'See the grounded dates below. No application closing date was identified.'};
 return {title:'No visible date detected',body:posterReviewCopy.noDate};
}
