// functions/chat.js — Crest AI
// Flow: Safety check (Groq) → Gemini (rotate 4 keys) → Groq fallback (Llama 4 Scout → Llama 3.3 70B)

const GROQ_SAFETY_MODEL = 'openai/gpt-oss-safeguard-20b'
const GROQ_MODEL_1      = 'meta-llama/llama-4-scout-17b-16e-instruct'
const GROQ_MODEL_2      = 'llama-3.3-70b-versatile'
const CONTEXT_LIMIT     = 35

const SYSTEM_PROMPT = `
You are Crest, a helpful, honest, and safe AI assistant made by Avaneesh Shahi.
You are designed for users aged 13 and above.

You strictly refuse to:
- Help with illegal activities, crimes, hacking, fraud, or scams
- Generate sexual, explicit, or NSFW content of any kind
- Provide self-harm or suicide methods
- Help with harassment, doxxing, or cyberbullying
- Generate misinformation or fake news
- Impersonate real people or brands

You are friendly, concise, and professional.
Always be helpful, honest, and safe.
`.trim()

// ── Safety check via Groq ────────────────────────────────────────────────────
async function isSafe(message, apiKey) {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: GROQ_SAFETY_MODEL,
        messages: [{ role: 'user', content: message }],
        max_tokens: 10,
        temperature: 0
      })
    })

    const data = await res.json()
    const verdict = data?.choices?.[0]?.message?.content?.toLowerCase() || ''
    return !verdict.includes('unsafe')
  } catch {
    return true // Fallback to safe if API is unreachable
  }
}

// ── Gemini call with key rotation ────────────────────────────────────────────
async function callGemini(messages, keys, keyIndex = 0) {
  if (keyIndex >= keys.length) return null

  const geminiMessages = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }))

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${keys[keyIndex]}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: geminiMessages,
          generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
        })
      }
    )

    if (res.status === 429 || !res.ok) {
      console.log(`Gemini key ${keyIndex + 1} rate limited or failed, trying key ${keyIndex + 2}`)
      return callGemini(messages, keys, keyIndex + 1)
    }

    const data = await res.json()
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || null

  } catch {
    return callGemini(messages, keys, keyIndex + 1)
  }
}

// ── Groq fallback call ───────────────────────────────────────────────────────
async function callGroq(messages, apiKey, modelIndex = 0) {
  const models = [GROQ_MODEL_1, GROQ_MODEL_2]
  if (modelIndex >= models.length) return null

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: models[modelIndex],
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages
        ],
        max_tokens: 1024,
        temperature: 0.7
      })
    })

    if (res.status === 429 || !res.ok) {
      console.log(`Groq model ${modelIndex + 1} rate limited or failed, trying next model`)
      return callGroq(messages, apiKey, modelIndex + 1)
    }

    const data = await res.json()
    return data?.choices?.[0]?.message?.content || null

  } catch {
    return callGroq(messages, apiKey, modelIndex + 1)
  }
}

// ── Cloudflare Worker Post Handler ───────────────────────────────────────────
export async function onRequestPost(context) {
  try {
    const { request, env } = context
    const { message, history = [] } = await request.json()

    if (!message || typeof message !== 'string' || message.trim() === '') {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Assemble dynamic key matrix from server context
    const GEMINI_KEYS = [
      env.GEMINI_API_KEY_1,
      env.GEMINI_API_KEY_2,
      env.GEMINI_API_KEY_3,
      env.GEMINI_API_KEY_4,
    ].filter(Boolean)

    const GROQ_API_KEY = env.GROQ_API_KEY

    // 1. Safety check
    const safe = await isSafe(message, GROQ_API_KEY)
    if (!safe) {
      return new Response(JSON.stringify({
        reply: "I'm sorry, I can't help with that. Please review our content policy.",
        flagged: true
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    // 2. Context boundary calculation
    const contextHistory = [
      ...history.slice(-CONTEXT_LIMIT),
      { role: 'user', content: message.trim() }
    ]

    // 3. Try Gemini first (rotate keys natively)
    let reply = await callGemini(contextHistory, GEMINI_KEYS)

    // 4. Try Groq secondary failovers if primary engine returns empty
    if (!reply) {
      console.log('All Gemini keys failed, switching to Groq fallback chain')
      reply = await callGroq(contextHistory, GROQ_API_KEY)
    }

    // 5. Hard structural system exception
    if (!reply) {
      return new Response(JSON.stringify({
        reply: "Crest is busy right now, try again in a minute.",
        flagged: false
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ reply, flagged: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('Chat execution stack error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}