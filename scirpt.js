document.addEventListener('DOMContentLoaded', () => {

  // Enable animations only after JS loads
  document.body.classList.add('js-loaded')

  // Scroll animations
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible')
      }
    })
  }, {
    threshold: 0.08,
    rootMargin: '0px 0px -40px 0px'
  })

  document.querySelectorAll('.fade-up').forEach(el => {
    observer.observe(el)
  })

  // Navbar shadow
  const nav = document.getElementById('nav')

  window.addEventListener('scroll', () => {
    if (window.scrollY > 20) {
      nav?.classList.add('scrolled')
    } else {
      nav?.classList.remove('scrolled')
    }
  })

  // Mobile menu
  const burger = document.getElementById('navBurger')
  const mobileMenu = document.getElementById('navMobile')

  burger?.addEventListener('click', () => {
    mobileMenu?.classList.toggle('open')
  })

  // Close mobile
  window.closeMobile = () => {
    mobileMenu?.classList.remove('open')
  }

  // Outside click
  document.addEventListener('click', (e) => {
    if (nav && !nav.contains(e.target)) {
      mobileMenu?.classList.remove('open')
    }
  })

  // Smooth scroll
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      e.preventDefault()

      const target = document.querySelector(
        anchor.getAttribute('href')
      )

      if (target) {
        const offset = 80
        const top =
          target.getBoundingClientRect().top +
          window.scrollY -
          offset

        window.scrollTo({
          top,
          behavior: 'smooth'
        })
      }
    })
  })

  // Notify button
  window.notifyMe = (plan) => {
    alert(
      `Thanks for your interest in Crest ${plan}!`
    )
  }

})