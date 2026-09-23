import { Pool } from "pg";
export type Db = {
 query<R = Record<string, unknown>>(sql:string,params?:unknown[]):Promise<{rows:R[]}>;
 tx<T>(fn:(db:Db)=>Promise<T>):Promise<T>;
};
export function pgAdapter(pool:Pool):Db {
 const query:Db["query"]=async(sql,params)=>({rows:(await pool.query(sql,params)).rows});
 return {query,async tx(fn){const client=await pool.connect();try{await client.query("BEGIN");
   const db:Db={query:async(sql,params)=>({rows:(await client.query(sql,params)).rows}),tx:async nested=>nested(db)};
   const result=await fn(db);await client.query("COMMIT");return result;
 }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}}};
}
let production:Db|undefined;
export function getDb():Db {
 if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL is required; no memory fallback is available");
 if(!production){const pool=new Pool({connectionString:process.env.DATABASE_URL,max:5,connectionTimeoutMillis:10000});pool.on('error',()=>console.error('database_pool_error'));production=pgAdapter(pool);}
 return production;
}
