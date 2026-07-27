// ===== Cursor glow follower =====
const glow = document.getElementById('cursorGlow');
if (glow) {
  let mouseX = 0, mouseY = 0, glowX = 0, glowY = 0;
  document.addEventListener('mousemove', e => {
    mouseX = e.clientX; mouseY = e.clientY;
    glow.style.opacity = '1';
  });
  document.addEventListener('mouseleave', () => glow.style.opacity = '0');
  function animateGlow() {
    glowX += (mouseX - glowX) * 0.08;
    glowY += (mouseY - glowY) * 0.08;
    glow.style.left = glowX + 'px';
    glow.style.top = glowY + 'px';
    requestAnimationFrame(animateGlow);
  }
  animateGlow();
}

// ===== Scroll reveal =====
const revealEls = document.querySelectorAll('.reveal');
if (revealEls.length) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
  revealEls.forEach(el => io.observe(el));
}

// ===== Typing effect (landing page terminal) =====
const typedEl = document.getElementById('typedCmd');
if (typedEl) {
  const fullText = typedEl.dataset.text || 'ghostshell chat "linux privesc checklist for SUID binaries"';
  let charIndex = 0;
  function typeChar() {
    if (charIndex <= fullText.length) {
      typedEl.textContent = fullText.slice(0, charIndex);
      charIndex++;
      setTimeout(typeChar, 28);
    }
  }
  setTimeout(typeChar, 600);
}

// ===== Copy button feedback (works for any .copy-btn with data-copy) =====
document.querySelectorAll('.copy-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const text = btn.dataset.copy || btn.closest('.install-cmd, pre')?.innerText || '';
    navigator.clipboard.writeText(text.trim());
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = original;
      btn.classList.remove('copied');
    }, 1800);
  });
});

// ===== Nav active state on scroll (landing page only) =====
const navLinks = document.querySelectorAll('.nav-links a[href^="#"]');
if (navLinks.length) {
  const sections = [...navLinks]
    .map(l => document.querySelector(l.getAttribute('href')))
    .filter(Boolean);
  window.addEventListener('scroll', () => {
    let current = '';
    sections.forEach(sec => {
      if (window.scrollY >= sec.offsetTop - 140) current = '#' + sec.id;
    });
    navLinks.forEach(l => {
      l.classList.toggle('active', l.getAttribute('href') === current);
    });
  });
}

// ===== Docs sidebar — page switching (docs.html only) =====
const docsLinks = document.querySelectorAll('.docs-nav a[data-page]');
const docsPages = document.querySelectorAll('.docs-page');
if (docsLinks.length) {
  function showPage(pageId) {
    docsPages.forEach(p => p.classList.toggle('active', p.id === pageId));
    docsLinks.forEach(l => l.classList.toggle('active', l.dataset.page === pageId));
    window.scrollTo({ top: 0, behavior: 'instant' });
    history.replaceState(null, '', '#' + pageId);
  }
  docsLinks.forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      showPage(link.dataset.page);
    });
  });
  // Load page from URL hash on load
  const initial = window.location.hash.replace('#', '') || docsLinks[0].dataset.page;
  showPage(initial);
}