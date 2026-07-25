/**
 * Prints the SQL to fix orders RLS. Run that SQL in Supabase SQL Editor.
 * Then: node scripts/apply-rls-fix.mjs with env keys set.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const dir = dirname(fileURLToPath(import.meta.url))
const sql = readFileSync(join(dir, '../supabase/FIX_ORDERS_RLS.sql'), 'utf8')
console.log(sql)
