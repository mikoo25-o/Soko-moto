import { createClient } from '@supabase/supabase-js';
import { getSupabaseEnv } from './supabase-env';

const env = getSupabaseEnv();
export const isSupabaseConfigured = env.ok;
export const supabaseProblems = env.problems;
export const supabase = env.ok ? createClient(env.url, env.key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
}) : null;
export const configurationMessage = env.problems.length
  ? `Supabase is not connected: ${env.problems.join(' ')} Open /setup for the checklist.`
  : 'Connect Supabase to enable accounts and live marketplace data. Open /setup for the exact steps.';
