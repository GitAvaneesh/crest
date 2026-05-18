// lib/limits.js — Crest AI
// Free plan limit logic: 100 messages/day, 3 active chats

import { getUser } from './auth.js'

const FREE_LIMITS = {
  messages_per_day: 100,
  max_chats: 3
}

// ── Check all limits before sending a message ────────────────────────────────
export async function checkLimits() {
  const user = await getUser()
  if (!user) return { blocked: true, reason: 'You must be logged in.' }

  try {
    const res = await fetch('/functions/usage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: user.id,
        action: 'check_all'
      })
    })

    const data = await res.json()
    return data

  } catch {
    // If usage API fails don't block the user
    return { blocked: false }
  }
}

// ── Check message limit only ─────────────────────────────────────────────────
export async function checkMessageLimit() {
  const user = await getUser()
  if (!user) return { exceeded: true }

  try {
    const res = await fetch('/functions/usage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: user.id,
        action: 'check_messages'
      })
    })

    return await res.json()
  } catch {
    return { exceeded: false }
  }
}

// ── Check chat limit only ────────────────────────────────────────────────────
export async function checkChatLimit() {
  const user = await getUser()
  if (!user) return { exceeded: true }

  try {
    const res = await fetch('/functions/usage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: user.id,
        action: 'check_chats'
      })
    })

    return await res.json()
  } catch {
    return { exceeded: false }
  }
}

// ── Increment message count after successful reply ───────────────────────────
export async function incrementUsage() {
  const user = await getUser()
  if (!user) return

  try {
    await fetch('/functions/usage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: user.id,
        action: 'increment'
      })
    })
  } catch {
    // Silently fail — don't block user experience
  }
}

// ── Get usage summary for UI display ─────────────────────────────────────────
export async function getUsageSummary() {
  const user = await getUser()
  if (!user) return null

  try {
    const res = await fetch('/functions/usage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: user.id,
        action: 'check_all'
      })
    })

    const data = await res.json()

    return {
      messages: {
        used: data.messages?.count || 0,
        limit: FREE_LIMITS.messages_per_day,
        remaining: data.messages?.remaining || FREE_LIMITS.messages_per_day
      },
      chats: {
        used: data.chats?.count || 0,
        limit: FREE_LIMITS.max_chats,
        remaining: data.chats?.remaining || FREE_LIMITS.max_chats
      }
    }
  } catch {
    return null
  }
}

// ── Format limit exceeded message for UI ─────────────────────────────────────
export function getLimitMessage(type) {
  if (type === 'messages') {
    return "You've reached your 100 message limit for today. Come back tomorrow!"
  }
  if (type === 'chats') {
    return "You've reached your 3 chat limit. Delete an old chat to start a new one."
  }
  return "You've reached your free plan limit."
}