// Pendulum motion by quadrature with the AGM — after Richard Siemon,
// "Pendulum by quadrature with the AGM" (draft, June 2026).
//
// Everything is in the paper's dimensionless form:
//   Er    = E / (2 m g L)                 relative energy (Eq. 5); 1 = just reaches the top
//   w0*t  = time as an angle               (w0 = sqrt(g/L))
//   thd   = (dθ/dt) / w0                    angular speed relative to w0
// Standard initial condition: θ = 0 at t = 0, moving in +θ.

// Eq. 7: θ̇/ω0 = 2 sqrt(Er − (1 − cos θ)/2). Written with sin² for precision near the top.
export function speed(Er, theta) {
  const s = Math.sin(theta / 2)
  const v = Er - s * s
  return v > 0 ? 2 * Math.sqrt(v) : 0
}

// Pace P = ω0 / θ̇ (p. 7).
export function pace(Er, theta) {
  return 1 / speed(Er, theta)
}

// The arithmetic-geometric mean of 1 and x (p. 10, "The procedure").
export function agm(a, b) {
  for (let i = 0; i < 60 && Math.abs(a - b) > 1e-16 * a; i++) {
    const m = (a + b) / 2
    b = Math.sqrt(a * b)
    a = m
  }
  return (a + b) / 2
}

// Mode, turning angle Θ, AGM input Δ and frequency (Eqs. 6, 10a/b, 11a/b).
export function mode(Er) {
  if (!(Er > 0)) throw new Error('Er must be > 0')
  if (Er === 1) return { kind: 'separatrix', Theta: Math.PI, Delta: 0, w: 0, T: Infinity, tTurn: Infinity }
  if (Er < 1) {
    const Delta = 1 - Er
    const w = agm(1, Math.sqrt(Delta)) // ω_osc/ω0
    const T = (2 * Math.PI) / w // ω0·T_osc
    return { kind: 'oscillation', Theta: Math.acos(1 - 2 * Er), Delta, w, T, tTurn: T / 4 }
  }
  const Delta = 1 - 1 / Er
  const w = (2 / Math.sqrt(1 - Delta)) * agm(1, Math.sqrt(Delta)) // ω_rot/ω0
  const T = (2 * Math.PI) / w // ω0·T_rot: one full turn
  return { kind: 'rotation', Theta: Math.PI, Delta, w, T, tTurn: T / 2 }
}

// Suite16 fractions α_i (p. 7): 1/8 ×7, then halving to 1/2048, and α16 = α15.
export const SUITE16 = (() => {
  const a = []
  for (let i = 1; i <= 7; i++) a.push(1 / 8)
  for (let i = 8; i <= 15; i++) a.push(a[i - 2] / 2)
  a.push(a[14])
  return a
})()

// Simpson's rule on one step (p. 12).
function simpson(Er, a, b) {
  return ((b - a) / 6) * (pace(Er, a) + 4 * pace(Er, (a + b) / 2) + pace(Er, b))
}

// The AGM-Simpson16 table for the first motion, from θ = 0 to the first turning point Θ.
// Steps 1..15 by Simpson (Eq. 9); the 16th point's time is the AGM turning time (t16 = t_osc
// or t_rot), exactly as in the paper. `refine` > 1 splits each Simpson step into that many
// smaller Simpson steps (same quadrature, finer angles) so the animation is smooth; refine = 1
// is Dick's Suite16 exactly.
export function firstMotion(Er, { refine = 1 } = {}) {
  const m = mode(Er)
  if (m.kind === 'separatrix') throw new Error('separatrix has no turning time')
  const pts = [{ theta: 0, t: 0, thd: speed(Er, 0), suite: 0 }]
  let theta = 0
  let t = 0
  for (let i = 0; i < 15; i++) {
    const step = SUITE16[i] * m.Theta
    for (let k = 1; k <= refine; k++) {
      const a = theta + ((k - 1) * step) / refine
      const b = theta + (k * step) / refine
      t += simpson(Er, a, b)
      pts.push({ theta: b, t, thd: speed(Er, b), suite: k === refine ? i + 1 : null })
    }
    theta += step
  }
  pts.push({ theta: m.Theta, t: m.tTurn, thd: m.kind === 'oscillation' ? 0 : speed(Er, Math.PI), suite: 16 })
  return { mode: m, pts }
}

// Cubic Hermite between two table points, in time, with the exact slopes θ̇.
function hermite(p, q, t) {
  const h = q.t - p.t
  const s = (t - p.t) / h
  const s2 = s * s
  const s3 = s2 * s
  const theta = (2 * s3 - 3 * s2 + 1) * p.theta + (s3 - 2 * s2 + s) * h * p.thd + (-2 * s3 + 3 * s2) * q.theta + (s3 - s2) * h * q.thd
  const thd = ((6 * s2 - 6 * s) * p.theta + (3 * s2 - 4 * s + 1) * h * p.thd + (-6 * s2 + 6 * s) * q.theta + (3 * s2 - 2 * s) * h * q.thd) / h
  return { theta, thd }
}

function onFirst(pts, t) {
  let lo = 0
  let hi = pts.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (pts[mid].t <= t) lo = mid
    else hi = mid
  }
  return hermite(pts[lo], pts[hi], t)
}

// A solved motion: θ(ω0 t) and θ̇/ω0 for all time, built from the first motion by the
// turning-point symmetry of Table I.
export function solve(Er, opts = {}) {
  if (Er === 1) {
    // Separatrix (p. 16, Poleni): θ = 2 atan(sinh ω0t), θ̇/ω0 = 2 / cosh ω0t.
    return {
      mode: mode(1),
      suite: [],
      at: t => ({ theta: 2 * Math.atan(Math.sinh(t)), thd: 2 / Math.cosh(t) }),
    }
  }
  const { mode: m, pts } = firstMotion(Er, { refine: opts.refine ?? 8 })
  const q = m.tTurn
  const f = t => onFirst(pts, t)
  let at
  if (m.kind === 'oscillation') {
    at = t => {
      const tt = ((t % m.T) + m.T) % m.T
      const k = Math.min(3, Math.floor(tt / q))
      if (k === 0) return f(tt)
      if (k === 1) { const r = f(2 * q - tt); return { theta: r.theta, thd: -r.thd } }
      if (k === 2) { const r = f(tt - 2 * q); return { theta: -r.theta, thd: -r.thd } }
      const r = f(4 * q - tt)
      return { theta: -r.theta, thd: r.thd }
    }
  } else {
    at = t => {
      const n = Math.floor(t / m.T)
      const tt = t - n * m.T
      const base = 2 * Math.PI * n
      if (tt <= q) { const r = f(tt); return { theta: base + r.theta, thd: r.thd } }
      const r = f(2 * q - tt)
      return { theta: base + 2 * Math.PI - r.theta, thd: r.thd }
    }
  }
  // Dick's 16 computed points over one full period (the dots in his figures).
  const s16 = pts.filter(p => p.suite != null)
  const suite = []
  for (const p of s16) suite.push({ t: p.t, theta: p.theta, thd: p.thd })
  for (const p of [...s16].reverse().slice(1)) {
    suite.push(m.kind === 'oscillation'
      ? { t: 2 * q - p.t, theta: p.theta, thd: -p.thd }
      : { t: 2 * q - p.t, theta: 2 * Math.PI - p.theta, thd: p.thd })
  }
  if (m.kind === 'oscillation') {
    const half = suite.slice(1)
    for (const p of half) suite.push({ t: p.t + 2 * q, theta: -p.theta, thd: -p.thd })
  }
  return { mode: m, suite, at }
}

// A plain numerical integration of θ'' = −ω0² sin θ (RK4, in ω0·t units) — the independent check.
export function rk4(Er, tEnd, dt = 1e-3) {
  let th = 0
  let v = speed(Er, 0)
  const out = [{ t: 0, theta: th, thd: v }]
  const n = Math.ceil(tEnd / dt)
  const h = tEnd / n
  for (let i = 1; i <= n; i++) {
    const k1t = v, k1v = -Math.sin(th)
    const k2t = v + (h / 2) * k1v, k2v = -Math.sin(th + (h / 2) * k1t)
    const k3t = v + (h / 2) * k2v, k3v = -Math.sin(th + (h / 2) * k2t)
    const k4t = v + h * k3v, k4v = -Math.sin(th + h * k3t)
    th += (h / 6) * (k1t + 2 * k2t + 2 * k3t + k4t)
    v += (h / 6) * (k1v + 2 * k2v + 2 * k3v + k4v)
    out.push({ t: i * h, theta: th, thd: v })
  }
  return out
}
