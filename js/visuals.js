/**
 * visuals.js — MathCrush visual effects
 * Manages two canvas layers:
 *   #bg-canvas       — animated twinkling starfield (z-index 0)
 *   #particle-canvas — particle burst system        (z-index 50)
 */

// ── Starfield ─────────────────────────────────────────────────────────────────

const bgCanvas  = document.getElementById('bg-canvas');
const bgCtx     = bgCanvas.getContext('2d');
let   stars     = [];

function resizeStarfield() {
  bgCanvas.width  = window.innerWidth;
  bgCanvas.height = window.innerHeight;
  stars = Array.from({ length: 80 }, () => ({
    x:     Math.random() * bgCanvas.width,
    y:     Math.random() * bgCanvas.height,
    r:     Math.random() * 1.8 + 0.3,
    speed: Math.random() * 0.4 + 0.1,
    pulse: Math.random() * Math.PI * 2,
  }));
}

function animateStarfield() {
  bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
  stars.forEach(s => {
    s.pulse += s.speed * 0.03;
    const alpha = 0.4 + Math.sin(s.pulse) * 0.35;
    bgCtx.beginPath();
    bgCtx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    bgCtx.fillStyle = `rgba(200, 170, 255, ${alpha})`;
    bgCtx.fill();
  });
  requestAnimationFrame(animateStarfield);
}

resizeStarfield();
window.addEventListener('resize', resizeStarfield);
animateStarfield();


// ── Particle system ───────────────────────────────────────────────────────────

const pCanvas    = document.getElementById('particle-canvas');
const pCtx       = pCanvas.getContext('2d');
let   particles  = [];

/** Colour palette used for celebration bursts. */
const BURST_COLORS = ['#a855f7','#ec4899','#fbbf24','#4ade80','#22d3ee','#f97316','#fff'];

function resizeParticleCanvas() {
  pCanvas.width  = window.innerWidth;
  pCanvas.height = window.innerHeight;
}

/**
 * Spawn a burst of particles at the given screen coordinates.
 * @param {number}   x      - Centre X (screen px)
 * @param {number}   y      - Centre Y (screen px)
 * @param {string[]} colors - Array of CSS colour strings to pick from
 * @param {number}   count  - Number of particles to spawn
 */
function burst(x, y, colors = BURST_COLORS, count = 18) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * 6;
    particles.push({
      x, y,
      vx:    Math.cos(angle) * speed,
      vy:    Math.sin(angle) * speed - 3,
      r:     4 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      life:  1,
      decay: 0.025 + Math.random() * 0.015,
      gravity: 0.18,
      shape: Math.random() > 0.5 ? 'circle' : 'star',
    });
  }
}

function drawStarShape(ctx, x, y, r, color, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle   = color;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = Math.PI / 2 + i * Math.PI * 2 / 5;
    const b = a + Math.PI / 5;
    if (i === 0) ctx.moveTo(x + r * Math.cos(a), y + r * Math.sin(a));
    else         ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
    ctx.lineTo(x + r * 0.4 * Math.cos(b), y + r * 0.4 * Math.sin(b));
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function animateParticles() {
  pCtx.clearRect(0, 0, pCanvas.width, pCanvas.height);
  particles = particles.filter(p => p.life > 0);
  particles.forEach(p => {
    p.x   += p.vx;
    p.y   += p.vy;
    p.vy  += p.gravity;
    p.vx  *= 0.97;
    p.life -= p.decay;
    if (p.shape === 'star') {
      drawStarShape(pCtx, p.x, p.y, p.r, p.color, p.life);
    } else {
      pCtx.beginPath();
      pCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      pCtx.fillStyle   = p.color;
      pCtx.globalAlpha = p.life;
      pCtx.fill();
      pCtx.globalAlpha = 1;
    }
  });
  requestAnimationFrame(animateParticles);
}

resizeParticleCanvas();
window.addEventListener('resize', resizeParticleCanvas);
animateParticles();
