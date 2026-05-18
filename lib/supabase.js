// lib/supabase.js — Crest AI
// Supabase client initialization for frontend (CDN version)

const SUPABASE_URL  = 'https://arydgubakjbbgijfgqee.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFyeWRndWJha2piYmdpamZncWVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMTk0ODAsImV4cCI6MjA5NDU5NTQ4MH0.l_qLFevXcY7Ss8Qh4UN8_Rupl761woxiVuRhCFZsTpM'

// Initialize Supabase client (uses CDN global)
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
})

export default supabase