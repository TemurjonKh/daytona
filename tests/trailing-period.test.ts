import { describe, it, expect } from 'vitest';
import { extractDateTokens, discoverDateEvidence } from '../lib/dates/evidence';

const positive = [
 ['2026.8.28.(금)', ['2026.8.28.(금)']],
 ['26.09.27.(일)', ['26.09.27.(일)']],
 ['9.14.(월)', ['9.14.(월)']],
 ['9.14. 10시', ['9.14.']],
 ['26.09.01.(화) ~ 26.09.27.(일)', ['26.09.01.(화)', '26.09.27.(일)']],
 ['Deadline is 2026.9.14. Apply now.', ['2026.9.14.']],
 ['2026.8.28(금)', ['2026.8.28(금)']],
 ['26.09.27(일)', ['26.09.27(일)']],
 ['9.14(월)', ['9.14(월)']],
] as const;

describe('single trailing-period numeric date punctuation', () => {
 it.each(positive)('preserves the add() token contract for %s', (input, expected) => {
  const tokens=extractDateTokens(input);
  expect(tokens.map(t=>t.text)).toEqual(expected);
  expect(tokens.map(t=>t.readings.length)).toEqual(expected.map(()=>1));
  for(const token of tokens)expect(input.slice(token.start,token.end)).toBe(token.text);
 });
 it.each([
  ['1.2.3.4', []], ['192.168.0.1', []], ['09.27.2026.5', []],
  ['version 1.2.3', ['1.2.3']], ['v2.6.1', ['2.6.1']],
  ['1.2.3.', ['1.2.3.']], ['2026.13.40.', ['2026.13.40.']],
 ] as const)('never accepts or partially recovers %s', (input, expected) => {
  const tokens=extractDateTokens(input);
  expect(tokens.map(t=>t.text)).toEqual(expected);
  expect(tokens.filter(t=>t.readings.length>0)).toEqual([]);
  expect(tokens.map(t=>t.readings.length)).toEqual(expected.map(()=>0));
 });
 it.each(['~','-'])('discovers the complete application range with %s', separator => {
  for(const punctuation of ['.', '']) {
   const originalText=`모집일정 | 2026.8.28${punctuation}(금) ${separator} 9.14${punctuation}(월) 10시`;
   const entries=discoverDateEvidence([{id:'line-1',originalText,posterRegionId:'poster-1',supportingViewIds:['context'],corroborated:false}]);
   expect(entries).toHaveLength(1);expect(entries[0].originalText).toBe(originalText);
   expect(entries[0].reasons).toEqual([]);
   expect(entries[0].candidates.map(c=>({kind:c.kind,value:c.value,yearSource:c.yearSource,reasons:c.reasons,precision:c.precision,timezone:c.timezone}))).toEqual([
    {kind:'application_open',value:'2026-08-28',yearSource:'inline_four_digit',reasons:[],precision:'date_only',timezone:null},
    {kind:'deadline',value:'2026-09-14',yearSource:'range_inherited_year',reasons:[],precision:'date_only',timezone:null},
   ]);
  }
 });
 it('consumes harmless sentence punctuation without changing the reading or original evidence',()=>{
  const originalText='Deadline is 2026.9.14. Apply now.';
  expect(extractDateTokens(originalText)[0].readings).toEqual(extractDateTokens('Deadline is 2026.9.14 Apply now.')[0].readings);
  const [entry]=discoverDateEvidence([{id:'line-1',originalText,posterRegionId:'p',supportingViewIds:['context'],corroborated:false}]);
  expect(entry.originalText).toBe(originalText);expect(entry.candidates[0].value).toBe('2026-09-14');
 });
});
