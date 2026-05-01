/** Drizzle 客户端按 D1Database 实例缓存。同一个 worker 请求里的多次 db 调用复用一份
 *  wrapper —— `drizzle(d1)` 本身轻量但每次构造仍要建 builder，省掉就是省掉。
 *  WeakMap 让 D1 binding 释放时缓存自动 GC，跨请求不会泄漏。 */
import { type DrizzleD1Database, drizzle } from "drizzle-orm/d1";

const cache = new WeakMap<D1Database, DrizzleD1Database>();

export function getDb(d1: D1Database): DrizzleD1Database {
  let db = cache.get(d1);
  if (!db) {
    db = drizzle(d1);
    cache.set(d1, db);
  }
  return db;
}
