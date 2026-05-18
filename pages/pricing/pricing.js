// pages/pricing/pricing.js — Crest AI

import supabase from '/lib/supabase.js'

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Fetch Shared Navbar and Footer Templates from Components Folder
  loadComponent('/navbar.html', 'navbar-placeholder')
  loadComponent('/footer.html', 'footer-placeholder')

  // 2. Identify Current Active Session via Supabase Session Handshake
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session && session.user) {
      await fetchAndRenderUserPlan(session.user.id)
    } else {
      updateAlertBox('Viewing anonymous pricing structures. Log in to check your active profile plan.', 'info')
    }
  } catch (error) {
    console.error('Session matching initialization failed:', error)
    updateAlertBox('Network connectivity failure. Unable to contact profile servers.', 'error')
  }

  // 3. Attach Click Watchers to Premium Coming Soon Notifications
  setupComingSoonHandlers()
})

/**
 * Loads layout fragments into placeholders dynamically
 */
async function loadComponent(url, placeholderId) {
  const container = document.getElementById(placeholderId)
  if (!container) return
  
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`HTTP status failed: ${response.status}`)
    const text = await response.text()
    container.innerHTML = text
  } catch (err) {
    console.error(`Error injection block component from target ${url}:`, err)
  }
}

/**
 * Matches authentication signatures to render specific active plan states
 */
async function fetchAndRenderUserPlan(userId) {
  const alertBox = document.getElementById('billingAlertBox')
  const freeBadge = document.getElementById('freeBadge')
  const btnFree = document.getElementById('btnFree')

  try {
    const { data: profile, error } = await supabase
      .from('users')
      .select('plan')
      .eq('id', userId)
      .single()

    if (error) throw error

    const userActivePlan = (profile?.plan || 'free').toLowerCase()
    
    // Hide default loading alert unless errors occur
    alertBox.style.display = 'none'

    // Update the visual status elements to mirror real-time database state
    if (userActivePlan === 'free') {
      if (freeBadge) freeBadge.textContent = 'Active Plan'
      if (btnFree) {
        btnFree.textContent = 'Get started free'
        btnFree.disabled = true
      }
    } else {
      // If user holds a different plan via custom admin grants
      if (freeBadge) {
        freeBadge.textContent = 'Base Tier'
        freeBadge.className = 'card-status-badge coming-soon-badge'
      }
      if (btnFree) {
        btnFree.textContent = 'Downgrade to Free'
        btnFree.disabled = false
        btnFree.classList.remove('current-btn')
        btnFree.addEventListener('click', () => {
          alert('Downgrade operations are disabled during sandbox structural testing modes.')
        })
      }
    }

  } catch (err) {
    console.error('Database plan check error:', err)
    updateAlertBox('Could not sync current account plan from database ledger.', 'error')
  }
}

/**
 * Handles alert banner dynamic message updates
 */
function updateAlertBox(message, type) {
  const alertBox = document.getElementById('billingAlertBox')
  const alertText = document.getElementById('alertMessageText')
  
  if (!alertBox || !alertText) return
  
  alertText.textContent = message
  alertBox.style.display = 'block'
  
  if (type === 'error') {
    alertBox.style.borderColor = '#dc2626'
    alertBox.style.backgroundColor = '#fff5f5'
  } else {
    alertBox.style.borderColor = '#000000'
    alertBox.style.backgroundColor = '#ffffff'
  }
}

/**
 * Sets up placeholders for coming soon notification click handlers
 */
function setupComingSoonHandlers() {
  document.querySelectorAll('.coming-soon-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const planName = e.currentTarget.getAttribute('data-plan') || 'Pro'
      alert(`The ${planName.toUpperCase()} tier payment routing pipeline is coming soon! Transaction verification sandboxes are currently offline.`)
    })
  })
}