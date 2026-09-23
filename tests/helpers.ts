import { PGlite } from '@electric-sql/pglite';
import { readFile,readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { pgliteAdapter } from '../lib/db/pglite';
import { mockResults } from '../lib/mock-data';
import type { SavedEvent } from '../lib/schema';
export async function database(){const pg=new PGlite();for(const file of (await readdir('migrations')).filter(n=>n.endsWith('.sql')).sort())await pg.transaction(async tx=>{await tx.exec(await readFile('migrations/'+file,'utf8'));});return {pg,db:pgliteAdapter(pg)};}
export async function installation(db:ReturnType<typeof pgliteAdapter>){const id=randomUUID();await db.query('INSERT INTO installations(id) VALUES($1)',[id]);return id;}
export const result=structuredClone(mockResults.dated);
export const event=(overrides:Partial<SavedEvent>={}):SavedEvent=>({id:randomUUID(),title:result.title,organization:result.organization,sourceUrl:result.sources[0].url,kind:'deadline',dueAt:result.importantDates[0].value,confidence:'high',timezone:'Asia/Seoul',reminders:[{at:'2020-01-01T00:00:00Z',label:'Reminder',sent:false}],...overrides});
export const sub=(n=1)=>({endpoint:'https://fcm.googleapis.com/device-'+n,keys:{p256dh:'test-public-key-value-long',auth:'test-auth-value-long'}});
