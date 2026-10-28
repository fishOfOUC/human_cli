// Process lifetime follows work, not a resident desktop shell. Grace periods are
// only for startup/transport handoff; a pending human request never expires.
export class OnDemandLifecycle {
  constructor(hasPending, quit, { startupMs = 5000, idleMs = 250 } = {}) {
    this.hasPending = hasPending; this.quit = quit; this.idleMs = idleMs;
    this.startupUntil = Date.now() + startupMs; this.active = 0; this.used = false; this.closed = false;
    this.changed();
  }
  begin(path) {
    clearTimeout(this.timer); this.active++;
    if (path !== '/health') this.used = true;
    let ended = false;
    return () => { if (!ended) { ended = true; this.active--; this.changed(); } };
  }
  changed() {
    clearTimeout(this.timer);
    if (this.closed || this.active || this.hasPending()) return;
    const delay = this.used ? this.idleMs : Math.max(0, this.startupUntil - Date.now());
    this.timer = setTimeout(() => {
      if (this.closed || this.active || this.hasPending()) return;
      this.closed = true; this.quit();
    }, delay);
  }
  dispose() { this.closed = true; clearTimeout(this.timer); }
}
