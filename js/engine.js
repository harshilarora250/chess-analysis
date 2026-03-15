/* engine.js - Stockfish loader + grading */
class Engine {
  constructor() {
    this.worker = null;
    this.ready = false;
    this._listeners = new Set();
    this.onError = null;
  }

  async init() {
    const cdnUrls = [
      'https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js',
      'https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.js',
    ];
    for (const url of cdnUrls) {
      try { const ok = await this._loadViaBlob(url); if (ok) { this.ready = true; return true; } }
      catch(e) { console.warn('Engine source failed:', url, e); }
    }
    if (this.onError) this.onError('Engine failed to load. Check your internet connection.');
    return false;
  }

  _loadViaBlob(cdnUrl) {
    return new Promise((resolve, reject) => {
      const blobCode = `importScripts(${JSON.stringify(cdnUrl)});`;
      let blobUrl;
      try { const blob = new Blob([blobCode], {type:'application/javascript'}); blobUrl = URL.createObjectURL(blob); }
      catch(e) { return reject(e); }
      let settled = false;
      const settle = (ok, err) => {
        if (settled) return; settled = true;
        clearTimeout(timer);
        try { URL.revokeObjectURL(blobUrl); } catch(e) {}
        if (ok) resolve(true); else reject(err || new Error('failed'));
      };
      try { if (this.worker) { try { this.worker.terminate(); } catch(e){} } this.worker = new Worker(blobUrl); }
      catch(e) { return settle(false, e); }
      this.worker.onerror = (e) => settle(false, e);
      this.worker.onmessage = (e) => { const line = typeof e.data === 'string' ? e.data : ''; this._dispatch(line); };
      let gotUci = false;
      const boot = (line) => {
        if (line === 'uciok' && !gotUci) { gotUci = true; this.worker.postMessage('isready'); }
        if (line === 'readyok') { this._listeners.delete(boot); settle(true); }
      };
      this._listeners.add(boot);
      this.worker.postMessage('uci');
      const timer = setTimeout(() => settle(false, new Error('timeout')), 8000);
    });
  }

  _dispatch(line) { for (const fn of [...this._listeners]) fn(line); }
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

  evaluateFen(fen, depth = 14) {
    return new Promise((resolve) => {
      if (!this.ready) return resolve(null);
      let best = null;
      const handler = (line) => {
        if (line.startsWith('info') && line.includes(' pv ')) {
          const info = Engine.parseInfo(line);
          if (info && (info.multipv === 1 || !info.multipv)) best = info;
        }
        if (line.startsWith('bestmove')) { this._listeners.delete(handler); resolve(best); }
      };
      this._listeners.add(handler);
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
      switch (parts[i]) {
        case 'depth':   r.depth   = +parts[++i]; break;
        case 'multipv': r.multipv = +parts[++i]; break;
        case 'nps':     r.nps     = +parts[++i]; break;
        case 'score':   r.score   = { type: parts[++i], value: +parts[++i] }; break;
        case 'pv':      r.pv      = parts.slice(i+1).join(' '); i = parts.length; break;
      }
    }
    return r.pv ? r : null;
  }

  static whiteCp(score) {
    if (!score) return 0;
    if (score.type === 'mate') return score.value > 0 ? 30000 : -30000;
    return score.value;
  }

  static formatEval(score, forColor) {
    if (!score) return '+0.00';
    const flip = forColor === 'b' ? -1 : 1;
    if (score.type === 'mate') { const m = score.value * flip; return `#${m > 0 ? '+' : ''}${m}`; }
    const cp = score.value * flip;
    return (cp >= 0 ? '+' : '') + (cp / 100).toFixed(2);
  }

  static evalBar(whitePovCp) {
    return Math.max(4, Math.min(96, 50 + 50 * (2 / (1 + Math.exp(-0.004 * whitePovCp)) - 1)));
  }

  // cpLoss = how much the mover's advantage dropped
  static gradeMove(cpLoss, isCoolKid = false) {
    if (isCoolKid) return 'coolkid';
    if (cpLoss <  10) return 'best';
    if (cpLoss <  25) return 'excellent';
    if (cpLoss <  50) return 'good';
    if (cpLoss < 100) return 'inaccuracy';
    if (cpLoss < 200) return 'mistake';
    return 'blunder';
  }

  static gradeLabel(g) {
    return {
      book:'Book', coolkid:'CoolKid !!', best:'Best', excellent:'Excellent',
      good:'Good', inaccuracy:'Inaccuracy', mistake:'Mistake', blunder:'Blunder'
    }[g] || g;
  }

  static gradeSymbol(g) {
    return { coolkid:'!!', best:'✓', excellent:'!', good:'·', inaccuracy:'?!', mistake:'?', blunder:'??', book:'📖' }[g] || '';
  }

  static gradeColor(g) {
    return {
      coolkid:'#00d4ff', best:'#4ade80', excellent:'#86efac', good:'#bef264',
      inaccuracy:'#fbbf24', mistake:'#f97316', blunder:'#f87171', book:'#94a3b8'
    }[g] || '#94a3b8';
  }

  static accuracy(losses) {
    if (!losses.length) return 100;
    const avg = losses.reduce((a, b) => a + b, 0) / losses.length;
    return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * avg) - 3.1668));
  }

  // Ask Claude API to explain a move / generate game story
  static async askClaude(prompt) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      const data = await res.json();
      return data.content?.[0]?.text || 'Could not get explanation.';
    } catch(e) {
      return 'AI explanation unavailable — check your connection.';
    }
  }
}
