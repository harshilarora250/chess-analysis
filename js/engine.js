/* Engine.js - Stockfish WASM manager + move grading */

class Engine {
  constructor() {
    this.worker = null;
    this.ready = false;
    this.listeners = new Set();
    this.onReady = null;
    this.onError = null;
  }

  async init() {
    const sources = [
      'https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js',
      'https://cdn.jsdelivr.net/npm/stockfish@16.0.0/src/stockfish-nnue-16.js'
    ];
    for (const src of sources) {
      try {
        const ok = await this._tryLoad(src);
        if (ok) return true;
      } catch(e) {}
    }
    if (this.onError) this.onError();
    return false;
  }

  _tryLoad(src) {
    return new Promise((res, rej) => {
      try {
        if (this.worker) { try { this.worker.terminate(); } catch(e) {} }
        this.worker = new Worker(src);
        this.worker.onerror = () => rej(new Error('Worker error'));
        this.worker.onmessage = e => {
          const line = typeof e.data === 'string' ? e.data : '';
          this._dispatch(line);
        };
        let gotUci = false;
        const boot = line => {
          if (line === 'uciok' && !gotUci) { gotUci = true; this.worker.postMessage('isready'); }
          if (line === 'readyok') { this.ready = true; this._remove(boot); res(true); }
        };
        this._add(boot);
        this.worker.postMessage('uci');
        setTimeout(() => rej(new Error('timeout')), 6000);
      } catch(e) { rej(e); }
    });
  }

  _add(fn) { this.listeners.add(fn); }
  _remove(fn) { this.listeners.delete(fn); }
  _dispatch(line) { for (const fn of [...this.listeners]) fn(line); }

  send(cmd) { if (this.worker) this.worker.postMessage(cmd); }

  analyze(fen, depth = 16, multiPV = 3) {
    if (!this.ready) return;
    this.send('stop');
    this.send(`setoption name MultiPV value ${multiPV}`);
    this.send(`position fen ${fen}`);
    this.send(`go depth ${depth}`);
  }

  evaluateFen(fen, depth = 14) {
    return new Promise(res => {
      if (!this.ready) return res(null);
      let best = null;
      const h = line => {
        const info = Engine.parseInfo(line);
        if (info && (info.multipv === 1 || !info.multipv) && info.pv) best = info;
        if (line.startsWith('bestmove')) {
          this._remove(h);
          res(best);
        }
      };
      this._add(h);
      this.send('stop');
      this.send('setoption name MultiPV value 1');
      this.send(`position fen ${fen}`);
      this.send(`go depth ${depth}`);
    });
  }

  stop() { if (this.ready) this.send('stop'); }

  static parseInfo(line) {
    if (!line.startsWith('info')) return null;
    const parts = line.split(' ');
    const r = {};
    for (let i = 1; i < parts.length; i++) {
      const k = parts[i];
      if (k === 'depth') r.depth = +parts[++i];
      else if (k === 'multipv') r.multipv = +parts[++i];
      else if (k === 'score') { r.score = { type: parts[++i], value: +parts[++i] }; }
      else if (k === 'nps') r.nps = +parts[++i];
      else if (k === 'nodes') r.nodes = +parts[++i];
      else if (k === 'pv') { r.pv = parts.slice(i+1).join(' '); break; }
    }
    return r.pv ? r : null;
  }

  static cpScore(score, forColor) {
    if (!score) return 0;
    if (score.type === 'mate') return (score.value > 0 ? 1 : -1) * 30000;
    return forColor === 'w' ? score.value : -score.value;
  }

  static formatEval(score, forColor) {
    if (!score) return '+0.00';
    if (score.type === 'mate') {
      const m = forColor === 'w' ? score.value : -score.value;
      return `#${m > 0 ? '+' : ''}${m}`;
    }
    const cp = forColor === 'w' ? score.value : -score.value;
    return (cp >= 0 ? '+' : '') + (cp / 100).toFixed(2);
  }

  static evalPercent(score, forColor) {
    if (!score) return 50;
    if (score.type === 'mate') {
      const m = forColor === 'w' ? score.value : -score.value;
      return m > 0 ? 96 : 4;
    }
    const cp = forColor === 'w' ? score.value : -score.value;
    return Math.max(4, Math.min(96, 50 + 50 * (2 / (1 + Math.exp(-0.0035 * cp)) - 1)));
  }

  // Grade a move based on centipawn loss
  // prevScore = eval before move (from mover's POV), newScore = eval after (from new turn POV, so flip)
  // cpLoss = prevBest - actualAfter (both from mover's perspective)
  static gradeMove(cpLoss, wasBestMove, isBrilliant) {
    if (isBrilliant) return 'brilliant';
    if (wasBestMove || cpLoss <= 0) return 'best';
    if (cpLoss <= 10) return 'excellent';
    if (cpLoss <= 25) return 'good';
    if (cpLoss <= 60) return 'inaccuracy';
    if (cpLoss <= 150) return 'mistake';
    return 'blunder';
  }

  static gradeLabel(grade) {
    return { brilliant:'Brilliant',best:'Best',excellent:'Excellent',good:'Good',inaccuracy:'Inaccuracy',mistake:'Mistake',blunder:'Blunder' }[grade] || grade;
  }

  static gradeIcon(grade) {
    return { brilliant:'!!',best:'!',excellent:'!',good:'',inaccuracy:'?!',mistake:'?',blunder:'??' }[grade] || '';
  }

  static gradeColor(grade) {
    return {
      brilliant:'#00d4ff', best:'#4ade80', excellent:'#a3e635',
      good:'#a3e635', inaccuracy:'#fbbf24', mistake:'#fb923c', blunder:'#f87171'
    }[grade] || '#94a3b8';
  }

  // Compute accuracy % from array of cpLoss values (Chessigma-style)
  static accuracy(cpLosses) {
    if (!cpLosses.length) return 100;
    const avg = cpLosses.reduce((a, b) => a + b, 0) / cpLosses.length;
    return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * avg) - 3.1668));
  }
}

window.Engine = Engine;
