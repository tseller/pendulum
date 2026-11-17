import { solve, speed } from './physics.js'

const G = 9.81
const DEG = 180 / Math.PI
const $ = id => document.getElementById(id)
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

// Slider: equal room for 0–0.5, 0.5–1, 1–2 and 2–3, so the interesting region near 1 gets half the track.
const KNOTS = [[0, 0.002], [250, 0.5], [500, 1], [750, 2], [1000, 3]]
const posToEr = p => {
  for (let i = 1; i < KNOTS.length; i++) {
    const [p0, e0] = KNOTS[i - 1], [p1, e1] = KNOTS[i]
    if (p <= p1) return +(e0 + ((p - p0) / (p1 - p0)) * (e1 - e0)).toFixed(4)
  }
  return 3
}
const erToPos = e => {
  for (let i = 1; i < KNOTS.length; i++) {
    const [p0, e0] = KNOTS[i - 1], [p1, e1] = KNOTS[i]
    if (e <= e1) return Math.round(p0 + ((Math.max(e, e0) - e0) / (e1 - e0)) * (p1 - p0))
  }
  return 1000
}

const PRESETS = [
  ['Small swing', 0.05], ['Dick’s experiment', 0.476], ['Big swing', 0.8], ['Nearly to the top', 0.999],
  ['Exactly to the top', 1], ['Just over', 1.001], ['Over the top', 1.25], ['Fast spin', 3],
]
const LENGTHS = [[0.25, '25 cm'], [0.54, '54 cm (Dick’s string)'], [1, '1 m'], [2, '2 m'], [10, '10 m']]

const state = { Er: 0.476, L: 0.54, rate: 1, playing: true, t: 0, last: null, sol: null, w0: 0 }

function setup() {
  const pre = $('presets')
  for (const [name, e] of PRESETS) {
    const b = document.createElement('button')
    b.textContent = name
    b.dataset.er = e
    b.onclick = () => setEnergy(e)
    pre.appendChild(b)
  }
  for (const [l, name] of LENGTHS) {
    const o = document.createElement('option')
    o.value = l
    o.textContent = name
    $('len').appendChild(o)
  }
  $('len').value = String(state.L)
  $('energy').oninput = e => setEnergy(posToEr(+e.target.value), { fromSlider: true })
  $('erExact').onchange = e => {
    const v = +e.target.value
    if (v > 0) setEnergy(v)
  }
  $('play').onclick = () => {
    state.playing = !state.playing
    $('play').textContent = state.playing ? 'Pause' : 'Play'
    state.last = null
  }
  $('rate').onchange = e => { state.rate = +e.target.value }
  $('len').onchange = e => { state.L = +e.target.value; recompute() }
  window.addEventListener('resize', () => drawChart())
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => drawChart())
  const q = new URLSearchParams(location.search)
  if (q.get('er')) state.Er = +q.get('er') || state.Er
  setEnergy(state.Er)
  requestAnimationFrame(frame)
}

function setEnergy(Er, { fromSlider = false } = {}) {
  state.Er = Er
  if (!fromSlider) $('energy').value = erToPos(Er)
  $('erExact').value = Er
  for (const b of $('presets').children) b.classList.toggle('on', +b.dataset.er === Er)
  recompute()
}

function fmtTime(s) {
  if (!isFinite(s)) return 'never comes back (takes forever to reach the top)'
  return s < 10 ? `${s.toFixed(3)} s` : `${s.toFixed(2)} s`
}

function recompute() {
  state.w0 = Math.sqrt(G / state.L)
  state.sol = solve(state.Er)
  state.t = 0
  state.last = null
  const m = state.sol.mode
  const color = { oscillation: css('--osc'), rotation: css('--rot'), separatrix: css('--sep') }[m.kind]
  const label = { oscillation: 'swings back and forth', rotation: 'goes over the top', separatrix: 'just reaches the top' }[m.kind]
  $('rMode').innerHTML = `<span class="badge" style="background:${color}">${label}</span>`
  $('rTheta').textContent = m.kind === 'oscillation' ? `${(m.Theta * DEG).toFixed(2)}° from straight down` : '180° — all the way up'
  const T = m.T / state.w0
  const T0 = (2 * Math.PI) / state.w0
  $('rPeriod').textContent = m.kind === 'rotation' ? `${fmtTime(T)} per full turn` : fmtTime(T)
  $('rRatio').textContent = isFinite(T)
    ? m.kind === 'rotation' ? `a tiny swing takes ${fmtTime(T0)}` : `${(T / T0).toFixed(4)} × the tiny-swing period of ${fmtTime(T0)}`
    : `a tiny swing takes ${fmtTime(T0)}`
  $('rSpeed').textContent = `${(speed(state.Er, 0) * state.w0 * DEG).toFixed(0)}°/s at the bottom`
  $('lgAngle').style.background = color
  drawChart()
}

// ---------- animation ----------
function frame(now) {
  if (state.playing) {
    if (state.last != null) state.t += ((now - state.last) / 1000) * state.rate
    state.last = now
  }
  drawSwing()
  drawCursor()
  requestAnimationFrame(frame)
}

function sizeCanvas(c) {
  const r = c.getBoundingClientRect()
  const d = devicePixelRatio || 1
  const w = Math.round(r.width * d), h = Math.round(r.height * d)
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h }
  const ctx = c.getContext('2d')
  ctx.setTransform(d, 0, 0, d, 0, 0)
  return { ctx, w: r.width, h: r.height }
}

function windowLen() {
  const m = state.sol.mode
  return isFinite(m.T) ? 2 * m.T : 14 // ω0·t; separatrix: show the long creep to the top
}

function nowTau() {
  const W = windowLen()
  const tau = state.t * state.w0
  return state.sol.mode.kind === 'separatrix' ? tau % W : tau
}

function drawSwing() {
  const c = $('swing')
  const { ctx, w, h } = sizeCanvas(c)
  const m = state.sol.mode
  const p = state.sol.at(nowTau())
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.38
  ctx.clearRect(0, 0, w, h)
  // reachable path
  ctx.lineWidth = 1.5
  ctx.strokeStyle = css('--line')
  ctx.setLineDash([4, 5])
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.stroke()
  ctx.setLineDash([])
  const color = { oscillation: css('--osc'), rotation: css('--rot'), separatrix: css('--sep') }[m.kind]
  if (m.kind === 'oscillation') {
    ctx.strokeStyle = color
    ctx.globalAlpha = 0.35
    ctx.lineWidth = 6
    ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI / 2 - m.Theta, Math.PI / 2 + m.Theta); ctx.stroke()
    ctx.globalAlpha = 1
  }
  // straight-down and top marks
  ctx.strokeStyle = css('--line'); ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + R + 14); ctx.stroke()
  // rod and bob
  const bx = cx + R * Math.sin(p.theta), by = cy + R * Math.cos(p.theta)
  ctx.strokeStyle = css('--ink'); ctx.lineWidth = 2.5
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(bx, by); ctx.stroke()
  ctx.fillStyle = css('--ink')
  ctx.beginPath(); ctx.arc(cx, cy, 4, 0, 2 * Math.PI); ctx.fill()
  ctx.fillStyle = color
  ctx.beginPath(); ctx.arc(bx, by, Math.max(10, R * 0.09), 0, 2 * Math.PI); ctx.fill()
  // readouts
  let a = ((p.theta * DEG + 180) % 360 + 360) % 360 - 180
  ctx.fillStyle = css('--muted')
  ctx.font = '13px system-ui, sans-serif'
  ctx.fillText(`angle ${a.toFixed(1)}°`, 10, 20)
  ctx.fillText(`speed ${(p.thd * state.w0 * DEG).toFixed(0)}°/s`, 10, 38)
  ctx.fillText(`t = ${state.t.toFixed(2)} s`, 10, 56)
}

// ---------- chart ----------
let chartBase = null // cached background image of the chart (curves), cursor drawn on top

function chartLayout(w, h) {
  const left = 58, right = 12, top = 10, gap = 26, bottom = 30
  const ph = (h - top - bottom - gap) / 2
  return { left, right, top, ph, gap, bottom, pw: w - left - right, a: { y: top }, v: { y: top + ph + gap } }
}

function niceStep(range, n = 5) {
  const raw = range / n
  const mag = 10 ** Math.floor(Math.log10(raw))
  for (const k of [1, 2, 2.5, 5, 10]) if (raw <= k * mag) return k * mag
  return 10 * mag
}

function drawChart() {
  if (!state.sol) return
  const c = $('chart')
  const { ctx, w, h } = sizeCanvas(c)
  const L = chartLayout(w, h)
  const W = windowLen()
  const sol = state.sol
  const m = sol.mode
  const N = 900
  const pts = []
  for (let i = 0; i <= N; i++) {
    const tau = (i / N) * W
    const p = sol.at(tau)
    pts.push({ s: tau / state.w0, a: p.theta * DEG, v: p.thd * state.w0 * DEG })
  }
  const tMax = W / state.w0
  const range = (k, sym) => {
    let lo = Math.min(...pts.map(p => p[k])), hi = Math.max(...pts.map(p => p[k]))
    if (sym) { const M = Math.max(Math.abs(lo), Math.abs(hi)); lo = -M; hi = M }
    if (hi - lo < 1e-9) { lo -= 1; hi += 1 }
    const pad = (hi - lo) * 0.08
    return [lo - pad, hi + pad]
  }
  const ar = range('a', m.kind === 'oscillation')
  const vr = m.kind === 'oscillation' ? range('v', true) : [Math.min(0, range('v')[0]), range('v')[1]]
  const X = s => L.left + (s / tMax) * L.pw
  const Y = (panel, r, val) => panel.y + L.ph - ((val - r[0]) / (r[1] - r[0])) * L.ph

  ctx.clearRect(0, 0, w, h)
  ctx.font = '11px system-ui, sans-serif'
  const muted = css('--muted'), line = css('--line')
  const color = { oscillation: css('--osc'), rotation: css('--rot'), separatrix: css('--sep') }[m.kind]

  const panel = (P, r, key, col, title, unit) => {
    ctx.strokeStyle = line; ctx.lineWidth = 1
    ctx.strokeRect(L.left, P.y, L.pw, L.ph)
    const st = niceStep(r[1] - r[0], 4)
    ctx.fillStyle = muted; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
    for (let v = Math.ceil(r[0] / st) * st; v <= r[1]; v += st) {
      const y = Y(P, r, v)
      ctx.globalAlpha = Math.abs(v) < 1e-9 ? 0.9 : 0.4
      ctx.beginPath(); ctx.moveTo(L.left, y); ctx.lineTo(L.left + L.pw, y); ctx.stroke()
      ctx.globalAlpha = 1
      ctx.fillText(`${+v.toFixed(2)}`, L.left - 6, y)
    }
    ctx.save(); ctx.translate(12, P.y + L.ph / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'
    ctx.fillText(`${title} (${unit})`, 0, 0); ctx.restore()
    ctx.strokeStyle = col; ctx.lineWidth = 2
    ctx.beginPath()
    pts.forEach((p, i) => (i ? ctx.lineTo(X(p.s), Y(P, r, p[key])) : ctx.moveTo(X(p.s), Y(P, r, p[key]))))
    ctx.stroke()
    // Dick's Suite16 points, repeated over the window
    if (sol.suite.length && isFinite(m.T)) {
      ctx.fillStyle = css('--dot')
      for (let k = 0; k * m.T < W + 1e-9; k++) {
        for (const q of sol.suite) {
          const tau = q.t + k * m.T
          if (tau > W + 1e-9) continue
          const val = key === 'a' ? (q.theta + (m.kind === 'rotation' ? 2 * Math.PI * k : 0)) * DEG : q.thd * state.w0 * DEG
          ctx.beginPath(); ctx.arc(X(tau / state.w0), Y(P, r, val), 2.2, 0, 2 * Math.PI); ctx.fill()
        }
      }
    }
  }
  panel(L.a, ar, 'a', color, 'angle', '°')
  panel(L.v, vr, 'v', '#e08a1e', 'speed', '°/s')

  // time axis
  const st = niceStep(tMax, 6)
  ctx.fillStyle = muted; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  for (let s = 0; s <= tMax + 1e-9; s += st) ctx.fillText(`${+s.toFixed(2)}`, X(s), L.v.y + L.ph + 4)
  ctx.fillText('time (seconds)', L.left + L.pw / 2, L.v.y + L.ph + 16)
  ctx.textAlign = 'right'
  ctx.fillText(isFinite(m.T) ? (m.kind === 'rotation' ? 'two full turns' : 'two full swings') : 'creeping up to the top', L.left + L.pw - 6, L.a.y + 4)

  chartBase = { img: ctx.getImageData(0, 0, c.width, c.height), L, tMax }
}

function drawCursor() {
  if (!chartBase) return
  const c = $('chart')
  const ctx = c.getContext('2d')
  const d = devicePixelRatio || 1
  ctx.putImageData(chartBase.img, 0, 0)
  const { L, tMax } = chartBase
  const W = windowLen()
  const tau = nowTau() % W
  const x = L.left + (tau / state.w0 / tMax) * L.pw
  ctx.setTransform(d, 0, 0, d, 0, 0)
  ctx.strokeStyle = css('--muted'); ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(x, L.a.y); ctx.lineTo(x, L.v.y + L.ph); ctx.stroke()
}

setup()
