import { Daytona, type Sandbox } from "@daytona/sdk";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { browserScript } from "./browser-script";
import type { Emit, Source } from "@/lib/agent/types";
const Rendered=z.object({title:z.string(),url:z.url(),canonicalUrl:z.string().nullable(),text:z.string().max(15000),links:z.array(z.string())});
export function daytonaClient() {
  if(!process.env.DAYTONA_API_KEY)throw new Error("Daytona API key is not configured");
  return new Daytona({apiKey:process.env.DAYTONA_API_KEY,apiUrl:process.env.DAYTONA_API_URL||"https://app.daytona.io/api",target:process.env.DAYTONA_TARGET||"us"});
}
export async function renderInDaytona(url:string,emit:Emit):Promise<Source> {
  const client=daytonaClient();
  let snapshot:string|undefined;
  try{const snapshots=await client.snapshot.list({limit:100});snapshot=snapshots.items.find(s=>s.name==='opportunity-worker'&&s.state==='active')?.name;}catch{console.warn('Daytona snapshot lookup failed; using default sandbox');}
  async function attempt(image?:string):Promise<Source> {
    let sandbox:Sandbox|undefined;let original:unknown;let cleanupFailed=false;let operation='create';
    const name='deadline-'+randomUUID();const started=Date.now();
    const params={name,language:'javascript',envVars:{TARGET_URL:url},labels:{project:'deadline',phase:'4'},autoStopInterval:5,autoDeleteInterval:0};
    emit('stage',{stage:'sandbox_creating',status:'started'});
    try {
      try {sandbox=image?await client.create({...params,image},{timeout:90}):await client.create({...params,snapshot},{timeout:60});}
      catch {try{sandbox=await client.get(name);}catch{/* No returned sandbox; crash-safety settings bound lifetime. */}throw new Error('Daytona sandbox creation failed');}
      console.info('sandbox created:',sandbox.id);
      emit('stage',{stage:'sandbox_created',status:'completed',sandboxId:sandbox.id,durationMs:Date.now()-started});
      operation='tooling probe';const probe=await sandbox.process.executeCommand(`node -e "const fs=require('fs');let modulePath=null;for(const p of ['playwright','playwright-core']){try{modulePath=require.resolve(p);break}catch{}}console.log(JSON.stringify({modulePath,chromium:['/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome'].find(p=>fs.existsSync(p))||null}))"`,undefined,undefined,15);
      if(probe.exitCode!==0)throw new Error('Browser tooling unavailable');
      const tooling=JSON.parse(probe.result.trim()) as {modulePath:string|null;chromium:string|null};
      if(!tooling.chromium&&!tooling.modulePath&&!image)throw new Error('Browser tooling unavailable');
      operation='prepare directory';const dir=await sandbox.process.executeCommand('mkdir -p /tmp/deadline-worker',undefined,undefined,10);
      if(dir.exitCode!==0)throw new Error('Browser rendering failed');
      let nodePath:string|undefined;
      if(!tooling.modulePath){
        // Install only the JS driver; Chromium is preinstalled. No browser download.
        operation='install driver';const install=await sandbox.process.executeCommand(image?'npm install --prefix /tmp/deadline-worker --no-audit --no-fund playwright-core@1.49.0':'npm install --prefix /tmp/deadline-worker --no-audit --no-fund playwright-core@1.58.2',undefined,undefined,45);
        if(install.exitCode!==0)throw new Error('Browser tooling unavailable');
      } else {nodePath=tooling.modulePath.split('/node_modules/')[0]+'/node_modules';}
      operation='upload worker';await sandbox.fs.uploadFile(Buffer.from(browserScript),'/tmp/deadline-worker/browser-script.cjs',30);
      emit('stage',{stage:'browser_rendering',status:'started',sandboxId:sandbox.id});const renderStarted=Date.now();
      operation='execute worker';const result=await sandbox.process.executeCommand('node /tmp/deadline-worker/browser-script.cjs',undefined,{TARGET_URL:url,...(tooling.chromium?{CHROMIUM_PATH:tooling.chromium}:{}),...(nodePath?{NODE_PATH:nodePath}:{})},40);
      if(result.exitCode!==0){console.error('Browser worker:',result.result.match(/net::[A-Z_]+|TimeoutError|TypeError|Error/)?.[0]??'command failed');throw new Error('Browser rendering failed');}
      const source=Rendered.parse(JSON.parse(result.result.trim()));
      emit('stage',{stage:'browser_rendered',status:'completed',durationMs:Date.now()-renderStarted,sandboxId:sandbox.id});
      return {...source,method:'Daytona Chromium'};
    } catch(error){console.error('Daytona operation failed:',operation,error instanceof Error?error.name:'unknown');original=error;throw error instanceof Error&&['Daytona sandbox creation failed','Browser rendering failed','Browser tooling unavailable'].includes(error.message)?error:new Error('Browser rendering failed');}
    finally {
      if(sandbox){
        console.info('sandbox cleanup starting',sandbox.id);emit('stage',{stage:'sandbox_cleanup_started',status:'started',sandboxId:sandbox.id});
        try {await client.delete(sandbox,60,true);console.info('sandbox deleted',sandbox.id);emit('stage',{stage:'sandbox_deleted',status:'completed',sandboxId:sandbox.id});}
        catch{cleanupFailed=true;console.error('sandbox cleanup failed:',sandbox.id);emit('stage',{stage:'sandbox_cleanup_started',status:'failed',sandboxId:sandbox.id,message:'Sandbox cleanup failed; check Daytona dashboard.'});}
      }
      if(cleanupFailed&&!original)throw new Error('Sandbox cleanup failed; check Daytona dashboard');
    }
  }
  try{return await attempt();}catch(error){if(error instanceof Error&&error.message==='Browser tooling unavailable')return attempt('mcr.microsoft.com/playwright:v1.49.0-jammy');throw error;}
}
