/**
 * Stockfish Engine Loader
 * Loads Stockfish 16 via CDN (WebAssembly) and provides a clean UCI interface
 */

class StockfishEngine {
  constructor() {
    this.worker = null;
    this.ready = false;
    this.onMessage = null;
    this.onReady = null;
    this.onError = null;
    this._resolvers = [];
    this._currentAnalysis = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      try {
        // Use Stockfish WASM from CDN
        this.worker = new Worker(
          'https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js'
        );

        this.worker.onmessage = (e) => {
          const line = typeof e.data === 'string' ? e.data : '';
          this._handleLine(line);
        };

        this.worker.onerror = (err) => {
          console.warn('Stockfish worker error, trying fallback...', err);
          this._tryFallback(resolve, reject);
        };

        // Init UCI
        this.worker.postMessage('uci');

        // Wait for uciok
        const checkReady = (line) => {
          if (line === 'uciok') {
            this.worker.postMessage('isready');
          }
          if (line === 'readyok') {
            this.ready = true;
            this._removeListener(checkReady);
            resolve(true);
          }
        };
        this._addListener(checkReady);

        // Timeout fallback
        setTimeout(() => {
          if (!this.ready) {
            this._tryFallback(resolve, reject);
          }
        }, 5000);

      } catch (e) {
        this._tryFallback(resolve, reject);
      }
    });
  }

  _tryFallback(resolve, reject) {
    // Try alternative CDN
    try {
      if (this.worker) {
        try { this.worker.terminate(); } catch(e) {}
      }
      this.worker = new Worker(
        'https://cdn.jsdelivr.net/npm/stockfish@16.0.0/src/stockfish-nnue-16.js'
      );

      this.worker.onmessage = (e) => {
        const line = typeof e.data === 'string' ? e.data : '';
        this._handleLine(line);
      };

      this.worker.onerror = (err) => {
        console.error('Both Stockfish sources failed');
        this.ready = false;
        reject(new Error('Engine load failed'));
        if (this.onError) this.onError('Engine could not load. Analysis unavailable.');
      };

      this.worker.postMessage('uci');
      const checkReady2 = (line) => {
        if (line === 'uciok') this.worker.postMessage('isready');
        if (line === 'readyok') {
          this.ready = true;
          this._removeListener(checkReady2);
          resolve(true);
        }
      };
      this._addListener(checkReady2);

      setTimeout(() => {
        if (!this.ready) {
          reject(new Error('Engine timeout'));
          if (this.onError) this.onError('Engine load timed out.');
        }
      }, 8000);
    } catch(e) {
      reject(e);
    }
  }

  _listeners = [];
  _addListener(fn) { this._listeners.push(fn); }
  _removeListener(fn) { this._listeners = this._listeners.filter(l => l !== fn); }

  _handleLine(line) {
    if (!line) return;
    for (const fn of [...this._listeners]) fn(line);
    if (this.onMessage) this.onMessage(line);
  }

  send(cmd) {
    if (this.worker) this.worker.postMessage(cmd);
  }

  analyze(fen, depth = 15, multiPV = 3) {
    if (!this.ready) return;
    this._currentAnalysis = { fen, depth, lines: {} };
    this.send('stop');
    this.send('setoption name MultiPV value ' + multiPV);
    this.send('position fen ' + fen);
    this.send('go depth ' + depth);
  }

  stop() {
    if (this.ready) this.send('stop');
  }

  terminate() {
    if (this.worker) {
      try { this.worker.terminate(); } catch(e) {}
      this.worker = null;
    }
    this.ready = false;
  }

  /**
   * Parse UCI info line into structured data
   */
  static parseInfo(line) {
    if (!line.startsWith('info')) return null;
    const result = {};
    const parts = line.split(' ');
    let i = 1;
    while (i < parts.length) {
      const key = parts[i];
      if (key === 'depth') result.depth = parseInt(parts[++i]);
      else if (key === 'seldepth') result.seldepth = parseInt(parts[++i]);
      else if (key === 'multipv') result.multipv = parseInt(parts[++i]);
      else if (key === 'score') {
        const type = parts[++i];
        const val = parseInt(parts[++i]);
        result.score = { type, value: val };
      }
      else if (key === 'nodes') result.nodes = parseInt(parts[++i]);
      else if (key === 'nps') result.nps = parseInt(parts[++i]);
      else if (key === 'pv') {
        result.pv = parts.slice(i + 1).join(' ');
        break;
      }
      i++;
    }
    return result.depth ? result : null;
  }

  static formatScore(score, color) {
    if (!score) return '0.00';
    if (score.type === 'mate') {
      const m = color === 'b' ? -score.value : score.value;
      return `M${m > 0 ? '+' : ''}${m}`;
    }
    let cp = color === 'b' ? -score.value : score.value;
    return (cp >= 0 ? '+' : '') + (cp / 100).toFixed(2);
  }

  static evalToPercent(score, color) {
    if (!score) return 50;
    if (score.type === 'mate') {
      const m = color === 'b' ? -score.value : score.value;
      return m > 0 ? 95 : 5;
    }
    let cp = color === 'b' ? -score.value : score.value;
    // Sigmoid mapping
    const pct = 50 + 50 * (2 / (1 + Math.exp(-0.004 * cp)) - 1);
    return Math.max(5, Math.min(95, pct));
  }
}

// Global instance
window.stockfish = new StockfishEngine();
