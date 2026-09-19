import type { Source } from "@/lib/agent/types";
export function usefulSource(source: Source) {
  if(source.text.length<400 || source.text.split(/\s+/).length<55)return false;
  const shell=/enable javascript|javascript (?:is required|must be enabled)|checking your browser|verify (?:that )?you are human|access denied|just a moment/i;
  return !(shell.test(source.title) || (source.text.length<1500&&shell.test(source.text)));
}
