// Single place that reads and cleans the Supabase connection settings.
// NOTE: Next.js only inlines NEXT_PUBLIC_* variables when they are written out literally, so each name is spelled in full below.
const clean = v => String(v || '').trim().replace(/^["']|["']$/g, '').trim();

export function getSupabaseEnv() {
  const url = clean(process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/+$/, '').replace(/\/(rest|auth)\/v1$/, '');
  // Supabase now calls the public key a "publishable key"; the older name is "anon key". Either works.
  const key = clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) || clean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const problems = [];
  if (!url) problems.push('NEXT_PUBLIC_SUPABASE_URL is missing.');
  else if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(url)) problems.push('NEXT_PUBLIC_SUPABASE_URL should look like https://YOUR_PROJECT_REF.supabase.co (no /rest/v1 or dashboard link).');
  if (!key) problems.push('NEXT_PUBLIC_SUPABASE_ANON_KEY is missing (the anon or publishable key from Project Settings -> API).');
  else if (/service_role|sb_secret_/i.test(key)) problems.push('That looks like a SECRET/service-role key. Use the anon/public (publishable) key instead.');
  return { url, key, problems, ok: Boolean(url && key && !problems.length) };
}
