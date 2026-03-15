/* ChessCalc — Main Application */

const PIECES = { K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙',k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟' };

class ChessCalc {
  constructor() {
    this.chess = new Chess();
    this.engine = new Engine();
    this.flipped = false;
    this.selected = null;
    this.legalTargets = [];
    this.lastMove = null;
    this.snapshots = [Chess.START]; // FEN per ply
    this.currentPly = 0;
    this.moveGrades = [];    // grade per ply (1-based)
    this.cpLossWhite = [];
    this.cpLossBlack = [];
    this.evalHistory = [];   // eval per ply (white POV cp)
    this.analysisRunning = false;
    this.pendingPromo = null;
    this.playing = false;
    this.playTimer = null;
    this.engineLines = {};

    this._bind();
    this._initEngine();
    this.showLanding();
  }

  /* ===================== ENGINE ===================== */
  async _initEngine() {
    const ok = await this.engine.init();
    const dot = document.getElementById('engineDot');
    const txt = document.getElementById('engineTxt');
    if (ok) {
      dot.className = 'engine-dot ready';
      txt.textContent = 'Stockfish ready';
      this.engine.workers = true;
    } else {
      dot.className = 'engine-dot';
      txt.textContent = 'Engine offline';
    }
    this.engine.listeners.add((line) => this._handleEngineLine(line));
  }

  _handleEngineLine(line) {
    if (line.startsWith('info') && line.includes('pv')) {
      const info = Engine.parseInfo(line);
      if (!info) return;
      const pv = info.multipv || 1;
      this.engineLines[pv] = info;
      this._renderLines();
      if ((pv === 1 || !info.multipv) && info.score) {
        this._updateEvalDisplay(info.score);
      }
    }
    if (line.startsWith('bestmove')) {
      const bm = line.split(' ')[1];
      if (bm && bm !== '(none)') {
        document.getElementById('bestMoveVal').textContent = bm;
      }
    }
  }

  _triggerLiveAnalysis() {
    this.engineLines = {};
    document.getElementById('bestMoveVal').textContent = '…';
    const depth = parseInt(document.getElementById('depthSlider').value);
    this.engine.analyze(this.chess.fen(), depth, 3);
  }

  _updateEvalDisplay(score) {
    const col = this.chess.turn;
    const pct = Engine.evalPercent(score, 'w'); // always white POV for bar
    const txt = Engine.formatEval(score, col);
    const el = document.getElementById('evalNum');
    el.textContent = txt;

    const cp = score.type === 'mate'
      ? (score.value > 0 ? 9999 : -9999)
      : (col === 'w' ? score.value : -score.value);

    if (cp > 30) { el.className = 'eval-num positive'; }
    else if (cp < -30) { el.className = 'eval-num negative'; }
    else { el.className = 'eval-num'; }

    document.getElementById('evalBarFill').style.width = pct + '%';
    document.getElementById('depthStat').textContent = this.engineLines[1]?.depth || '—';
    document.getElementById('turnStat').textContent = this.chess.turn === 'w' ? 'White' : 'Black';

    let status = 'Playing';
    if (this.chess.isCheckmate()) status = 'Checkmate ♟';
    else if (this.chess.isStalemate()) status = 'Stalemate';
    else if (this.chess.isDraw()) status = 'Draw';
    else if (this.chess.inCheck(this.chess.turn)) status = 'Check!';
    document.getElementById('statusStat').textContent = status;
  }

  _renderLines() {
    const el = document.getElementById('engineLines');
    const entries = Object.entries(this.engineLines).sort((a,b)=>+a[0]-+b[0]);
    if (!entries.length) return;
    const col = this.chess.turn;
    el.innerHTML = entries.map(([, info]) => {
      const score = Engine.formatEval(info.score, col);
      const moves = (info.pv || '').split(' ').slice(0,10);
      const movesHtml = moves.map((m, i) => `<span style="color:${i===0?'var(--blue-l)':'var(--text3)'}">${m}</span>`).join(' ');
      return `<div class="engine-line-card">
        <div class="elc-score">${score}</div>
        <div class="elc-moves">${movesHtml}</div>
      </div>`;
    }).join('');
  }

  /* ===================== ANALYSIS PIPELINE ===================== */
  async runFullAnalysis(pgnStr) {
    const tempChess = new Chess();
    const ok = tempChess.loadPgn(pgnStr);
    if (!ok || !tempChess.history.length) {
      this.toast('Could not parse PGN', true);
      return;
    }

    // Build snapshot list
    const history = tempChess.history;
    const snaps = [Chess.START];
    const rebuild = new Chess();
    for (const h of history) {
      rebuild.move(h.move.from, h.move.to, h.move.promotion);
      snaps.push(rebuild.fen());
    }

    this.snapshots = snaps;
    this.moveGrades = new Array(history.length).fill(null);
    this.evalHistory = [];
    this.cpLossWhite = [];
    this.cpLossBlack = [];

    // Show analysis page first with board
    this.chess = new Chess();
    this.currentPly = snaps.length - 1;
    this._loadChessFromSnapshot(this.currentPly);
    this.showAnalysis();
    this._updateMovesList(history);

    // Show progress overlay
    this._showProgress(true, history.length);

    if (!this.engine.ready) {
      this._hideProgress();
      this.toast('Engine not ready — showing game without analysis');
      return;
    }

    // Evaluate each position
    const evals = [];
    for (let i = 0; i < snaps.length; i++) {
      const info = await this.engine.evaluateFen(snaps[i], 14);
      const cp = info?.score
        ? (info.score.type === 'mate'
            ? (info.score.value > 0 ? 30000 : -30000)
            : info.score.value)
        : 0;
      evals.push(cp); // always from Stockfish's side (white POV when turn=w)
      // Stockfish eval is from the side to move; convert to white POV
      const chess = new Chess(snaps[i]);
      const whitePov = chess.turn === 'w' ? cp : -cp;
      this.evalHistory.push(whitePov);
      this._updateProgress(i + 1, snaps.length);
    }

    // Grade each move
    for (let i = 1; i < snaps.length; i++) {
      const h = history[i - 1];
      const prevEvalWhitePov = this.evalHistory[i - 1]; // before move
      const afterEvalWhitePov = this.evalHistory[i];    // after move
      const moverWasWhite = h.color === 'w';

      // Advantage change from mover's perspective
      const prevAdvantage = moverWasWhite ? prevEvalWhitePov : -prevEvalWhitePov;
      const afterAdvantage = moverWasWhite ? afterEvalWhitePov : -afterEvalWhitePov;
      const cpLoss = Math.max(0, prevAdvantage - afterAdvantage);

      const isBest = cpLoss <= 3;
      const grade = Engine.gradeMove(cpLoss, isBest, false);
      this.moveGrades[i - 1] = grade;

      if (moverWasWhite) this.cpLossWhite.push(cpLoss);
      else this.cpLossBlack.push(cpLoss);
    }

    this._hideProgress();

    // Rebuild chess for current ply
    this._loadChessFromSnapshot(this.currentPly);
    this._updateMovesList(history);
    this._renderAccuracy();
    this._drawEvalGraph();
    this._triggerLiveAnalysis();

    this.toast('Analysis complete ✓');
  }

  _loadChessFromSnapshot(ply) {
    this.chess = new Chess(this.snapshots[ply]);
    this.currentPly = ply;
    this.selected = null;
    this.legalTargets = [];
    this.lastMove = null;
    this.renderBoard();
    this._updateFen();
    this._triggerLiveAnalysis();
  }

  _getGameHistory() {
    // Reconstruct from snapshots
    const h = [];
    for (let i = 1; i < this.snapshots.length; i++) {
      const prev = new Chess(this.snapshots[i-1]);
      const curr = new Chess(this.snapshots[i]);
      // Find what move was made from prev history
      const { history } = (() => { const c = new Chess(Chess.START); c.loadPgn(this._pgn || ''); return c; })();
      // Use cached history instead
      return this._cachedHistory || h;
    }
    return h;
  }

  /* ===================== BOARD ===================== */
  renderBoard() {
    const board = document.getElementById('chessboard');
    board.innerHTML = '';
    const b = this.chess.board;

    for (let vr = 0; vr < 8; vr++) {
      for (let vc = 0; vc < 8; vc++) {
        const r = this.flipped ? 7-vr : vr;
        const c = this.flipped ? 7-vc : vc;
        const isLight = (r+c)%2 === 0;
        const sq = document.createElement('div');
        sq.className = 'sq ' + (isLight ? 'light' : 'dark');
        sq.dataset.r = r; sq.dataset.c = c;

        if (this.selected && this.selected[0]===r && this.selected[1]===c) sq.classList.add('selected');
        if (this.lastMove) {
          const alg = String.fromCharCode(97+c)+(8-r);
          if (alg === this.lastMove.from) sq.classList.add('last-from');
          if (alg === this.lastMove.to)   sq.classList.add('last-to');
        }
        if (this.chess.inCheck(this.chess.turn)) {
          const k = this.chess.findKing(this.chess.turn);
          if (k && k[0]===r && k[1]===c) sq.classList.add('check');
        }

        // Grade badge on to-square
        if (this.lastMove) {
          const alg = String.fromCharCode(97+c)+(8-r);
          if (alg === this.lastMove.to && this.currentPly > 0) {
            const grade = this.moveGrades[this.currentPly - 1];
            if (grade && grade !== 'best' && grade !== 'good') {
              const badge = document.createElement('div');
              badge.className = 'sq-badge';
              badge.textContent = Engine.gradeIcon(grade);
              badge.style.color = Engine.gradeColor(grade);
              sq.appendChild(badge);
            }
          }
        }

        const piece = b[r][c];
        if (piece) {
          const el = document.createElement('div');
          el.className = 'piece';
          el.textContent = PIECES[piece];
          el.addEventListener('click', e => { e.stopPropagation(); this._clickSq(r,c); });
          el.addEventListener('dragstart', e => {
            this._clickSq(r,c);
            e.dataTransfer.setData('text/plain', `${r},${c}`);
          });
          sq.appendChild(el);
        }

        if (this.legalTargets.some(t=>t[0]===r&&t[1]===c)) {
          const dot = document.createElement('div');
          dot.className = 'move-dot' + (piece ? ' cap' : '');
          sq.appendChild(dot);
        }

        sq.addEventListener('click', () => this._clickSq(r,c));
        sq.addEventListener('dragover', e => e.preventDefault());
        sq.addEventListener('drop', e => { e.preventDefault(); this._clickSq(r,c); });
        board.appendChild(sq);
      }
    }
    this._updateLabels();
    this._updateSideInfo();
  }

  _updateLabels() {
    const ranks = document.getElementById('rankLabels');
    const files = document.getElementById('fileLabels');
    const rs = this.flipped ? ['1','2','3','4','5','6','7','8'] : ['8','7','6','5','4','3','2','1'];
    const fs = this.flipped ? ['h','g','f','e','d','c','b','a'] : ['a','b','c','d','e','f','g','h'];
    ranks.innerHTML = rs.map(r=>`<div>${r}</div>`).join('');
    files.innerHTML = fs.map(f=>`<div>${f}</div>`).join('');
  }

  _updateSideInfo() {
    document.getElementById('turnStat').textContent = this.chess.turn === 'w' ? 'White' : 'Black';
    let status = 'Playing';
    if (this.chess.isCheckmate()) status = '♚ Checkmate';
    else if (this.chess.isStalemate()) status = 'Stalemate';
    else if (this.chess.isDraw()) status = 'Draw';
    else if (this.chess.inCheck(this.chess.turn)) status = '⚠ Check';
    document.getElementById('statusStat').textContent = status;
  }

  _clickSq(r, c) {
    const piece = this.chess.board[r][c];
    const col = this.chess.turn;

    if (this.selected) {
      const [sr, sc] = this.selected;
      if (sr===r && sc===c) { this.selected=null; this.legalTargets=[]; this.renderBoard(); return; }
      if (this.legalTargets.some(t=>t[0]===r&&t[1]===c)) { this._tryMove([sr,sc],[r,c]); return; }
    }
    if (piece && (this.chess.isW(piece)?'w':'b') === col) {
      this.selected = [r,c];
      this.legalTargets = this.chess.legalMoves([r,c]).map(m=>m.to);
      this.renderBoard(); return;
    }
    this.selected = null; this.legalTargets = []; this.renderBoard();
  }

  _tryMove(from, to) {
    const ms = this.chess.legalMoves(from);
    const hasPromo = ms.filter(m=>m.to[0]===to[0]&&m.to[1]===to[1]&&m.promotion);
    if (hasPromo.length) { this._showPromo(from, to); return; }
    const result = this.chess.move(from, to);
    this._afterMove(result);
  }

  _afterMove(result) {
    if (!result || result === 'promotion') return;
    this.selected = null; this.legalTargets = [];
    this.lastMove = { from: result.from, to: result.to };
    // Trim future snapshots if we branched
    this.snapshots = this.snapshots.slice(0, this.currentPly + 1);
    this.snapshots.push(this.chess.fen());
    this.moveGrades = this.moveGrades.slice(0, this.currentPly);
    this.moveGrades.push(null);
    this.currentPly = this.snapshots.length - 1;
    this.renderBoard();
    this._updateMovesList();
    this._triggerLiveAnalysis();
    this._updateFen();
  }

  _showPromo(from, to) {
    this.pendingPromo = { from, to };
    const color = this.chess.turn;
    const pieces = color==='w' ? ['Q','R','B','N'] : ['q','r','b','n'];
    document.getElementById('promoPieces').innerHTML = pieces.map(p=>
      `<div class="promo-piece" data-p="${p}">${PIECES[p]}</div>`
    ).join('');
    document.querySelectorAll('.promo-piece').forEach(el=>{
      el.onclick = () => {
        document.getElementById('promoOverlay').classList.remove('active');
        const result = this.chess.move(this.pendingPromo.from, this.pendingPromo.to, el.dataset.p);
        this._afterMove(result);
        this.pendingPromo = null;
      };
    });
    document.getElementById('promoOverlay').classList.add('active');
  }

  /* ===================== NAVIGATION ===================== */
  _goToPly(ply) {
    if (ply < 0 || ply >= this.snapshots.length) return;
    this.chess = new Chess(this.snapshots[ply]);
    this.currentPly = ply;
    this.selected = null; this.legalTargets = [];

    // Reconstruct lastMove from history if possible
    if (ply > 0 && this._cachedHistory && this._cachedHistory[ply-1]) {
      this.lastMove = {
        from: this._cachedHistory[ply-1].from,
        to:   this._cachedHistory[ply-1].to
      };
    } else {
      this.lastMove = null;
    }

    this.renderBoard();
    this._highlightMove(ply);
    this._updateFen();
    this._triggerLiveAnalysis();
    this._drawEvalGraph();
  }

  _highlightMove(ply) {
    document.querySelectorAll('.move-cell').forEach(el => {
      el.classList.toggle('active', +el.dataset.ply === ply);
    });
    // Scroll active into view
    const active = document.querySelector('.move-cell.active');
    if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  /* ===================== MOVE LIST ===================== */
  _updateMovesList(history) {
    const hist = history || this._cachedHistory;
    if (!hist) return;
    this._cachedHistory = hist;

    const container = document.getElementById('movesList');
    let html = '';
    for (let i = 0; i < hist.length; i += 2) {
      const num = Math.floor(i/2) + 1;
      const w = hist[i], b = hist[i+1];
      const wPly = i+1, bPly = i+2;
      const wGrade = this.moveGrades[i];
      const bGrade = this.moveGrades[i+1];
      const wColor = Engine.gradeColor(wGrade || 'good');
      const bColor = Engine.gradeColor(bGrade || 'good');
      const wActive = this.currentPly === wPly ? 'active' : '';
      const bActive = this.currentPly === bPly ? 'active' : '';

      html += `<div class="move-pair">
        <span class="move-num">${num}.</span>
        <span class="move-cell ${wActive}" data-ply="${wPly}">
          <span>${w ? w.san : ''}</span>
          ${wGrade ? `<span class="move-grade-dot" style="background:${wColor}" title="${Engine.gradeLabel(wGrade)}"></span>` : '<span></span>'}
        </span>
        <span class="move-cell ${bActive}" data-ply="${bPly}">
          <span>${b ? b.san : ''}</span>
          ${b&&bGrade ? `<span class="move-grade-dot" style="background:${bColor}" title="${Engine.gradeLabel(bGrade)}"></span>` : '<span></span>'}
        </span>
      </div>`;
    }
    container.innerHTML = html || '<div style="color:var(--text3);font-size:12px;padding:8px;">No moves yet</div>';
    container.querySelectorAll('.move-cell[data-ply]').forEach(el => {
      el.addEventListener('click', () => this._goToPly(+el.dataset.ply));
    });
    container.scrollTop = container.scrollHeight;
  }

  /* ===================== ACCURACY ===================== */
  _renderAccuracy() {
    const wAcc = Engine.accuracy(this.cpLossWhite);
    const bAcc = Engine.accuracy(this.cpLossBlack);
    document.getElementById('whiteAcc').textContent = wAcc.toFixed(1) + '%';
    document.getElementById('blackAcc').textContent = bAcc.toFixed(1) + '%';

    // Count grades
    const wGrades = {}, bGrades = {};
    this.moveGrades.forEach((g, i) => {
      if (!g) return;
      const isWhite = (i % 2 === 0);
      const target = isWhite ? wGrades : bGrades;
      target[g] = (target[g] || 0) + 1;
    });

    const renderGrades = (obj, el) => {
      const order = ['brilliant','best','excellent','good','inaccuracy','mistake','blunder'];
      const chips = order.filter(g => obj[g]).map(g =>
        `<span class="grade-chip" style="background:${Engine.gradeColor(g)}">${obj[g]} ${Engine.gradeLabel(g)}</span>`
      ).join('');
      document.getElementById(el).innerHTML = chips;
    };
    renderGrades(wGrades, 'whiteGrades');
    renderGrades(bGrades, 'blackGrades');
  }

  /* ===================== EVAL GRAPH ===================== */
  _drawEvalGraph() {
    const canvas = document.getElementById('evalGraph');
    const ctx = canvas.getContext('2d');
    const W = canvas.offsetWidth || 288, H = canvas.offsetHeight || 72;
    canvas.width = W; canvas.height = H;

    const evals = this.evalHistory;
    if (!evals.length) return;

    ctx.clearRect(0,0,W,H);

    // Background
    ctx.fillStyle = '#0f1117';
    ctx.fillRect(0,0,W,H);

    // Zero line
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.setLineDash([3,4]);
    ctx.beginPath(); ctx.moveTo(0,H/2); ctx.lineTo(W,H/2); ctx.stroke();
    ctx.setLineDash([]);

    if (evals.length < 2) return;

    const clamp = v => Math.max(-600, Math.min(600, v));
    const toY = v => H/2 - (clamp(v)/600)*(H/2 - 6);
    const toX = i => (i / (evals.length-1)) * W;

    // White advantage fill
    ctx.beginPath();
    ctx.moveTo(toX(0), H/2);
    for (let i=0; i<evals.length; i++) ctx.lineTo(toX(i), toY(evals[i]));
    ctx.lineTo(toX(evals.length-1), H/2);
    ctx.closePath();
    ctx.fillStyle = 'rgba(241,245,249,0.12)';
    ctx.fill();

    // Blue advantage fill (negative = black advantage)
    ctx.beginPath();
    ctx.moveTo(toX(0), H/2);
    for (let i=0; i<evals.length; i++) ctx.lineTo(toX(i), toY(evals[i]));
    ctx.lineTo(toX(evals.length-1), H/2);
    ctx.closePath();
    ctx.fillStyle = 'rgba(14,165,233,0.15)';
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(evals[0]));
    for (let i=1; i<evals.length; i++) ctx.lineTo(toX(i), toY(evals[i]));
    ctx.strokeStyle = '#0ea5e9';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Current position marker
    if (this.currentPly < evals.length) {
      const x = toX(this.currentPly), y = toY(evals[this.currentPly]);
      ctx.beginPath();
      ctx.arc(x,y,4,0,Math.PI*2);
      ctx.fillStyle = '#fff';
      ctx.fill();
    }

    // Click to navigate
    canvas.onclick = e => {
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const ply = Math.round(x * (evals.length-1));
      this._goToPly(Math.max(0, Math.min(this.snapshots.length-1, ply)));
      this._drawEvalGraph();
    };
  }

  /* ===================== PROGRESS ===================== */
  _showProgress(show, total) {
    const el = document.getElementById('progressOverlay');
    el.classList.toggle('active', show);
    if (show) {
      this._progressTotal = total;
      document.getElementById('progBar').style.width = '0%';
      document.getElementById('progStat').textContent = '0 / ' + total;
    }
  }
  _hideProgress() { document.getElementById('progressOverlay').classList.remove('active'); }
  _updateProgress(done, total) {
    const pct = (done/total*100).toFixed(0);
    document.getElementById('progBar').style.width = pct + '%';
    document.getElementById('progStat').textContent = `${done} / ${total} positions`;
  }

  /* ===================== PAGE SWITCHING ===================== */
  showLanding() {
    document.getElementById('landingPage').style.display = 'flex';
    document.getElementById('analysisPage').classList.remove('active');
  }

  showAnalysis() {
    document.getElementById('landingPage').style.display = 'none';
    document.getElementById('analysisPage').classList.add('active');
    setTimeout(() => this._drawEvalGraph(), 100);
  }

  /* ===================== FEN ===================== */
  _updateFen() {
    document.getElementById('fenInput').value = this.chess.fen();
  }

  /* ===================== BIND EVENTS ===================== */
  _bind() {
    // Import tabs
    document.querySelectorAll('.import-tab').forEach(tab => {
      tab.onclick = () => {
        document.querySelectorAll('.import-tab').forEach(t=>t.classList.remove('active'));
        document.querySelectorAll('.import-pane').forEach(p=>p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('pane-'+tab.dataset.tab).classList.add('active');
      };
    });

    // Analyze button
    document.getElementById('btnAnalyze').onclick = () => this._handleAnalyze();
    document.getElementById('fenAnalyzeBtn').onclick = () => this._loadFenFromLanding();

    // Back to landing
    document.getElementById('btnBack').onclick = () => this.showLanding();
    document.getElementById('topbarBrand').onclick = () => this.showLanding();

    // Flip / Reset
    document.getElementById('btnFlip').onclick = () => { this.flipped = !this.flipped; this.renderBoard(); };
    document.getElementById('btnReset').onclick = () => this._resetBoard();

    // Navigation
    document.getElementById('navFirst').onclick = () => this._goToPly(0);
    document.getElementById('navPrev').onclick  = () => this._goToPly(Math.max(0, this.currentPly-1));
    document.getElementById('navPlay').onclick  = () => this._togglePlay();
    document.getElementById('navNext').onclick  = () => this._goToPly(Math.min(this.snapshots.length-1, this.currentPly+1));
    document.getElementById('navLast').onclick  = () => this._goToPly(this.snapshots.length-1);

    // FEN
    document.getElementById('btnLoadFen').onclick  = () => this._loadFen();
    document.getElementById('btnCopyFen').onclick  = () => { navigator.clipboard.writeText(this.chess.fen()).then(()=>this.toast('FEN copied')); };
    document.getElementById('fenInput').addEventListener('keydown', e=>{ if(e.key==='Enter') this._loadFen(); });

    // Copy PGN
    document.getElementById('btnCopyPgn').onclick = () => this._copyPgn();

    // Depth slider
    document.getElementById('depthSlider').oninput = e => {
      document.getElementById('depthVal').textContent = e.target.value;
      this._triggerLiveAnalysis();
    };

    // Keyboard
    document.addEventListener('keydown', e => {
      if (e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA') return;
      if (e.key==='ArrowLeft')  this._goToPly(Math.max(0,this.currentPly-1));
      if (e.key==='ArrowRight') this._goToPly(Math.min(this.snapshots.length-1,this.currentPly+1));
      if (e.key==='Home')  this._goToPly(0);
      if (e.key==='End')   this._goToPly(this.snapshots.length-1);
      if (e.key==='f')     { this.flipped=!this.flipped; this.renderBoard(); }
    });

    // Sample PGN button
    document.getElementById('btnSample').onclick = () => {
      document.querySelectorAll('.import-tab').forEach(t=>t.classList.remove('active'));
      document.querySelectorAll('.import-pane').forEach(p=>p.classList.remove('active'));
      document.querySelector('[data-tab="pgn"]').classList.add('active');
      document.getElementById('pane-pgn').classList.add('active');
      document.getElementById('pgnInput').value = `[Event "Sample Game"]
[White "Kasparov"]
[Black "Deep Blue"]
[Result "1-0"]

1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Bg5 e6 7. f4 Be7
8. Qf3 Qc7 9. O-O-O Nbd7 10. g4 b5 11. Bxf6 Nxf6 12. g5 Nd7 13. f5 Nc5
14. f6 gxf6 15. gxf6 Bf8 16. Rg1 h5 17. Be2 b4 18. Nd5 exd5 19. exd5 Bd7
20. Nf5 O-O-O 21. Nxd6+ Bxd6 22. Rxg8 Rxg8 23. Qxf7 1-0`;
    };
  }

  async _handleAnalyze() {
    const activeTab = document.querySelector('.import-tab.active')?.dataset.tab;
    if (activeTab === 'pgn') {
      const pgn = document.getElementById('pgnInput').value.trim();
      if (!pgn) { this.toast('Paste a PGN first', true); return; }
      this._pgn = pgn;
      // Extract player names
      const wMatch = pgn.match(/\[White "([^"]+)"\]/);
      const bMatch = pgn.match(/\[Black "([^"]+)"\]/);
      const white = wMatch?.[1] || 'White';
      const black = bMatch?.[1] || 'Black';
      document.getElementById('gamePlayers').innerHTML = `<strong>${white}</strong> vs <strong>${black}</strong>`;
      await this.runFullAnalysis(pgn);
    } else if (activeTab === 'fen') {
      this._loadFenFromLanding();
    }
  }

  _loadFenFromLanding() {
    const fen = document.getElementById('fenInputLanding').value.trim();
    if (!fen) { this.toast('Enter a FEN position', true); return; }
    const ok = this.chess.load(fen);
    if (!ok) { this.toast('Invalid FEN', true); return; }
    this.snapshots = [fen];
    this.currentPly = 0;
    this._cachedHistory = [];
    this.showAnalysis();
    this.renderBoard();
    this._triggerLiveAnalysis();
  }

  _loadFen() {
    const fen = document.getElementById('fenInput').value.trim();
    if (!fen) return;
    const ok = this.chess.load(fen);
    if (!ok) { this.toast('Invalid FEN', true); return; }
    this.snapshots = [fen];
    this.currentPly = 0;
    this.selected = null; this.legalTargets = [];
    this.lastMove = null;
    this._cachedHistory = [];
    this.renderBoard();
    this._updateFen();
    this._triggerLiveAnalysis();
    this.toast('Position loaded');
  }

  _resetBoard() {
    this.chess = new Chess();
    this.snapshots = [Chess.START];
    this.currentPly = 0;
    this.selected = null; this.legalTargets = [];
    this.lastMove = null;
    this.moveGrades = [];
    this.evalHistory = [];
    this.cpLossWhite = [];
    this.cpLossBlack = [];
    this._cachedHistory = [];
    this.engineLines = {};
    if (this.playing) this._togglePlay();
    this.renderBoard();
    this._updateMovesList([]);
    this._updateFen();
    document.getElementById('whiteAcc').textContent = '—';
    document.getElementById('blackAcc').textContent = '—';
    document.getElementById('whiteGrades').innerHTML = '';
    document.getElementById('blackGrades').innerHTML = '';
    document.getElementById('evalGraph').getContext('2d').clearRect(0,0,999,999);
    this._triggerLiveAnalysis();
  }

  _togglePlay() {
    this.playing = !this.playing;
    const btn = document.getElementById('navPlay');
    if (this.playing) {
      btn.textContent = '⏸'; btn.classList.add('playing');
      this.playTimer = setInterval(() => {
        if (this.currentPly >= this.snapshots.length-1) { this._togglePlay(); return; }
        this._goToPly(this.currentPly+1);
        this._drawEvalGraph();
      }, 1000);
    } else {
      btn.textContent = '▶'; btn.classList.remove('playing');
      clearInterval(this.playTimer);
    }
  }

  _copyPgn() {
    const hist = this._cachedHistory || [];
    const pgn = hist.map((h,i) => (h.color==='w' ? `${Math.ceil((i+1)/2)}. ` : '') + h.san).join(' ').trim();
    if (!pgn) { this.toast('No moves to copy'); return; }
    navigator.clipboard.writeText(pgn).then(() => this.toast('PGN copied!'));
  }

  toast(msg, error=false) {
    document.querySelectorAll('.toast').forEach(t=>t.remove());
    const el = document.createElement('div');
    el.className = 'toast' + (error ? ' error' : '');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2800);
  }
}

document.addEventListener('DOMContentLoaded', () => { window.app = new ChessCalc(); });
