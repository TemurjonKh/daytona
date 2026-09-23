import { loadEnvConfig } from '@next/env';
import { Daytona } from '@daytona/sdk';
import { pathToFileURL } from 'node:url';
export function isOrphan(sandbox,now=Date.now()){return sandbox.labels?.project==='deadline'&&!!sandbox.createdAt&&Date.parse(sandbox.createdAt)<now-15*60000;}
export async function main(){loadEnvConfig(process.cwd());if(!process.env.DAYTONA_API_KEY)throw new Error('DAYTONA_API_KEY is required');const client=new Daytona({apiKey:process.env.DAYTONA_API_KEY,apiUrl:process.env.DAYTONA_API_URL||undefined,target:process.env.DAYTONA_TARGET||'us'});for await(const sandbox of client.list({labels:{project:'deadline'}})){if(!isOrphan(sandbox))continue;console.info(JSON.stringify({sandboxId:sandbox.id,createdAt:sandbox.createdAt,action:process.argv.includes('--delete')?'delete':'list'}));if(process.argv.includes('--delete'))await client.delete(sandbox,60,true);}}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('orphan_operation_failed');process.exitCode=1;});
