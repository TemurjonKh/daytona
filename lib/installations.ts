import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Db } from "./db/client";
export async function resolveInstallation(db:Db,candidate?:string) {
 if(candidate && z.uuid().safeParse(candidate).success && (await db.query('SELECT id FROM installations WHERE id=$1',[candidate])).rows.length)return {id:candidate,created:false};
 const id=randomUUID();await db.query('INSERT INTO installations(id) VALUES($1)',[id]);return {id,created:true};
}
