# Pendulum by quadrature with the AGM

An interactive page: pick a pendulum's energy and watch it swing, with angle and angular speed charted over time. The motion follows Richard Siemon's paper "Pendulum by quadrature with the AGM" (AGM for the period, Suite16 Simpson steps for the times in between).

- `index.html`, `app.js` — the page (no build step, no dependencies)
- `physics.js` — the AGM / Suite16 quadrature
- `verify.mjs` — `node verify.mjs` checks the physics against the paper's numbers and a plain RK4 integration
