/* engine.js - Stockfish loader via importScripts blob worker */
class Engine {
  constructor() {
    this.worker = null;
    this.ready = false;
    this._listeners = new Set();
    this.onReady = null;
    this.onError = null;
  }

  async init() {
    // We create a blob worker that importScripts the CDN url
    // This bypasses cross-origin worker restrictions
    const cdnUrls = [
      'https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js',
      'https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.js',
    ];

    for (const url of cdnUrls) {
      try {
        const ok = await this._loadViaBlob(url);
        if (ok) { this.ready = true; return true; }
      } catch(e) { console.warn('Engine source failed:', url, e); }
    }

    if (this.onError) this.onError('Engine failed to load. Check your internet connection.');
    return false;
  }

  _loadViaBlob(cdnUrl) {
    return new Promise((resolve, reject) => {
      // Create a blob worker that importScripts the CDN
      const blobCode = `importScripts(${JSON.stringify(cdnUrl)});`;
      let blobUrl;
      try {
        const blob = new Blob([blobCode], { type: 'application/javascript' });
        blobUrl = URL.createObjectURL(blob);
      } catch(e) { return reject(e); }

      let settled = false;
      const settle = (ok, err) => {
        if (settled) return; settled = true;
        clearTimeout(timer);
        if (blobUrl) { try { URL.revokeObjectURL(blobUrl); } catch(e){} }
        if (ok) resolve(true); else reject(err || new Error('failed'));
      };

      try {
        if (this.worker) { try { this.worker.terminate(); } catch(e){} }
        this.worker = new Worker(blobUrl);
      } catch(e) { return settle(false, e); }

      this.worker.onerror = (e) => settle(false, e);
      this.worker.onmessage = (e) => {
        const line = typeof e.data === 'string' ? e.data : '';
        this._dispatch(line);
      };

      let gotUci = false;
      const bootListener = (line) => {
        if (line === 'uciok' && !gotUci) {
          gotUci = true;
          this.worker.postMessage('isready');
        }
        if (line === 'readyok') {
          this._listeners.delete(bootListener);
          settle(true);
        }
      };
      this._listeners.add(bootListener);

      this.worker.postMessage('uci');
      const timer = setTimeout(() => settle(false, new Error('timeout')), 8000);
    });
  }

  _dispatch(line) {
    for (const fn of [...this._listeners]) fn(line);
  }

  addListener(fn) { this._listeners.add(fn); }
  removeListener(fn) { this._listeners.delete(fn); }

  send(cmd) { if (this.worker) this.worker.postMessage(cmd); }

  analyze(fen, depth = 16, multiPV = 3) {
    if (!this.ready) return;
    this.send('stop');
    this.send(`setoption name MultiPV value ${multiPV}`);
    this.send(`position fen ${fen}`);
    this.send(`go depth ${depth}`);
  }

  // Evaluate a single position; returns a promise resolving to the best info object
  evaluateFen(fen, depth = 14) {
    return new Promise((resolve) => {
      if (!this.ready) return resolve(null);
      let best = null;
      const handler = (line) => {
        if (line.startsWith('info') && line.includes(' pv ')) {
          const info = Engine.parseInfo(line);
          if (info && (info.multipv === 1 || !info.multipv)) best = info;
        }
        if (line.startsWith('bestmove')) {
          this._listeners.delete(handler);
          resolve(best);
        }
      };
      this._listeners.add(handler);
      this.send('stop');
      this.send('setoption name MultiPV value 1');
      this.send(`position fen ${fen}`);
      this.send(`go depth ${depth}`);
    });
  }

  stop() { if (this.ready) this.send('stop'); }

  // ── Static helpers ──────────────────────────────────────────
  static parseInfo(line) {
    if (!line.startsWith('info')) return null;
    const parts = line.split(' ');
    const r = {};
    for (let i = 1; i < parts.length; i++) {
      switch (parts[i]) {
        case 'depth':   r.depth   = +parts[++i]; break;
        case 'multipv': r.multipv = +parts[++i]; break;
        case 'nps':     r.nps     = +parts[++i]; break;
        case 'score':   r.score   = { type: parts[++i], value: +parts[++i] }; break;
        case 'pv':      r.pv      = parts.slice(i + 1).join(' '); i = parts.length; break;
      }
    }
    return r.pv ? r : null;
  }

  // Score as centipawns from White's perspective
  static whiteCp(score) {
    if (!score) return 0;
    if (score.type === 'mate') return score.value > 0 ? 30000 : -30000;
    return score.value;
  }

  // Format score as "+1.23" or "#5" from a given side's perspective
  static formatEval(score, forColor) {
    if (!score) return '+0.00';
    // score.value is always from the engine's side (side to move at time of eval)
    // We need to convert: if we evaluated a position where it was Black's turn,
    // score.value > 0 means Black is better. forColor lets us flip for display.
    const flip = forColor === 'b' ? -1 : 1;
    if (score.type === 'mate') {
      const m = score.value * flip;
      return `#${m > 0 ? '+' : ''}${m}`;
    }
    const cp = score.value * flip;
    return (cp >= 0 ? '+' : '') + (cp / 100).toFixed(2);
  }

  // Bar percentage: 0=black winning, 100=white winning
  static evalBar(whitePovCp) {
    return Math.max(4, Math.min(96,
      50 + 50 * (2 / (1 + Math.exp(-0.004 * whitePovCp)) - 1)
    ));
  }

  // Grade a move from cp loss (always positive = mover lost advantage)
  // Thresholds account for Stockfish depth-14 noise (~10cp variance)
  static gradeMove(cpLoss) {
    if (cpLoss <  10) return 'best';
    if (cpLoss <  25) return 'excellent';
    if (cpLoss <  50) return 'good';
    if (cpLoss < 100) return 'inaccuracy';
    if (cpLoss < 200) return 'mistake';
    return 'blunder';
  }

  static gradeLabel(g) {
    return { best:'Best', excellent:'Excellent', good:'Good', inaccuracy:'Inaccuracy', mistake:'Mistake', blunder:'Blunder', brilliant:'Brilliant' }[g] || g;
  }

  static gradeSymbol(g) {
    return { best:'', excellent:'!', good:'', inaccuracy:'?!', mistake:'?', blunder:'??', brilliant:'!!' }[g] || '';
  }

  static gradeColor(g) {
    return {
      brilliant:'#00d4ff', best:'#4ade80', excellent:'#86efac',
      good:'#bef264', inaccuracy:'#fbbf24', mistake:'#f97316', blunder:'#f87171'
    }[g] || '#94a3b8';
  }

  // Accuracy % from array of cpLoss values (Chessigma-style formula)
  static accuracy(losses) {
    if (!losses.length) return 100;
    const avg = losses.reduce((a, b) => a + b, 0) / losses.length;
    return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * avg) - 3.1668));
  }
}
