/* ChessCalc App - Main */
const P = {K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙',k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'};

class App {
  constructor() {
    this.chess       = new Chess();
    this.engine      = new Engine();
    this.flipped     = false;
    this.selected    = null;
    this.targets     = [];
    this.lastMove    = null;
    this.snaps       = [Chess.START];   // FEN per ply
    this.ply         = 0;               // current displayed ply
    this.history     = [];              // move history objects
    this.grades      = [];              // grade per move index
    this.evalHist    = [];              // white-pov cp per ply
    this.lossW       = [];
    this.lossB       = [];
    this.engineLines = {};
    this.playing     = false;
    this.playTimer   = null;
    this.pendingPromo= null;

    // Chess.com panel state
    this.ccUsername  = '';
    this.ccGames     = [];
    this.ccFilter    = 'all';

    this._initEngine();
    this._bindAll();
    this.showLanding();
  }

  /* ═══════════════ ENGINE ═══════════════ */
  async _initEngine() {
    const dot = document.getElementById('eDot');
    const txt = document.getElementById('eTxt');
    dot.className = 'e-dot loading';
    txt.textContent = 'Loading engine…';

    this.engine.onError = (msg) => {
      dot.className = 'e-dot error';
      txt.textContent = 'Engine offline';
      document.getElementById('engineLines').innerHTML =
        `<div style="color:#f87171;font-size:12px;padding:4px">⚠ ${msg}</div>`;
    };

    const ok = await this.engine.init();
    if (ok) {
      dot.className = 'e-dot ready';
      txt.textContent = 'Stockfish ready';
      this.engine.addListener(l => this._onEngineLine(l));
      this._analyze();
    }
  }

  _onEngineLine(line) {
    if (line.startsWith('info') && line.includes(' pv ')) {
      const info = Engine.parseInfo(line);
      if (!info) return;
      this.engineLines[info.multipv || 1] = info;
      this._renderLines();
      if ((info.multipv === 1 || !info.multipv) && info.score) {
        this._renderEval(info.score);
      }
    }
    if (line.startsWith('bestmove')) {
      const bm = line.split(' ')[1];
      if (bm && bm !== '(none)') {
        const el = document.getElementById('bestMove');
        if (el) el.textContent = bm;
      }
    }
  }

  _analyze() {
    if (!this.engine.ready) return;
    this.engineLines = {};
    const depth = +document.getElementById('depthSlider').value;
    this.engine.analyze(this.chess.fen(), depth, 3);
  }

  _renderEval(score) {
    // score.value is from the side to move (UCI standard)
    // Convert to white POV for bar
    const c = this.chess.turn;
    const whitePovCp = c === 'w' ? Engine.whiteCp(score) : -Engine.whiteCp(score);
    const pct = Engine.evalBar(whitePovCp);

    // Display from the current side's perspective
    const displayStr = Engine.formatEval(score, c);
    const numEl = document.getElementById('evalNum');
    numEl.textContent = displayStr;
    numEl.className = 'eval-num' + (whitePovCp > 30 ? ' adv-white' : whitePovCp < -30 ? ' adv-black' : '');
    document.getElementById('evalBarFill').style.width = pct + '%';

    const info1 = this.engineLines[1];
    document.getElementById('evalDepth').textContent = info1?.depth || '—';
    document.getElementById('evalTurn').textContent = c === 'w' ? 'White' : 'Black';

    let status = '';
    if (this.chess.isCheckmate()) status = 'Checkmate';
    else if (this.chess.isStalemate()) status = 'Stalemate';
    else if (this.chess.isDraw()) status = 'Draw';
    else if (this.chess.inCheck()) status = '⚠ Check';
    document.getElementById('evalStatus').textContent = status;
    document.getElementById('evalStatus').style.color = status.includes('Check') ? '#f87171' : '';
  }

  _renderLines() {
    const entries = Object.entries(this.engineLines).sort((a,b) => +a[0]-+b[0]);
    if (!entries.length) return;
    const c = this.chess.turn;
    document.getElementById('engineLines').innerHTML = entries.map(([, info]) => {
      const score = Engine.formatEval(info.score, c);
      const moves = (info.pv || '').split(' ');
      const html = moves.slice(0,10).map((m,i) =>
        `<span class="${i===0?'pv-1':''}">${m}</span>`
      ).join(' ');
      return `<div class="e-line">
        <div class="e-line-score">${score}</div>
        <div class="e-line-moves">${html}</div>
      </div>`;
    }).join('');
  }

  /* ═══════════════ FULL ANALYSIS PIPELINE ═══════════════ */
  async runAnalysis(pgnStr) {
    // Parse PGN
    const temp = new Chess();
    if (!temp.loadPgn(pgnStr) || !temp.history.length) {
      this.toast('Could not parse PGN — check the format', true); return;
    }

    // Build snapshots by replaying
    const hist = temp.history;
    this.history = hist;
    const snaps = [Chess.START];
    const replay = new Chess();
    for (const h of hist) {
      replay.move(h.move.from, h.move.to, h.move.promotion);
      snaps.push(replay.fen());
    }
    this.snaps = snaps;
    this.grades = new Array(hist.length).fill(null);
    this.evalHist = [];
    this.lossW = [];
    this.lossB = [];

    // Load last position and show board
    this.ply = snaps.length - 1;
    this.chess = new Chess(snaps[this.ply]);
    this.lastMove = hist.length ? { from: hist[hist.length-1].from, to: hist[hist.length-1].to } : null;
    this.showAnalysis();
    this._renderMoves();

    if (!this.engine.ready) {
      this.toast('Engine not ready — showing game without grades'); return;
    }

    this._showProgress(true, snaps.length);

    // Evaluate every position
    const evals = [];
    for (let i = 0; i < snaps.length; i++) {
      const info = await this.engine.evaluateFen(snaps[i], 14);
      const c = new Chess(snaps[i]).turn;
      // Convert to white POV
      let wpCp = 0;
      if (info?.score) {
        const raw = Engine.whiteCp(info.score);
        wpCp = c === 'w' ? raw : -raw;
      }
      evals.push(wpCp);
      this.evalHist.push(wpCp);
      this._updateProgress(i + 1, snaps.length);
    }

    // Grade moves
    for (let i = 1; i < snaps.length; i++) {
      const h = hist[i - 1];
      const moverWhite = h.color === 'w';
      // From mover's perspective
      const prevAdv = moverWhite ? evals[i-1] : -evals[i-1];
      const afterAdv = moverWhite ? evals[i] : -evals[i];
      const loss = Math.max(0, prevAdv - afterAdv);
      this.grades[i-1] = Engine.gradeMove(loss);
      if (moverWhite) this.lossW.push(loss);
      else this.lossB.push(loss);
    }

    this._hideProgress();
    this.chess = new Chess(snaps[this.ply]);
    this.renderBoard();
    this._renderMoves();
    this._renderAccuracy();
    this._drawGraph();
    this._updateMoveBanner(this.ply);
    this._analyze();
    this.toast('Analysis complete ✓');
  }

  /* ═══════════════ BOARD ═══════════════ */
  renderBoard() {
    const el = document.getElementById('chessboard');
    el.innerHTML = '';
    const b = this.chess.board;

    for (let vr = 0; vr < 8; vr++) {
      for (let vc = 0; vc < 8; vc++) {
        const r = this.flipped ? 7-vr : vr;
        const c = this.flipped ? 7-vc : vc;
        const light = (r+c)%2===0;
        const sq = document.createElement('div');
        sq.className = 'sq ' + (light ? 'light' : 'dark');
        sq.dataset.r = r; sq.dataset.c = c;

        if (this.selected?.[0]===r && this.selected?.[1]===c) sq.classList.add('selected');
        if (this.lastMove) {
          const a = String.fromCharCode(97+c)+(8-r);
          if (a===this.lastMove.from) sq.classList.add('last-from');
          if (a===this.lastMove.to)   sq.classList.add('last-to');

          // Grade badge on destination square
          if (a===this.lastMove.to && this.ply > 0) {
            const g = this.grades[this.ply-1];
            const sym = Engine.gradeSymbol(g);
            if (g && sym) {
              const badge = document.createElement('div');
              badge.className = 'sq-badge';
              badge.textContent = sym;
              badge.style.color = Engine.gradeColor(g);
              sq.appendChild(badge);
            }
          }
        }
        if (this.chess.inCheck()) {
          const k = this.chess._findKing(this.chess.turn);
          if (k?.[0]===r && k?.[1]===c) sq.classList.add('check');
        }

        const piece = b[r][c];
        if (piece) {
          const pe = document.createElement('div');
          pe.className = 'piece'; pe.textContent = P[piece];
          pe.addEventListener('click', e => { e.stopPropagation(); this._click(r,c); });
          pe.draggable = true;
          pe.addEventListener('dragstart', e => {
            this._click(r,c); e.dataTransfer.setData('text','');
          });
          sq.appendChild(pe);
        }
        if (this.targets.some(t=>t[0]===r&&t[1]===c)) {
          const dot = document.createElement('div');
          dot.className = 'move-dot'+(piece?' cap':'');
          sq.appendChild(dot);
        }

        sq.addEventListener('click', () => this._click(r,c));
        sq.addEventListener('dragover', e => e.preventDefault());
        sq.addEventListener('drop', e => { e.preventDefault(); this._click(r,c); });
        el.appendChild(sq);
      }
    }
    this._updateLabels();
    this._updateFen();
  }

  _updateLabels() {
    const rs = this.flipped ? ['1','2','3','4','5','6','7','8'] : ['8','7','6','5','4','3','2','1'];
    const fs = this.flipped ? ['h','g','f','e','d','c','b','a'] : ['a','b','c','d','e','f','g','h'];
    document.getElementById('rankLabels').innerHTML = rs.map(r=>`<div>${r}</div>`).join('');
    document.getElementById('fileLabels').innerHTML = fs.map(f=>`<div>${f}</div>`).join('');
  }

  _click(r, c) {
    const piece = this.chess.board[r][c];
    const col = this.chess.turn;
    if (this.selected) {
      const [sr,sc] = this.selected;
      if (sr===r && sc===c) { this.selected=null; this.targets=[]; this.renderBoard(); return; }
      if (this.targets.some(t=>t[0]===r&&t[1]===c)) { this._tryMove([sr,sc],[r,c]); return; }
    }
    if (piece && (this.chess._isW(piece)?'w':'b')===col) {
      this.selected=[r,c];
      this.targets=this.chess.legalMoves([r,c]).map(m=>m.to);
      this.renderBoard(); return;
    }
    this.selected=null; this.targets=[]; this.renderBoard();
  }

  _tryMove(from, to) {
    const ms = this.chess.legalMoves(from);
    if (ms.filter(m=>m.to[0]===to[0]&&m.to[1]===to[1]&&m.promotion).length) {
      this._showPromo(from, to); return;
    }
    const res = this.chess.move(from, to);
    this._afterMove(res);
  }

  _afterMove(res) {
    if (!res || res==='promotion') return;
    this.selected=null; this.targets=[];
    this.lastMove={ from:res.from, to:res.to };
    // Trim future & push
    this.snaps = this.snaps.slice(0, this.ply+1);
    this.history = this.history.slice(0, this.ply);
    this.grades = this.grades.slice(0, this.ply);
    this.snaps.push(this.chess.fen());
    this.history.push(res);
    this.grades.push(null);
    this.ply = this.snaps.length-1;
    this.renderBoard();
    this._renderMoves();
    this._updateMoveBanner(this.ply);
    this._analyze();
  }

  _showPromo(from, to) {
    this.pendingPromo={ from, to };
    const col = this.chess.turn;
    const ps = col==='w' ? ['Q','R','B','N'] : ['q','r','b','n'];
    document.getElementById('promoPieces').innerHTML = ps.map(p=>
      `<div class="promo-piece" data-p="${p}">${P[p]}</div>`
    ).join('');
    document.querySelectorAll('.promo-piece').forEach(el => {
      el.onclick = () => {
        document.getElementById('promoOverlay').classList.remove('active');
        const res = this.chess.move(this.pendingPromo.from, this.pendingPromo.to, el.dataset.p);
        this._afterMove(res); this.pendingPromo=null;
      };
    });
    document.getElementById('promoOverlay').classList.add('active');
  }

  /* ═══════════════ NAVIGATION ═══════════════ */
  _goTo(ply) {
    if (ply<0 || ply>=this.snaps.length) return;
    this.chess = new Chess(this.snaps[ply]);
    this.ply = ply;
    this.selected=null; this.targets=[];
    this.lastMove = ply>0 && this.history[ply-1]
      ? { from:this.history[ply-1].from, to:this.history[ply-1].to } : null;
    this.renderBoard();
    this._highlightMove(ply);
    this._updateMoveBanner(ply);
    this._analyze();
    this._drawGraph();
  }

  _updateMoveBanner(ply) {
    const banner = document.getElementById('moveBanner');
    if (!banner) return;
    if (ply === 0 || !this.history[ply-1]) {
      banner.style.display = 'none'; return;
    }
    const h = this.history[ply-1];
    const g = this.grades[ply-1];
    if (!g) { banner.style.display = 'none'; return; }
    const col = Engine.gradeColor(g);
    const sym = Engine.gradeSymbol(g);
    const label = Engine.gradeLabel(g);
    banner.style.display = 'flex';
    banner.style.borderColor = col + '44';
    banner.style.background = col + '12';
    banner.innerHTML = `
      <span class="mb-move" style="color:var(--text)">${h.color==='w'?'White':'Black'}: <strong>${h.san}</strong></span>
      <span class="mb-grade" style="color:${col}">${sym ? sym+' ' : ''}${label}</span>
    `;
  }

  _highlightMove(ply) {
    document.querySelectorAll('.m-cell').forEach(el =>
      el.classList.toggle('active', +el.dataset.ply===ply)
    );
    document.querySelector('.m-cell.active')?.scrollIntoView({ block:'nearest', behavior:'smooth' });
  }

  /* ═══════════════ MOVE LIST ═══════════════ */
  _renderMoves() {
    const hist = this.history;
    if (!hist.length) {
      document.getElementById('movesList').innerHTML =
        '<div style="color:var(--text3);font-size:12px;padding:8px 0">No moves yet — paste a PGN or play on the board</div>';
      return;
    }

    // Icons for each grade
    const ICON = { brilliant:'!!', best:'✓', excellent:'!', good:'·', inaccuracy:'?!', mistake:'?', blunder:'??' };

    let html = '';
    for (let i = 0; i < hist.length; i += 2) {
      const num = Math.floor(i / 2) + 1;
      const w  = hist[i],     b  = hist[i+1];
      const wp = i + 1,       bp = i + 2;
      const wg = this.grades[i], bg = this.grades[i+1];

      const cell = (h, g, plyIdx) => {
        if (!h) return `<span class="m-cell" data-ply="${plyIdx}"></span>`;
        const isActive = this.ply === plyIdx;
        const col  = Engine.gradeColor(g);
        const icon = ICON[g] || '';
        const label = Engine.gradeLabel(g);
        return `<span class="m-cell${isActive ? ' active' : ''}" data-ply="${plyIdx}" title="${label}">
          <span class="m-san">${h.san}</span>
          ${g ? `<span class="m-icon" style="color:${isActive ? '#fff' : col};opacity:${isActive?'0.9':'1'}">${icon}</span>` : ''}
        </span>`;
      };

      html += `<div class="move-pair">
        <span class="m-num">${num}.</span>
        ${cell(w,  wg, wp)}
        ${cell(b,  bg, bp)}
      </div>`;
    }

    const el = document.getElementById('movesList');
    el.innerHTML = html;
    el.querySelectorAll('.m-cell[data-ply]').forEach(c =>
      c.addEventListener('click', () => this._goTo(+c.dataset.ply))
    );
    const active = el.querySelector('.m-cell.active');
    if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  /* ═══════════════ ACCURACY ═══════════════ */
  _renderAccuracy() {
    const wa = Engine.accuracy(this.lossW);
    const ba = Engine.accuracy(this.lossB);
    document.getElementById('whiteAcc').textContent = wa.toFixed(1)+'%';
    document.getElementById('whiteAcc').className = 'acc-pct';
    document.getElementById('blackAcc').textContent = ba.toFixed(1)+'%';
    document.getElementById('blackAcc').className = 'acc-pct';

    const count = (isW) => {
      const counts = {};
      this.grades.forEach((g, i) => {
        if (!g) return;
        const moveIsWhite = (i % 2 === 0);
        if (moveIsWhite === isW) counts[g] = (counts[g]||0) + 1;
      });
      return counts;
    };

    const chips = (obj) => {
      const order = ['brilliant','best','excellent','good','inaccuracy','mistake','blunder'];
      return order.filter(g => obj[g]).map(g => {
        const col = Engine.gradeColor(g);
        const sym = Engine.gradeSymbol(g);
        return `<span class="grade-chip" style="background:${col}20;color:${col};border:1px solid ${col}40">
          <span style="font-weight:800">${obj[g]}</span>
          <span>${sym ? sym+' ' : ''}${Engine.gradeLabel(g)}</span>
        </span>`;
      }).join('');
    };

    document.getElementById('wGrades').innerHTML = chips(count(true));
    document.getElementById('bGrades').innerHTML = chips(count(false));
  }

  /* ═══════════════ EVAL GRAPH ═══════════════ */
  _drawGraph() {
    const canvas = document.getElementById('evalGraph');
    const W = canvas.offsetWidth || 280, H = 68;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const evals = this.evalHist;

    ctx.clearRect(0,0,W,H);
    ctx.fillStyle = '#1e2538'; ctx.fillRect(0,0,W,H);

    // Zero line
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.setLineDash([3,4]);
    ctx.beginPath(); ctx.moveTo(0,H/2); ctx.lineTo(W,H/2); ctx.stroke();
    ctx.setLineDash([]);

    if (evals.length < 2) { canvas.onclick=null; return; }

    const clamp = v => Math.max(-600, Math.min(600, v));
    const toY = v => H/2 - (clamp(v)/600)*(H/2-5);
    const toX = i => (i/(evals.length-1))*W;

    // White area
    ctx.beginPath(); ctx.moveTo(toX(0),H/2);
    evals.forEach((v,i) => { if(v>0) ctx.lineTo(toX(i),toY(v)); else ctx.lineTo(toX(i),H/2); });
    ctx.lineTo(toX(evals.length-1),H/2); ctx.closePath();
    ctx.fillStyle='rgba(225,234,254,0.18)'; ctx.fill();

    // Blue (black adv) area
    ctx.beginPath(); ctx.moveTo(toX(0),H/2);
    evals.forEach((v,i) => { if(v<0) ctx.lineTo(toX(i),toY(v)); else ctx.lineTo(toX(i),H/2); });
    ctx.lineTo(toX(evals.length-1),H/2); ctx.closePath();
    ctx.fillStyle='rgba(59,130,246,0.2)'; ctx.fill();

    // Line
    ctx.beginPath(); ctx.moveTo(toX(0),toY(evals[0]));
    evals.forEach((v,i) => ctx.lineTo(toX(i),toY(v)));
    ctx.strokeStyle='#3b82f6'; ctx.lineWidth=2; ctx.stroke();

    // Cursor dot
    if (this.ply < evals.length) {
      const x=toX(this.ply), y=toY(evals[this.ply]);
      ctx.beginPath(); ctx.arc(x,y,4,0,Math.PI*2);
      ctx.fillStyle='#fff'; ctx.fill();
    }

    canvas.onclick = e => {
      const rect = canvas.getBoundingClientRect();
      const frac = (e.clientX-rect.left)/rect.width;
      const p = Math.round(frac*(evals.length-1));
      this._goTo(Math.max(0,Math.min(this.snaps.length-1,p)));
      this._drawGraph();
    };
  }

  /* ═══════════════ CHESS.COM PANEL ═══════════════ */
  _openGamesPanel() {
    document.getElementById('gamesPanel').classList.add('open');
  }
  _closeGamesPanel() {
    document.getElementById('gamesPanel').classList.remove('open');
  }

  async _searchPlayer() {
    const username = document.getElementById('gpInput').value.trim();
    if (!username) return;
    this.ccUsername = username;

    const listEl = document.getElementById('gpGamesList');
    listEl.innerHTML = '<div class="gp-spinner"><div class="spinner"></div></div>';
    document.getElementById('gpPlayerCard').classList.remove('visible');

    try {
      // Fetch player info
      const [player, stats] = await Promise.all([
        ChessComAPI.getPlayer(username).catch(()=>null),
        ChessComAPI.getStats(username).catch(()=>null)
      ]);

      if (player) {
        document.getElementById('gpPlayerName').textContent = player.username || username;
        document.getElementById('gpPlayerSub').textContent =
          `${player.country?.split('/').pop()||''} · Joined ${new Date(player.joined*1000).getFullYear()}`;

        // Ratings
        const ratings = [];
        if (stats?.chess_blitz?.last?.rating) ratings.push(`⚡ ${stats.chess_blitz.last.rating}`);
        if (stats?.chess_rapid?.last?.rating) ratings.push(`⏱ ${stats.chess_rapid.last.rating}`);
        if (stats?.chess_bullet?.last?.rating) ratings.push(`🔥 ${stats.chess_bullet.last.rating}`);
        document.getElementById('gpRatings').innerHTML = ratings.map(r=>
          `<span class="rating-chip">${r}</span>`
        ).join('');
        document.getElementById('gpPlayerCard').classList.add('visible');
      }

      // Fetch recent games
      const archives = await ChessComAPI.getArchives(username);
      if (!archives.length) { listEl.innerHTML='<div class="gp-empty"><div class="gp-empty-icon">📭</div>No games found</div>'; return; }

      // Load most recent 2 months
      const gamesArrays = await Promise.all(
        archives.slice(0,2).map(url => ChessComAPI.getGames(url).catch(()=>[]))
      );
      this.ccGames = gamesArrays.flat().slice(0,60);
      this._renderGames();

    } catch(e) {
      listEl.innerHTML = `<div class="gp-empty"><div class="gp-empty-icon">❌</div>${e.message}</div>`;
    }
  }

  _renderGames() {
    const listEl = document.getElementById('gpGamesList');
    const username = this.ccUsername.toLowerCase();
    let games = this.ccGames;

    // Filter
    if (this.ccFilter !== 'all') {
      games = games.filter(g => g.time_class === this.ccFilter);
    }

    if (!games.length) {
      listEl.innerHTML = '<div class="gp-empty"><div class="gp-empty-icon">♟</div>No games in this category</div>';
      return;
    }

    listEl.innerHTML = games.slice(0,40).map((g, idx) => {
      const result = ChessComAPI.resultLabel(g, username);
      const rc = ChessComAPI.resultColor(result);
      const white = g.white?.username || '?';
      const black = g.black?.username || '?';
      const wRating = g.white?.rating ? ` (${g.white.rating})` : '';
      const bRating = g.black?.rating ? ` (${g.black.rating})` : '';
      const timeLabel = ChessComAPI.timeLabel(g.time_class, g.time_control);
      const dateStr = ChessComAPI.formatDate(g.end_time);

      return `<div class="game-card" data-idx="${idx}">
        <div class="gc-top">
          <div class="gc-result" style="background:${rc}22;color:${rc};border:1px solid ${rc}44">${result}</div>
          <div class="gc-players">
            <div class="gc-white">♔ ${white}${wRating}</div>
            <div class="gc-black">♚ ${black}${bRating}</div>
          </div>
          <button class="gc-analyze-btn" data-idx="${idx}">Analyse →</button>
        </div>
        <div class="gc-meta">
          <span>${timeLabel}</span>
          <span>📅 ${dateStr}</span>
          ${g.time_control ? `<span>⏱ ${g.time_control}</span>` : ''}
        </div>
      </div>`;
    }).join('');

    listEl.querySelectorAll('.gc-analyze-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const game = games[+btn.dataset.idx];
        if (game?.pgn) {
          const w = game.white?.username||'White';
          const bk = game.black?.username||'Black';
          document.getElementById('gameTitle').innerHTML =
            `<strong>${w}</strong> vs <strong>${bk}</strong>`;
          this._closeGamesPanel();
          this.runAnalysis(game.pgn);
        } else {
          this.toast('No PGN available for this game', true);
        }
      });
    });
  }

  /* ═══════════════ PROGRESS ═══════════════ */
  _showProgress(show, total=0) {
    document.getElementById('progressOverlay').classList.toggle('active', show);
    if (show) { document.getElementById('progBar').style.width='0%'; document.getElementById('progStat').textContent=`0 / ${total}`; }
  }
  _hideProgress() { document.getElementById('progressOverlay').classList.remove('active'); }
  _updateProgress(done, total) {
    document.getElementById('progBar').style.width = (done/total*100)+'%';
    document.getElementById('progStat').textContent = `${done} / ${total} positions`;
  }

  /* ═══════════════ PAGE SWITCHING ═══════════════ */
  showLanding() {
    document.getElementById('landingPage').style.display='flex';
    document.getElementById('analysisPage').classList.remove('active');
    document.getElementById('gamesPanel').classList.remove('open');
  }
  showAnalysis() {
    document.getElementById('landingPage').style.display='none';
    document.getElementById('analysisPage').classList.add('active');
    this.renderBoard();
    setTimeout(()=>this._drawGraph(),100);
  }

  /* ═══════════════ FEN ═══════════════ */
  _updateFen() {
    const el = document.getElementById('fenInput');
    if (el) el.value = this.chess.fen();
  }
  _loadFen() {
    const fen = document.getElementById('fenInput').value.trim();
    if (!fen) return;
    if (!this.chess.load(fen)) { this.toast('Invalid FEN',true); return; }
    this.snaps=[fen]; this.ply=0; this.history=[]; this.grades=[];
    this.evalHist=[]; this.lossW=[]; this.lossB=[];
    this.selected=null; this.targets=[]; this.lastMove=null;
    this.renderBoard(); this._renderMoves(); this._analyze();
    this.toast('Position loaded');
  }

  /* ═══════════════ RESET ═══════════════ */
  _reset() {
    this.chess=new Chess(); this.snaps=[Chess.START]; this.ply=0;
    this.history=[]; this.grades=[]; this.evalHist=[]; this.lossW=[]; this.lossB=[];
    this.selected=null; this.targets=[]; this.lastMove=null; this.engineLines={};
    if(this.playing)this._togglePlay();
    this.renderBoard(); this._renderMoves();
    document.getElementById('whiteAcc').textContent='—';
    document.getElementById('whiteAcc').className='acc-pct pending';
    document.getElementById('blackAcc').textContent='—';
    document.getElementById('blackAcc').className='acc-pct pending';
    document.getElementById('wGrades').innerHTML='';
    document.getElementById('bGrades').innerHTML='';
    const cv=document.getElementById('evalGraph');
    cv.getContext('2d').clearRect(0,0,cv.width,cv.height);
    this._analyze();
  }

  _togglePlay() {
    this.playing=!this.playing;
    const btn=document.getElementById('navPlay');
    if(this.playing){
      btn.classList.add('playing'); btn.textContent='⏸';
      this.playTimer=setInterval(()=>{
        if(this.ply>=this.snaps.length-1){this._togglePlay();return;}
        this._goTo(this.ply+1); this._drawGraph();
      },1000);
    } else {
      btn.classList.remove('playing'); btn.textContent='▶';
      clearInterval(this.playTimer);
    }
  }

  /* ═══════════════ BIND ═══════════════ */
  _bindAll() {
    // Landing tabs
    document.querySelectorAll('.i-tab').forEach(tab => {
      tab.onclick = () => {
        document.querySelectorAll('.i-tab').forEach(t=>t.classList.remove('active'));
        document.querySelectorAll('.i-pane').forEach(p=>p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('pane-'+tab.dataset.tab).classList.add('active');
      };
    });

    // Landing analyze
    document.getElementById('btnAnalyze').onclick = () => this._handleLandingAnalyze();
    document.getElementById('btnFenLoad').onclick = () => this._loadFenFromLanding();
    document.getElementById('btnFreeBoard').onclick = () => { this.showAnalysis(); this._analyze(); };
    document.getElementById('btnSample').onclick = () => this._loadSample();

    // Analysis topbar
    document.getElementById('btnBack').onclick = () => this.showLanding();
    document.getElementById('topBrand').onclick = () => this.showLanding();
    document.getElementById('btnCopyPgn').onclick = () => this._copyPgn();
    document.getElementById('btnOpenGames').onclick = () => this._openGamesPanel();

    // Games panel
    document.getElementById('gpClose').onclick = () => this._closeGamesPanel();
    document.getElementById('gpSearchBtn').onclick = () => this._searchPlayer();
    document.getElementById('gpInput').addEventListener('keydown', e => { if(e.key==='Enter') this._searchPlayer(); });
    document.querySelectorAll('.gp-filter').forEach(f => {
      f.onclick = () => {
        document.querySelectorAll('.gp-filter').forEach(x=>x.classList.remove('active'));
        f.classList.add('active'); this.ccFilter=f.dataset.filter; this._renderGames();
      };
    });

    // Board controls
    document.getElementById('btnFlip').onclick = () => { this.flipped=!this.flipped; this.renderBoard(); };
    document.getElementById('btnReset').onclick = () => this._reset();
    document.getElementById('btnLoadFen').onclick = () => this._loadFen();
    document.getElementById('btnCopyFen').onclick = () => {
      navigator.clipboard.writeText(this.chess.fen()).then(()=>this.toast('FEN copied'));
    };
    document.getElementById('fenInput').addEventListener('keydown',e=>{if(e.key==='Enter')this._loadFen();});

    // Nav
    document.getElementById('navFirst').onclick = () => this._goTo(0);
    document.getElementById('navPrev').onclick  = () => this._goTo(Math.max(0,this.ply-1));
    document.getElementById('navPlay').onclick  = () => this._togglePlay();
    document.getElementById('navNext').onclick  = () => this._goTo(Math.min(this.snaps.length-1,this.ply+1));
    document.getElementById('navLast').onclick  = () => this._goTo(this.snaps.length-1);

    // Depth
    document.getElementById('depthSlider').oninput = e => {
      document.getElementById('depthVal').textContent = e.target.value;
      this._analyze();
    };

    // Keyboard
    document.addEventListener('keydown', e => {
      if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA') return;
      if(e.key==='ArrowLeft')  this._goTo(Math.max(0,this.ply-1));
      if(e.key==='ArrowRight') this._goTo(Math.min(this.snaps.length-1,this.ply+1));
      if(e.key==='Home')  this._goTo(0);
      if(e.key==='End')   this._goTo(this.snaps.length-1);
      if(e.key==='f')     { this.flipped=!this.flipped; this.renderBoard(); }
      if(e.key==='Escape') this._closeGamesPanel();
    });
  }

  async _handleLandingAnalyze() {
    const pgn = document.getElementById('pgnInput').value.trim();
    if (!pgn) { this.toast('Paste a PGN first',true); return; }
    const wm = pgn.match(/\[White "([^"]+)"\]/);
    const bm = pgn.match(/\[Black "([^"]+)"\]/);
    document.getElementById('gameTitle').innerHTML =
      `<strong>${wm?.[1]||'White'}</strong> vs <strong>${bm?.[1]||'Black'}</strong>`;
    await this.runAnalysis(pgn);
  }

  _loadFenFromLanding() {
    const fen = document.getElementById('fenInputLanding').value.trim();
    if (!fen) { this.toast('Enter a FEN',true); return; }
    if (!this.chess.load(fen)) { this.toast('Invalid FEN',true); return; }
    this.snaps=[fen]; this.ply=0; this.history=[]; this.grades=[];
    this.evalHist=[]; this.lossW=[]; this.lossB=[];
    this.selected=null; this.targets=[]; this.lastMove=null;
    document.getElementById('gameTitle').innerHTML='FEN Position';
    this.showAnalysis(); this._analyze();
  }

  _loadSample() {
    document.querySelectorAll('.i-tab').forEach(t=>t.classList.remove('active'));
    document.querySelectorAll('.i-pane').forEach(p=>p.classList.remove('active'));
    document.querySelector('[data-tab="pgn"]').classList.add('active');
    document.getElementById('pane-pgn').classList.add('active');
    document.getElementById('pgnInput').value = `[Event "Immortal Game"]
[White "Adolf Anderssen"]
[Black "Lionel Kieseritzky"]
[Result "1-0"]

1. e4 e5 2. f4 exf4 3. Bc4 Qh4+ 4. Kf1 b5 5. Bxb5 Nf6 6. Nf3 Qh6
7. d3 Nh5 8. Nh4 Qg5 9. Nf5 c6 10. g4 Nf6 11. Rg1 cxb5 12. h4 Qg6
13. h5 Qg5 14. Qf3 Ng8 15. Bxf4 Qf6 16. Nc3 Bc5 17. Nd5 Qxb2
18. Bd6 Bxg1 19. e5 Qxa1+ 20. Ke2 Na6 21. Nxg7+ Kd8 22. Qf6+ Nxf6
23. Be7# 1-0`;
  }

  _copyPgn() {
    const pgn = this.history.map((h,i)=>(h.color==='w'?`${Math.ceil((i+1)/2)}. `:'')+h.san).join(' ').trim();
    if (!pgn) { this.toast('No moves yet'); return; }
    navigator.clipboard.writeText(pgn).then(()=>this.toast('PGN copied!'));
  }

  toast(msg, err=false) {
    document.querySelectorAll('.toast').forEach(t=>t.remove());
    const el=document.createElement('div');
    el.className='toast'+(err?' err':'');
    el.textContent=msg;
    document.body.appendChild(el);
    setTimeout(()=>el.remove(),2800);
  }
}

document.addEventListener('DOMContentLoaded', () => { window.app = new App(); });
