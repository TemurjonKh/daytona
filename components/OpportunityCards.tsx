"use client";
import { Fragment } from 'react';
import type { ComponentProps } from 'react';
import type { OpportunityResult as Result } from '@/lib/schema';
import OpportunityResult from './OpportunityResult';

type Props = Omit<ComponentProps<typeof OpportunityResult>, 'result'> & { results: Result[] };
export default function OpportunityCards({results,...cardProps}:Props) {
 return <>{results.map((result,index)=><Fragment key={result.sources[0].url}>
  {results.length>1&&<h3 className="text-sm font-semibold text-slate-500">Poster {index+1} of {results.length}</h3>}
  <OpportunityResult key={result.sources[0].url} {...cardProps} result={result}/>
 </Fragment>)}</>;
}
