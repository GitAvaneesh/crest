// functions/usage.js — Crest AI
// Cloudflare Pages Functions worker handling usage checks and mutations

import { createClient } from '@supabase/supabase-js'

const FREE_PLAN_LIMITS = {
  messages_per_day: 100,
  max_chats: 3
}

// Helper to initialize Supabase using Cloudflare env bindings
function getSupabaseClient(env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
}

// ── Check daily message limit ────────────────────────────────────────────────
async function checkMessageLimit(supabase, user_id) {
  const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD

  const { data, error } = await supabase
    .from('usage')
    .select('message_count')
    .eq('user_id', user_id)
    .eq('date', today)
    .single()

  if (error && error.code !== 'PGRST116') {
    throw new Error('Failed to fetch usage data')
  }

  const count = data?.message_count || 0
  return {
    count,
    limit: FREE_PLAN_LIMITS.messages_per_day,
    exceeded: count >= FREE_PLAN_LIMITS.messages_per_day,
    remaining: Math.max(0, FREE_PLAN_LIMITS.messages_per_day - count)
  }
}

// ── Increment message count ──────────────────────────────────────────────────
async function incrementMessageCount(supabase, user_id) {
  const today = new Date().toISOString().split('T')[0]

  // Upsert pattern with Postgres unique constraint on (user_id, date)
  const { data: existing } = await supabase
    .from('usage')
    .select('id, message_count')
    .eq('user_id', user_id)
    .eq('date', today)
    .single()

  if (existing) {
    await supabase
      .from('usage')
      .update({ message_count: existing.message_count + 1 })
      .eq('id', existing.id)
  } else {
    await supabase
      .from('usage')
      .insert({ user_id, date: today, message_count: 1 })
  }
}

// ── Check active chat limit ──────────────────────────────────────────────────
async function checkChatLimit(supabase, user_id) {
  const { count, error } = await supabase
    .from('chats')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user_id)
    .eq('is_active', true)

  if (error) throw new Error('Failed to fetch chat count')

  return {
    count: count || 0,
    limit: FREE_PLAN_LIMITS.max_chats,
    exceeded: (count || 0) >= FREE_PLAN_LIMITS.max_chats,
    remaining: Math.max(0, FREE_PLAN_LIMITS.max_chats - (count || 0))
  }
}

// ── Cloudflare Worker Post Handler ───────────────────────────────────────────
export async function onRequestPost(context) {
  try {
    const { request, env } = context
    const { user_id, action } = await request.json()

    if (!user_id) {
      return new Response(JSON.stringify({ error: 'user_id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const supabase = getSupabaseClient(env)

    switch (action) {
      case 'check_messages': {
        const result = await checkMessageLimit(supabase, user_id)
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      case 'check_chats': {
        const result = await checkChatLimit(supabase, user_id)
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      case 'increment': {
        await incrementMessageCount(supabase, user_id)
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      case 'check_all': {
        const [messages, chats] = await Promise.all([
          checkMessageLimit(supabase, user_id),
          checkChatLimit(supabase, user_id)
        ])

        const blocked = messages.exceeded || chats.exceeded
        let reason = null

        if (messages.exceeded) {
          reason = "You've reached your 100 message limit for today. Come back tomorrow!"
        } else if (chats.exceeded) {
          reason = "You've reached your 3 chat limit. Delete an old chat to start a new one."
        }

        return new Response(
          JSON.stringify({
            blocked,
            reason,
            messages,
            chats
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        )
      }

      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        })
    }
  } catch (err) {
    console.error('Usage check error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}