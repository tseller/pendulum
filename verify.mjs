// Checks the page's physics against (1) the numbers and figures in Dick's paper and
// (2) a plain RK4 integration of θ'' = −ω0² sin θ. Run: node verify.mjs  (exits 1 on failure)
import { mode, solve, firstMotion, speed, rk4 } from './physics.js'

let fails = 0
const row = (name, got, want, tol) => {
  const ok = Math.abs(got - want) <= tol
  if (!ok) fails++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(58)} got ${got.toPrecision(6).padStart(10)}  want ${String(want).padStart(8)} ± ${tol}`)
}

console.log('— Numbers stated or plotted in the paper —')
row('p.9  Er=0.8: starting speed θ̇/ω0 = 2√Er', speed(0.8, 0), 1.79, 0.005)
row('p.13 Er=0.476: turning angle Θosc (deg)', (mode(0.476).Theta * 180) / Math.PI, 87.5, 0.5)
row('Fig.6 Er=0.476: first turning point ω0·t (≈1.83)', mode(0.476).tTurn, 1.83, 0.05)
row('Fig.6 Er=0.476: full period ω0·Tosc (≈7.33)', mode(0.476).T, 7.33, 0.1)
row('Fig.7A Δ=1e-2: oscillation period ω0·Tosc (≈14.8)', mode(1 - 1e-2).T, 14.8, 0.2)
row('Fig.7A Δ=1e-2: rotation reaches 2π at ω0·t (≈7.3)', mode(1 / (1 - 1e-2)).T, 7.3, 0.2)
row('Fig.7B Δ=1e-6: oscillation period ω0·Tosc (≈33.2)', mode(1 - 1e-6).T, 33.2, 0.3)
row('Fig.7B Δ=1e-6: rotation reaches 2π at ω0·t (≈16.6)', mode(1 / (1 - 1e-6)).T, 16.6, 0.3)
row('Fig.4 Er=0.5: ω_osc/ω0 (≈0.85)', mode(0.5).w, 0.85, 0.02)
row('Fig.4 Er=1.2: ω_rot/ω0 (≈1.5)', mode(1.2).w, 1.5, 0.05)
row('Fig.4 Er≈1.44 (arrow): ω_rot/ω0 (≈1.82)', mode(1.44).w, 1.82, 0.05)
row('p.14 Er→0: period → 2π (sine limit), Er=1e-6', mode(1e-6).T, 2 * Math.PI, 1e-4)

console.log('\n— Period: Dick\'s AGM vs plain RK4 integration —')
const periodRK4 = (Er, Tguess) => {
  const dt = Math.min(1e-3, Tguess / 20000)
  const tr = rk4(Er, Tguess * 1.2, dt)
  if (Er < 1) {
    // second upward zero crossing of θ = one full period
    let n = 0
    for (let i = 1; i < tr.length; i++) {
      if (tr[i - 1].theta < 0 && tr[i].theta >= 0 && ++n === 1) {
        const a = tr[i - 1], b = tr[i]
        return a.t + (b.t - a.t) * (-a.theta / (b.theta - a.theta))
      }
    }
  } else {
    for (let i = 1; i < tr.length; i++) {
      if (tr[i].theta >= 2 * Math.PI) {
        const a = tr[i - 1], b = tr[i]
        return a.t + (b.t - a.t) * ((2 * Math.PI - a.theta) / (b.theta - a.theta))
      }
    }
  }
  return NaN
}
const table = []
for (const Er of [0.01, 0.1, 0.476, 0.8, 0.99, 0.9999, 1.0001, 1.01, 1.25, 2, 4, 100]) {
  const m = mode(Er)
  const tr = periodRK4(Er, m.T)
  const ppm = (Math.abs(tr - m.T) / m.T) * 1e6
  table.push({ Er, agm: m.T, rk4: tr, ppm })
  const ok = ppm < 10
  if (!ok) fails++
  console.log(`${ok ? 'ok  ' : 'FAIL'} Er=${String(Er).padEnd(7)} ${m.kind.padEnd(11)} ω0T AGM ${m.T.toFixed(6).padStart(11)}  RK4 ${tr.toFixed(6).padStart(11)}  diff ${ppm.toFixed(2)} ppm`)
}

console.log('\n— Whole curve θ(t), θ̇(t) over two periods vs RK4 —')
for (const Er of [0.1, 0.476, 0.8, 0.99, 1.01, 1.25, 4]) {
  const s = solve(Er)
  const tr = rk4(Er, 2 * s.mode.T, Math.min(1e-3, s.mode.T / 20000))
  let eTh = 0, eV = 0
  for (let i = 0; i < tr.length; i += 10) {
    const p = s.at(tr[i].t)
    eTh = Math.max(eTh, Math.abs(p.theta - tr[i].theta))
    eV = Math.max(eV, Math.abs(p.thd - tr[i].thd))
  }
  const ok = eTh < 2e-3 && eV < 5e-3
  if (!ok) fails++
  console.log(`${ok ? 'ok  ' : 'FAIL'} Er=${String(Er).padEnd(5)} max |Δθ| ${(eTh * 180 / Math.PI).toFixed(4)}°   max |Δθ̇/ω0| ${eV.toExponential(2)}`)
}

console.log('\n— Suite16 Simpson times vs a fine quadrature (paper p.17: "rms … less than 100 ppm or 0.1%") —')
for (const Er of [0.01, 0.5, 0.99, 1 - 1e-6, 1.01, 2]) {
  const coarse = firstMotion(Er, { refine: 1 }).pts
  const fine = firstMotion(Er, { refine: 400 }).pts.filter(p => p.suite != null)
  let ss = 0
  for (let i = 1; i < 16; i++) ss += ((coarse[i].t - fine[i].t) / fine[16].t) ** 2
  const ppm = Math.sqrt(ss / 15) * 1e6
  const ok = ppm < 1000 // the paper's two numbers disagree (100 ppm = 0.01%); we hold it to 0.1%
  if (!ok) fails++
  console.log(`${ok ? 'ok  ' : 'FAIL'} Er=${String(Er).padEnd(9)} rms error of 15 Simpson steps ${ppm.toFixed(1)} ppm of the turning time ${ppm < 100 ? '(< 100 ppm)' : '(> 100 ppm, < 0.1%)'}`)
}

if (process.argv.includes('--json')) console.log(JSON.stringify(table))
console.log(fails ? `\n${fails} check(s) failed` : '\nall checks passed')
process.exit(fails ? 1 : 0)
