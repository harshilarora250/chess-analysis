/**
 * Magnus Chess Analysis — Main Application
 * Handles board rendering, UI interactions, engine integration
 */

const PIECE_UNICODE = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟'
};

class MagnusApp {
  constructor() {
    this.chess = new Chess();
    this.flipped = false;
    this.selected = null;
    this.legalTargets = [];
    this.lastMove = null;
    this.historyIndex = -1; // -1 = current, else index into chess.history
    this.snapshots = []; // FEN snapshots for navigation
    this.playing = false;
    this.playInterval = null;
    this.pendingPromotion = null;
    this.engineLines = {};
    this.analysisDepth = 15;

    this._initDOM();
    this._initEngine();
    this._initEvents();
    this.renderBoard();
    this._updateFen();
    this.snapshots.push(this.chess.fen());
  }

  // ==================== DOM INIT ====================
  _initDOM() {
    this.boardEl = document.getElementById('chessboard');
    this.evalScoreEl = document.getElementById('evalScore');
    this.evalBarWhite = document.getElementById('evalBarWhite');
    this.depthValEl = document.getElementById('depthVal');
    this.bestMoveEl = document.getElementById('bestMoveVal');
    this.turnEl = document.getElementById('turnVal');
    this.gameStatusEl = document.getElementById('gameStatusVal');
    this.topLinesEl = document.getElementById('topLines');
    this.movesListEl = document.getElementById('movesList');
    this.fenInputEl = document.getElementById('fenInput');
    this.depthSliderEl = document.getElementById('depthSlider');
    this.depthDisplayEl = document.getElementById('depthDisplay');
    this.capturedWhiteEl = document.getElementById('capturedWhite');
    this.capturedBlackEl = document.getElementById('capturedBlack');
    this._buildRankFileLabels();
    this._buildPromotionDialog();
  }

  _buildRankFileLabels() {
    const rankEl = document.getElementById('rankLabels');
    const fileEl = document.getElementById('fileLabels');
    const files = ['a','b','c','d','e','f','g','h'];
    const ranks = ['8','7','6','5','4','3','2','1'];

    rankEl.innerHTML = (this.flipped ? [...ranks].reverse() : ranks)
      .map(r => `<div class="rank-label">${r}</div>`).join('');
    fileEl.innerHTML = (this.flipped ? [...files].reverse() : files)
      .map(f => `<div class="file-label">${f}</div>`).join('');
  }

  _buildPromotionDialog() {
    const overlay = document.createElement('div');
    overlay.className = 'promotion-overlay';
    overlay.id = 'promotionOverlay';
    overlay.innerHTML = `
      <div class="promotion-box">
        <div class="promotion-title">Choose Promotion</div>
        <div class="promotion-pieces" id="promoPieces"></div>
      </div>`;
    document.body.appendChild(overlay);
  }

  // ==================== ENGINE ====================
  async _initEngine() {
    const dot = document.getElementById('engineDot');
    const status = document.getElementById('engineStatus');
    dot.className = 'status-dot loading';
    status.textContent = 'Loading engine…';

    stockfish.onError = (msg) => {
      dot.className = 'status-dot error';
      status.textContent = 'Engine unavailable';
      this.topLinesEl.innerHTML = `<div class="line-placeholder" style="color:#e05555">⚠ ${msg}</div>`;
    };

    stockfish.onMessage = (line) => {
      if (line.startsWith('info') && line.includes('pv')) {
        const info = StockfishEngine.parseInfo(line);
        if (!info || !info.pv) return;
        this.engineLines[info.multipv || 1] = info;
        this._renderEngineLines();
        if (info.multipv === 1 || !info.multipv) {
          this._updateEval(info);
        }
      }
      if (line.startsWith('bestmove')) {
        const bm = line.split(' ')[1];
        if (bm && bm !== '(none)') {
          this.bestMoveEl.textContent = bm;
        }
      }
    };

    try {
      await stockfish.init();
      dot.className = 'status-dot ready';
      status.textContent = 'Stockfish 10 ready';
      this._triggerAnalysis();
    } catch(e) {
      dot.className = 'status-dot error';
      status.textContent = 'Engine failed';
    }
  }

  _triggerAnalysis() {
    if (!stockfish.ready) return;
    this.engineLines = {};
    const fen = this.chess.fen();
    stockfish.analyze(fen, this.analysisDepth, 3);
  }

  _updateEval(info) {
    if (!info.score) return;
    const color = this.chess.turn;
    const scoreStr = StockfishEngine.formatScore(info.score, color);
    const pct = StockfishEngine.evalToPercent(info.score, color);

    this.evalScoreEl.textContent = scoreStr;
    this.evalBarWhite.style.height = pct + '%';
    this.depthValEl.textContent = info.depth;

    // Color eval
    if (info.score.type === 'mate') {
      const m = color === 'b' ? -info.score.value : info.score.value;
      this.evalScoreEl.style.color = m > 0 ? '#f0dab5' : '#b58863';
    } else {
      const cp = color === 'b' ? -info.score.value : info.score.value;
      this.evalScoreEl.style.color = cp > 50 ? '#f0dab5' : cp < -50 ? '#b58863' : 'var(--accent)';
    }
  }

  _renderEngineLines() {
    const entries = Object.entries(this.engineLines)
      .sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
    if (!entries.length) return;

    const color = this.chess.turn;
    this.topLinesEl.innerHTML = entries.map(([num, info]) => {
      const score = StockfishEngine.formatScore(info.score, color);
      const moves = (info.pv || '').split(' ').slice(0, 8).join(' ');
      return `<div class="engine-line">
        <div class="line-score">${score}</div>
        <div class="line-moves">${moves}</div>
      </div>`;
    }).join('');
  }

  // ==================== EVENTS ====================
  _initEvents() {
    // Nav buttons
    document.getElementById('btnAnalysis').onclick = () => this._setNav('analysis');
    document.getElementById('btnImport').onclick = () => this._openModal('pgnModal');
    document.getElementById('btnAbout').onclick = () => this._openModal('aboutModal');

    // Controls
    document.getElementById('btnFlip').onclick = () => this._flip();
    document.getElementById('btnReset').onclick = () => this._reset();

    // FEN
    document.getElementById('btnLoadFen').onclick = () => this._loadFen();
    document.getElementById('btnCopyFen').onclick = () => this._copyFen();
    this.fenInputEl.addEventListener('keydown', e => { if (e.key === 'Enter') this._loadFen(); });

    // PGN
    document.getElementById('btnLoadPgn').onclick = () => this._loadPgn();
    document.getElementById('btnCancelPgn').onclick = () => this._closeModal('pgnModal');
    document.getElementById('closePgnModal').onclick = () => this._closeModal('pgnModal');
    document.getElementById('btnCopyPgn').onclick = () => this._copyPgn();

    // About
    document.getElementById('closeAboutModal').onclick = () => this._closeModal('aboutModal');

    // Move navigation
    document.getElementById('btnFirst').onclick = () => this._goToMove(0);
    document.getElementById('btnPrev').onclick = () => this._prevMove();
    document.getElementById('btnNext').onclick = () => this._nextMove();
    document.getElementById('btnLast').onclick = () => this._goToMove(this.snapshots.length - 1);
    document.getElementById('btnPlay').onclick = () => this._togglePlay();

    // Depth slider
    this.depthSliderEl.oninput = (e) => {
      this.analysisDepth = parseInt(e.target.value);
      this.depthDisplayEl.textContent = this.analysisDepth;
      this._triggerAnalysis();
    };

    // Modal backdrop close
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', e => {
        if (e.target === overlay) this._closeModal(overlay.id);
      });
    });

    // Keyboard navigation
    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') this._prevMove();
      if (e.key === 'ArrowRight') this._nextMove();
      if (e.key === 'ArrowUp') this._goToMove(0);
      if (e.key === 'ArrowDown') this._goToMove(this.snapshots.length - 1);
      if (e.key === 'f') this._flip();
    });
  }

  _setNav(section) {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('btnAnalysis').classList.add('active');
  }

  _openModal(id) {
    document.getElementById(id).classList.add('open');
  }
  _closeModal(id) {
    document.getElementById(id).classList.remove('open');
  }

  // ==================== BOARD RENDER ====================
  renderBoard() {
    this.boardEl.innerHTML = '';
    const board = this.chess.board;

    for (let visR = 0; visR < 8; visR++) {
      for (let visC = 0; visC < 8; visC++) {
        const r = this.flipped ? 7 - visR : visR;
        const c = this.flipped ? 7 - visC : visC;

        const sq = document.createElement('div');
        const isLight = (r + c) % 2 === 0;
        sq.className = 'square ' + (isLight ? 'light' : 'dark');
        sq.dataset.r = r;
        sq.dataset.c = c;

        // Last move highlight
        if (this.lastMove) {
          const alg = String.fromCharCode(97 + c) + (8 - r);
          if (alg === this.lastMove.from) sq.classList.add('last-from');
          if (alg === this.lastMove.to) sq.classList.add('last-to');
        }

        // Selected
        if (this.selected && this.selected[0] === r && this.selected[1] === c) {
          sq.classList.add('selected');
        }

        // Check highlight
        if (this.chess.inCheck()) {
          const king = this.chess._findKing(this.chess.turn);
          if (king && king[0] === r && king[1] === c) sq.classList.add('check');
        }

        // Piece
        const piece = board[r][c];
        if (piece) {
          const pieceEl = document.createElement('div');
          pieceEl.className = 'piece';
          pieceEl.textContent = PIECE_UNICODE[piece];
          pieceEl.draggable = true;
          pieceEl.dataset.r = r;
          pieceEl.dataset.c = c;
          this._attachPieceEvents(pieceEl);
          sq.appendChild(pieceEl);
        }

        // Legal move dots
        if (this.legalTargets.some(t => t[0] === r && t[1] === c)) {
          const dot = document.createElement('div');
          dot.className = 'move-dot' + (piece ? ' capture' : '');
          sq.appendChild(dot);
        }

        sq.addEventListener('click', (e) => this._handleSquareClick(r, c));
        this.boardEl.appendChild(sq);
      }
    }

    this._buildRankFileLabels();
    this._updateSideInfo();
    this._updateMovesList();
    this._updateCaptured();
    this._updateFen();
  }

  _attachPieceEvents(el) {
    el.addEventListener('dragstart', (e) => {
      const r = parseInt(el.dataset.r), c = parseInt(el.dataset.c);
      this._handleSquareClick(r, c);
      e.dataTransfer.setData('text/plain', `${r},${c}`);
      el.classList.add('dragging');
      setTimeout(() => el.classList.remove('dragging'), 0);
    });
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const r = parseInt(el.dataset.r), c = parseInt(el.dataset.c);
      this._handleSquareClick(r, c);
    });
  }

  _handleSquareClick(r, c) {
    const piece = this.chess.board[r][c];
    const color = this.chess.turn;

    // If a square is already selected
    if (this.selected) {
      const [sr, sc] = this.selected;

      // Click same square = deselect
      if (sr === r && sc === c) {
        this.selected = null;
        this.legalTargets = [];
        this.renderBoard();
        return;
      }

      // Try move
      if (this.legalTargets.some(t => t[0] === r && t[1] === c)) {
        this._tryMove([sr, sc], [r, c]);
        return;
      }
    }

    // Select own piece
    if (piece) {
      const pieceColor = this.chess._isWhite(piece) ? 'w' : 'b';
      if (pieceColor === color) {
        this.selected = [r, c];
        const moves = this.chess.legalMoves([r, c]);
        this.legalTargets = moves.map(m => m.to);
        this.renderBoard();
        return;
      }
    }

    // Click empty or enemy with nothing selected
    this.selected = null;
    this.legalTargets = [];
    this.renderBoard();
  }

  _tryMove(from, to) {
    const moves = this.chess.legalMoves(from);
    const promoMoves = moves.filter(m => m.to[0] === to[0] && m.to[1] === to[1] && m.promotion);

    if (promoMoves.length > 0) {
      this._showPromotion(from, to, this.chess.turn);
      return;
    }

    const result = this.chess.move(from, to);
    this._afterMove(result, from, to);
  }

  _afterMove(result, from, to) {
    if (!result || result === 'promotion') return;

    this.selected = null;
    this.legalTargets = [];
    this.lastMove = { from: result.from, to: result.to };
    this.historyIndex = -1;

    // Save snapshot
    this.snapshots.push(this.chess.fen());

    this.renderBoard();
    this._triggerAnalysis();
    this._checkGameEnd();
  }

  _showPromotion(from, to, color) {
    this.pendingPromotion = { from, to };
    const pieces = color === 'w' ? ['Q', 'R', 'B', 'N'] : ['q', 'r', 'b', 'n'];
    const overlay = document.getElementById('promotionOverlay');
    const container = document.getElementById('promoPieces');
    container.innerHTML = pieces.map(p =>
      `<div class="promo-piece" data-piece="${p}">${PIECE_UNICODE[p]}</div>`
    ).join('');
    container.querySelectorAll('.promo-piece').forEach(el => {
      el.onclick = () => {
        const piece = el.dataset.piece;
        overlay.classList.remove('open');
        const result = this.chess.move(this.pendingPromotion.from, this.pendingPromotion.to, piece);
        this._afterMove(result, this.pendingPromotion.from, this.pendingPromotion.to);
        this.pendingPromotion = null;
      };
    });
    overlay.classList.add('open');
  }

  _checkGameEnd() {
    if (this.chess.isCheckmate()) {
      const winner = this.chess.turn === 'w' ? 'Black' : 'White';
      setTimeout(() => this._toast(`Checkmate! ${winner} wins ♛`), 200);
    } else if (this.chess.isStalemate()) {
      setTimeout(() => this._toast('Stalemate — Draw!'), 200);
    } else if (this.chess.isDraw()) {
      setTimeout(() => this._toast('Draw by 50-move rule'), 200);
    }
  }

  // ==================== SIDE INFO ====================
  _updateSideInfo() {
    const turn = this.chess.turn === 'w' ? 'White' : 'Black';
    this.turnEl.textContent = turn;

    let status = 'Playing';
    if (this.chess.isCheckmate()) status = 'Checkmate';
    else if (this.chess.isStalemate()) status = 'Stalemate';
    else if (this.chess.isDraw()) status = 'Draw';
    else if (this.chess.inCheck()) status = 'Check!';
    this.gameStatusEl.textContent = status;
    this.gameStatusEl.style.color = status === 'Check!' ? 'var(--danger)' : 'var(--text)';
  }

  _updateFen() {
    this.fenInputEl.value = this.chess.fen();
  }

  _updateMovesList() {
    const history = this.chess.history;
    let html = '';
    for (let i = 0; i < history.length; i += 2) {
      const moveNum = Math.floor(i / 2) + 1;
      const white = history[i];
      const black = history[i + 1];
      const wIdx = i + 1; // snapshot index (1-based, 0 = start)
      const bIdx = i + 2;
      const wActive = this.historyIndex === wIdx || (this.historyIndex === -1 && i === history.length - 1 && !black) ? 'active' : '';
      const bActive = this.historyIndex === bIdx || (this.historyIndex === -1 && black && i + 1 === history.length - 1) ? 'active' : '';

      html += `<div class="move-pair">
        <span class="move-num">${moveNum}.</span>
        <span class="move-cell ${wActive}" data-idx="${wIdx}">${white ? white.san : ''}</span>
        <span class="move-cell ${bActive}" data-idx="${bIdx}">${black ? black.san : ''}</span>
      </div>`;
    }
    this.movesListEl.innerHTML = html || '<div class="line-placeholder">No moves yet</div>';

    // Attach click events
    this.movesListEl.querySelectorAll('.move-cell[data-idx]').forEach(el => {
      el.onclick = () => this._goToMove(parseInt(el.dataset.idx));
    });

    // Scroll to bottom
    this.movesListEl.scrollTop = this.movesListEl.scrollHeight;
  }

  _updateCaptured() {
    const board = this.chess.board;
    const count = { w: {}, b: {} };
    const initial = { p: 8, n: 2, b: 2, r: 2, q: 1 };

    // Count current pieces
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (!p) continue;
        const color = this.chess._isWhite(p) ? 'w' : 'b';
        const key = p.toLowerCase();
        count[color][key] = (count[color][key] || 0) + 1;
      }
    }

    // Compute captured
    const captured = { w: [], b: [] }; // w = captured by black, b = captured by white
    for (const [type, init] of Object.entries(initial)) {
      const wMissing = init - (count.w[type] || 0);
      const bMissing = init - (count.b[type] || 0);
      const wPiece = type.toUpperCase();
      const bPiece = type;
      for (let i = 0; i < wMissing; i++) captured.b.push(PIECE_UNICODE[wPiece]);
      for (let i = 0; i < bMissing; i++) captured.w.push(PIECE_UNICODE[bPiece]);
    }

    this.capturedWhiteEl.innerHTML = '<span class="capture-label">▲</span>' + captured.w.join('');
    this.capturedBlackEl.innerHTML = '<span class="capture-label">▼</span>' + captured.b.join('');
  }

  // ==================== NAVIGATION ====================
  _goToMove(idx) {
    if (idx < 0 || idx >= this.snapshots.length) return;
    this.historyIndex = idx;

    const fen = this.snapshots[idx];
    // Restore game state at this snapshot (read-only view)
    const tempChess = new Chess(fen);
    // We need the full history up to idx
    // Rebuild a fresh chess with the snapshotted FEN
    this.chess = new Chess(fen);
    // Re-attach history for PGN (only up to idx moves)
    // Actually we'll just display without history
    this.lastMove = idx > 0 ? this._getMoveAt(idx) : null;
    this.selected = null;
    this.legalTargets = [];
    this.renderBoard();
    this._triggerAnalysis();
  }

  _getMoveAt(idx) {
    // idx is 1-based snapshot; history[idx-1]
    // But after goToMove we rebuild chess, history is gone
    // Store last move from snapshots diff
    return null; // simplified — highlight from renderBoard via lastMove tracking
  }

  _prevMove() {
    const cur = this.historyIndex === -1 ? this.snapshots.length - 1 : this.historyIndex;
    if (cur > 0) this._goToMove(cur - 1);
  }

  _nextMove() {
    const cur = this.historyIndex === -1 ? this.snapshots.length - 1 : this.historyIndex;
    if (cur < this.snapshots.length - 1) this._goToMove(cur + 1);
  }

  _togglePlay() {
    this.playing = !this.playing;
    const btn = document.getElementById('btnPlay');
    if (this.playing) {
      btn.textContent = '⏸';
      btn.classList.add('playing');
      this.playInterval = setInterval(() => {
        const cur = this.historyIndex === -1 ? this.snapshots.length - 1 : this.historyIndex;
        if (cur >= this.snapshots.length - 1) {
          this._togglePlay();
        } else {
          this._nextMove();
        }
      }, 1200);
    } else {
      btn.textContent = '▶';
      btn.classList.remove('playing');
      clearInterval(this.playInterval);
    }
  }

  // ==================== ACTIONS ====================
  _flip() {
    this.flipped = !this.flipped;
    this.renderBoard();
  }

  _reset() {
    this.chess = new Chess();
    this.selected = null;
    this.legalTargets = [];
    this.lastMove = null;
    this.historyIndex = -1;
    this.snapshots = [this.chess.fen()];
    this.engineLines = {};
    this.topLinesEl.innerHTML = '<div class="line-placeholder">Analyzing…</div>';
    this.evalScoreEl.textContent = '0.00';
    this.evalBarWhite.style.height = '50%';
    this.depthValEl.textContent = '—';
    this.bestMoveEl.textContent = '—';
    if (this.playing) this._togglePlay();
    this.renderBoard();
    this._triggerAnalysis();
  }

  _loadFen() {
    const fen = this.fenInputEl.value.trim();
    if (!fen) return;
    const ok = this.chess.load(fen);
    if (!ok) { this._toast('Invalid FEN!', true); return; }
    this.selected = null; this.legalTargets = [];
    this.lastMove = null; this.historyIndex = -1;
    this.snapshots = [this.chess.fen()];
    this.engineLines = {};
    this.renderBoard();
    this._triggerAnalysis();
    this._toast('Position loaded');
  }

  _copyFen() {
    navigator.clipboard.writeText(this.chess.fen()).then(() => this._toast('FEN copied!'));
  }

  _loadPgn() {
    const pgn = document.getElementById('pgnInput').value.trim();
    if (!pgn) return;

    const tempChess = new Chess();
    const ok = tempChess.loadPgn(pgn);
    if (!ok) { this._toast('PGN parse error!', true); return; }

    // Replay to build snapshots
    this.chess = new Chess();
    this.snapshots = [this.chess.fen()];
    this.lastMove = null;

    // Replay all moves
    const replayChess = new Chess();
    replayChess.loadPgn(pgn);
    const moves = replayChess.history;

    // Rebuild by re-replaying from scratch
    this.chess = new Chess();
    this.snapshots = [this.chess.fen()];
    const tempReplay = new Chess();
    for (const h of moves) {
      const res = tempReplay.move(h.move.from, h.move.to, h.move.promotion);
      if (res) this.snapshots.push(tempReplay.fen());
    }
    this.chess = new Chess(this.snapshots[this.snapshots.length - 1]);
    // Restore history for PGN display
    this.chess = tempReplay;
    this.snapshots = [Chess.DEFAULT_FEN];
    const replayFull = new Chess();
    for (const h of moves) {
      replayFull.move(h.move.from, h.move.to, h.move.promotion);
      this.snapshots.push(replayFull.fen());
    }
    this.chess = replayFull;

    this.selected = null; this.legalTargets = [];
    this.historyIndex = -1;
    this.engineLines = {};
    this._closeModal('pgnModal');
    this.renderBoard();
    this._triggerAnalysis();
    this._toast(`Loaded ${moves.length} moves`);
  }

  _copyPgn() {
    const pgn = this.chess.pgn();
    if (!pgn) { this._toast('No moves to copy'); return; }
    navigator.clipboard.writeText(pgn).then(() => this._toast('PGN copied!'));
  }

  // ==================== TOAST ====================
  _toast(msg, isError = false) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    if (isError) toast.style.borderColor = 'var(--danger)';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  }
}

// ==================== BOOT ====================
document.addEventListener('DOMContentLoaded', () => {
  window.app = new MagnusApp();
});
