// Runs a SQL file on the Supabase project through the Management API.
// usage: SUPABASE_ACCESS_TOKEN=... node tools/apply-sql.mjs <project-ref> supabase/ranking.sql
// (the project ref is the subdomain of the project URL: https://<ref>.supabase.co)
import { readFileSync } from 'node:fs';

const [ref, file] = process.argv.slice(2);
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!ref || !file || !token) {
  console.error('usage: SUPABASE_ACCESS_TOKEN=... node tools/apply-sql.mjs <project-ref> <file.sql>');
  process.exit(1);
}
const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: readFileSync(file, 'utf8') }),
});
console.log(r.status, (await r.text()).slice(0, 2000));
process.exit(r.ok ? 0 : 1);
