import type { PGlite, Transaction } from "@electric-sql/pglite";
import type { Db } from "./client";
export function pgliteAdapter(engine:PGlite):Db {
 const wrap=(connection:PGlite|Transaction):Db=>({
   query:async <R>(sql:string,params?:unknown[])=>({rows:(await connection.query<R>(sql,params)).rows}),
   tx:async fn=>engine.transaction(transaction=>fn(wrap(transaction))),
 });
 return wrap(engine);
}
