// functions/auth/callback.js — Crest AI
// Cloudflare Pages Function handling OAuth callbacks (Google) for Supabase

import { createClient } from '@supabase/supabase-js'

export async function onRequestGet(context) {
  const { request, env } = context
  const url = new URL(request.url)
  
  // Extract query parameters standard Web API style
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')
  const error_description = url.searchParams.get('error_description')

  const origin = url.origin

  // ── OAuth error from provider ──────────────────────────────────────────────
  if (error) {
    console.error('OAuth error:', error, error_description)
    return Response.redirect(
      `${origin}/pages/auth/login.html?error=${encodeURIComponent(error_description || error)}`,
      302
    )
  }

  // ── No code returned ──────────────────────────────────────────────────────
  if (!code) {
    return Response.redirect(`${origin}/pages/auth/login.html?error=missing_code`, 302)
  }

  try {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

    // ── Exchange code for session ────────────────────────────────────────────
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

    if (exchangeError) {
      console.error('Code exchange error:', exchangeError)
      return Response.redirect(
        `${origin}/pages/auth/login.html?error=${encodeURIComponent(exchangeError.message)}`,
        302
      )
    }

    const user = data?.user
    if (!user) {
      return Response.redirect(`${origin}/pages/auth/login.html?error=no_user`, 302)
    }

    // ── Upsert user in our users table ──────────────────────────────────────
    const { error: upsertError } = await supabase
      .from('users')
      .upsert({
        id: user.id,
        email: user.email,
        name: user.user_metadata?.full_name || user.user_metadata?.name || null,
        avatar_url: user.user_metadata?.avatar_url || null,
        provider: user.app_metadata?.provider || 'email',
        plan: 'free',
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'id',
        ignoreDuplicates: false
      })

    if (upsertError) {
      console.error('User upsert error:', upsertError)
    }

    // ── Redirect to chat on success ──────────────────────────────────────────
    return Response.redirect(`${origin}/pages/chat-view/chat.html`, 302)

  } catch (err) {
    console.error('Callback handler error:', err)
    return Response.redirect(`${origin}/pages/auth/login.html?error=server_error`, 302)
  }
}