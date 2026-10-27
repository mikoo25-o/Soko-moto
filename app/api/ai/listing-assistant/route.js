import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseEnv } from '../../../../lib/supabase-env';

export async function POST(request) {
  try {
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return NextResponse.json({ error: 'Sign in to use the listing assistant.' }, { status: 401 });
    const { url: supabaseUrl, key: anonKey, ok } = getSupabaseEnv();
    if (!ok) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
    const client = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: authError } = await client.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'Your session is not valid. Please sign in again.' }, { status: 401 });
    if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: 'The AI listing assistant is not configured yet. Add OPENAI_API_KEY on the server.' }, { status: 503 });
    const input = await request.json();
    const name = String(input.name || '').trim().slice(0, 100);
    const category = String(input.category || '').trim().slice(0, 60);
    const county = String(input.county || '').trim().slice(0, 80);
    const description = String(input.description || '').trim().slice(0, 1000);
    if (!name) return NextResponse.json({ error: 'Enter a product name first.' }, { status: 400 });
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_LISTING_MODEL || 'gpt-4.1-mini',
        input: [
          { role: 'system', content: [{ type: 'input_text', text: 'You help Kenyan farmers write honest marketplace listings. Return only a concise, useful product description in plain text, maximum 70 words. Never invent organic certification, harvest dates, freshness, health claims, stock, delivery, quality guarantees or farming methods. Use only the facts supplied. If facts are limited, write a neutral description and invite buyers to confirm details.' }] },
          { role: 'user', content: [{ type: 'input_text', text: `Product name: ${name}\nCategory: ${category}\nCounty: ${county}\nExisting seller notes: ${description || '(none)'}\nWrite an accurate, buyer-friendly listing description. Do not invent facts.` }] }
        ],
        max_output_tokens: 140
      })
    });
    const result = await response.json();
    if (!response.ok) return NextResponse.json({ error: 'The AI service could not complete the request. Check server AI configuration and try again.' }, { status: 502 });
    const text = (result.output || []).flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text).join('\n').trim();
    if (!text) return NextResponse.json({ error: 'The AI assistant returned no description. Please write one manually.' }, { status: 502 });
    return NextResponse.json({ description: text.slice(0, 1000) });
  } catch {
    return NextResponse.json({ error: 'Could not generate a description. Please try again.' }, { status: 500 });
  }
}
