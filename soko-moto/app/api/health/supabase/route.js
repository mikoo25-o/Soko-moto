import { NextResponse } from 'next/server';
import { getSupabaseEnv } from '../../../../lib/supabase-env';

export const dynamic = 'force-dynamic';

// Visit /api/health/supabase after deploying to see exactly what is (not) connected. Never returns key values.
export async function GET() {
  const env = getSupabaseEnv();
  const report = { envOk: env.ok, problems: env.problems, urlHost: env.url ? new URL(env.url).host : null, auth: null, tables: {}, storage: null, hint: '' };
  if (!env.ok) { report.hint = 'Set the environment variables (in .env.local locally, or in your host dashboard), then redeploy/restart. NEXT_PUBLIC_ values are baked in at build time.'; return NextResponse.json(report, { status: 503 }); }
  const headers = { apikey: env.key, Authorization: `Bearer ${env.key}` };
  try {
    const a = await fetch(`${env.url}/auth/v1/settings`, { headers, cache: 'no-store' });
    report.auth = a.ok ? 'reachable' : `HTTP ${a.status} (key or URL is wrong)`;
    for (const t of ['products', 'donations', 'vet_profiles']) {
      const r = await fetch(`${env.url}/rest/v1/${t}?select=id&limit=1`, { headers, cache: 'no-store' });
      report.tables[t] = r.ok ? 'ok' : r.status === 404 ? 'missing - run supabase/schema.sql' : `HTTP ${r.status}`;
    }
    const b = await fetch(`${env.url}/storage/v1/bucket/product-images`, { headers, cache: 'no-store' });
    report.storage = b.ok ? 'product-images bucket ok' : 'bucket not found - run supabase/schema.sql';
    const allGood = a.ok && Object.values(report.tables).every(v => v === 'ok');
    report.hint = allGood ? 'Supabase is connected.' : 'Connected to the server but something above needs fixing.';
    return NextResponse.json(report, { status: allGood ? 200 : 502 });
  } catch (e) {
    report.auth = `Cannot reach ${report.urlHost}: ${e.message}`;
    report.hint = 'Check the project URL spelling and that the project is not paused (free projects pause after inactivity).';
    return NextResponse.json(report, { status: 502 });
  }
}
