import { beforeEach,it,expect,vi } from 'vitest';
import { createHash } from 'node:crypto';
import type { OpportunityResult } from '../lib/schema';
const api=vi.hoisted(()=>({parse:vi.fn()}));
vi.mock('openai',()=>({default:class{chat={completions:{parse:api.parse}}}}));
import { investigateImage,normalizeImageResult } from '../lib/openai/extract-image';
import { extractText } from '../lib/openai/extract-text';
import { ExtractionDraft,extractionSchema } from '../lib/openai/extraction-draft';
import { groundResult } from '../lib/agent/grounding';
import fixture from './fixtures/hyundai-request-example.json';
beforeEach(()=>{vi.clearAllMocks();process.env.OPENAI_API_KEY='offline-only';process.env.OPENAI_MODEL='offline-only';});
it('request-provided Hyundai example normalizes with inline-two-digit diagnostics (not a recorded response)',()=>{
 const result=normalizeImageResult(ExtractionDraft.parse(fixture.draft),fixture.expected.sources[0].url);
 expect(result.result).toEqual(fixture.expected);expect(result.decisions.map(d=>d.yearSource)).toEqual(['inline_two_digit','inline_two_digit']);
 expect(fixture.recordedModelResponse).toBeNull();
});
it('mocked image extraction sends original bytes at high detail and emits only the public contract',async()=>{
 const bytes=Buffer.from('original image bytes are not resized by this pipeline');
 const id='urn:poster:sha256:'+createHash('sha256').update(bytes).digest('hex');
 const raw=structuredClone(fixture.draft);raw.importantDates.forEach(d=>{d.sourceUrl=id;});raw.sources[0].url=id;
 api.parse.mockResolvedValue({choices:[{message:{parsed:raw}}]});
 const events:{event:string;data:unknown}[]=[];await investigateImage(bytes,'image/png',(event,data)=>events.push({event,data}));
 expect(api.parse).toHaveBeenCalledTimes(1);const request=api.parse.mock.calls[0][0];
 expect(request.messages[1].content[1]).toEqual({type:'image_url',image_url:{url:'data:image/png;base64,'+bytes.toString('base64'),detail:'high'}});
 expect(request.messages[0].content).toContain('yearContextText');expect(request.messages[0].content).toContain('neighboring posters');
 const result=events.find(e=>e.event==='result')!.data as OpportunityResult;
 expect(result.importantDates.map(d=>d.value)).toEqual(['2026-09-01','2026-09-27']);
 expect(result.importantDates[0]).not.toHaveProperty('yearContextText');expect(result.importantDates[0].sourceText).toBe(fixture.sourceEvidence.sourceText);
 expect(events.at(-1)).toEqual({event:'done',data:{ok:true}});
});
it('mocked URL extraction retains context through grounding and bounds the model slice',async()=>{
 const url='https://example.com/opportunity';const raw=structuredClone(fixture.draft);raw.importantDates.forEach(d=>{d.sourceUrl=url;d.sourceText='Application period 9.1 ~ 9.27';});raw.sources[0].url=url;
 const source={url,title:'Opportunity',canonicalUrl:null,text:fixture.sourceEvidence.yearContextText+' '+raw.importantDates[0].sourceText+' '.repeat(16000),links:[],method:'plain fetch' as const};
 api.parse.mockResolvedValue({choices:[{message:{parsed:raw}}]});const extracted=await extractText(source);
 expect(extracted.importantDates[0].yearContextText).toBe(fixture.sourceEvidence.yearContextText);
 const payload=JSON.parse(api.parse.mock.calls[0][0].messages[1].content);expect(payload.sourceText).toHaveLength(15000);
 const result=groundResult(extracted,source);expect(result.result.importantDates).toHaveLength(2);expect(result.contextual).toBe(true);expect(result.result.importantDates[0]).not.toHaveProperty('visibleYears');
});
it('both structured-output transport schemas require nullable context and validated year arrays',()=>{
 for(const simplified of [false,true]){const parsed=extractionSchema(simplified).parse(fixture.draft);expect(parsed.importantDates[0].visibleYears).toEqual([2026]);expect(parsed.importantDates[0].yearContextText).toBe(fixture.sourceEvidence.yearContextText);}
 const missing=structuredClone(fixture.draft) as unknown as {importantDates:Record<string,unknown>[]};delete missing.importantDates[0].yearContextText;expect(ExtractionDraft.safeParse(missing).success).toBe(false);
});
