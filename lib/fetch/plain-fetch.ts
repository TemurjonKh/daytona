import { load } from "cheerio";
import { validateUrl } from "@/lib/security/validate-url";
import type { Source } from "@/lib/agent/types";
export async function plainFetch(input: string): Promise<Source> {
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10000);
  try {
    let url=input;
    for(let redirect=0;redirect<6;redirect++) {
      url=await validateUrl(url);
      const response=await fetch(url,{signal:controller.signal,redirect:"manual",headers:{"User-Agent":"DeadlineOpportunityAgent/1.0","Accept":"text/html,text/plain"},cache:"no-store"});
      if(response.status>=300&&response.status<400&&response.headers.get('location')) {await response.body?.cancel();url=new URL(response.headers.get('location')!,url).href;continue;}
      if(!response.ok) {await response.body?.cancel();throw new Error("Page fetch failed");}
      const contentType=response.headers.get('content-type')??'';
      if(!/text\/(html|plain)|application\/xhtml/i.test(contentType)) {await response.body?.cancel();throw new Error("Page fetch failed");}
      const reader=response.body?.getReader();if(!reader)throw new Error("Page fetch failed");
      const decoder=new TextDecoder();let html='';let bytes=0;
      while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>2_000_000){await reader.cancel();break;}html+=decoder.decode(value,{stream:true});}html+=decoder.decode();
      if(contentType.includes('text/plain'))return {title:new URL(url).hostname,url,canonicalUrl:null,text:html.replace(/\s+/g,' ').trim().slice(0,15000),links:[],method:'plain fetch'};
      const $=load(html);const title=$('title').first().text().trim();const canonical=$('link[rel="canonical"]').attr('href');
      $('script,style,noscript,svg,template,nav,footer,header,[hidden],[aria-hidden="true"]').remove();
      const text=($('main').length?$('main').text():$('body').text()).replace(/\s+/g,' ').trim().slice(0,15000);
      return {title:title||new URL(url).hostname,url,canonicalUrl:canonical?new URL(canonical,url).href:null,text,links:[],method:'plain fetch'};
    }
    throw new Error("Page fetch failed");
  } catch {throw new Error("Page fetch failed");} finally {clearTimeout(timer);}
}
