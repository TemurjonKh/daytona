// This source is uploaded as a file and executed only inside Daytona.
export const browserScript = String.raw`
const {chromium}=(()=>{try{return require('playwright')}catch{return require('playwright-core')}})();
const dns=require('node:dns').promises;
const net=require('node:net');
function unsafe(ip){if(ip.includes(':'))return !/^[23][0-9a-f]{0,3}:/i.test(ip);const p=ip.split('.').map(Number);return p.length!==4||p[0]===0||p[0]===10||p[0]===127||p[0]>=224||(p[0]===169&&p[1]===254)||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===192&&p[1]===168)||(p[0]===100&&p[1]>=64&&p[1]<=127)||(p[0]===198&&(p[1]===18||p[1]===19));}
async function allowed(value){try{const u=new URL(value);const h=u.hostname.replace(/^\[|\]$/g,'');if(!['http:','https:'].includes(u.protocol)||u.username||u.password||h==='localhost'||h.endsWith('.local')||h.endsWith('.localhost'))return false;const ips=net.isIP(h)?[{address:h}]:await dns.lookup(h,{all:true});return ips.length>0&&ips.every(x=>!unsafe(x.address));}catch{return false;}}
(async()=>{
 let browser;
 try{
  const target=process.env.TARGET_URL;if(!target||!await allowed(target))throw Error('Invalid URL');
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
  const context=await browser.newContext({serviceWorkers:'block'});
  await context.route('**/*',async route=>{
   if(['image','font','media'].includes(route.request().resourceType()))return route.abort();
   return await allowed(route.request().url())?route.continue():route.abort();
  });
  const page=await context.newPage();
  await page.goto(target,{waitUntil:'domcontentloaded',timeout:20000});
  await page.waitForTimeout(1500);
  const output=await page.evaluate(()=>({title:document.title,url:location.href,canonicalUrl:document.querySelector('link[rel="canonical"]')?.href??null,text:(document.body?.innerText??'').replace(/\s+/g,' ').trim().slice(0,15000),links:Array.from(document.querySelectorAll('a[href]')).map(a=>a.href).filter(h=>/^https?:/.test(h)).slice(0,30)}));
  console.log(JSON.stringify(output));
 }catch(error){console.error('Browser rendering failed:', String(error.message).match(/net::[A-Z_]+/)?.[0] || error.name);process.exitCode=1;}
 finally{if(browser)await browser.close();}
})();
`;
