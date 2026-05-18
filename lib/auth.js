// lib/auth.js — Crest AI
// Centralized, lightweight authentication hooks

import supabase from './supabase.js'

export async function getUser() {
  const { data: { user }, error } = await supabase.auth.getUser()
  return error ? null : user
}

export async function isLoggedIn() {
  return !!(await getUser())
}

export async function requireAuth() {
  if (!(await isLoggedIn())) {
    window.location.href = '/pages/auth/login.html'
  }
}

export async function redirectIfLoggedIn() {
  if (await isLoggedIn()) {
    window.location.href = '/pages/chat-view/chat.html'
  }
}

export async function loginWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/functions/auth/callback` }
  })
  if (error) throw error
}

export async function logout() {
  await supabase.auth.signOut()
  window.location.href = '/index.html'
}