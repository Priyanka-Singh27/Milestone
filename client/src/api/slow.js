// Tiny store that tracks requests which are taking unusually long, so the app
// can say "waking up the server…" (free hosting sleeps when idle).

let pending = 0;
const listeners = new Set();

export const slowStore = {
  start() { pending += 1; notify(); },
  end() { pending = Math.max(0, pending - 1); notify(); },
  get: () => pending > 0,
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};

function notify() {
  listeners.forEach((fn) => fn(pending > 0));
}
