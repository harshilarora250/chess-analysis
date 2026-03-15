/* chess.js - Complete chess engine with robust PGN parser */
class Chess {
  constructor(fen) { this.reset(); if (fen) this.load(fen); }
  static get START() { return 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'; }

  reset() {
    this.board = Array(8).fill(null).map(() => Array(8).fill(null));
    this.turn = 'w';
    this.castling = { wK: true, wQ: true, bK: true, bQ: true };
    this.enPassant = null;
    this.halfmove = 0;
    this.fullmove = 1;
    this.history = [];
    this._setBoard('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR');
  }

  _setBoard(pos) {
    this.board = Array(8).fill(null).map(() => Array(8).fill(null));
    pos.split('/').forEach((row, r) => {
      let c = 0;
      for (const ch of row) {
        if (/\d/.test(ch)) c += +ch;
        else this.board[r][c++] = ch;
      }
    });
  }

  load(fen) {
    const p = fen.trim().split(/\s+/);
    if (p.length < 4) return false;
    this._setBoard(p[0]);
    this.turn = p[1];
    this.castling = { wK: p[2].includes('K'), wQ: p[2].includes('Q'), bK: p[2].includes('k'), bQ: p[2].includes('q') };
    this.enPassant = p[3] === '-' ? null : p[3];
    this.halfmove = +(p[4] || 0);
    this.fullmove = +(p[5] || 1);
    this.history = [];
    return true;
  }

  fen() {
    let pos = '';
    for (let r = 0; r < 8; r++) {
      let e = 0;
      for (let c = 0; c < 8; c++) {
        const s = this.board[r][c];
        if (s) { if (e) { pos += e; e = 0; } pos += s; } else e++;
      }
      if (e) pos += e;
      if (r < 7) pos += '/';
    }
    const cast = ((this.castling.wK ? 'K' : '') + (this.castling.wQ ? 'Q' : '') +
      (this.castling.bK ? 'k' : '') + (this.castling.bQ ? 'q' : '')) || '-';
    return `${pos} ${this.turn} ${cast} ${this.enPassant || '-'} ${this.halfmove} ${this.fullmove}`;
  }

  _alg(r, c) { return String.fromCharCode(97 + c) + (8 - r); }
  _sq(a) { return [8 - +a[1], a.charCodeAt(0) - 97]; }
  _isW(p) { return p && p === p.toUpperCase(); }
  _isB(p) { return p && p === p.toLowerCase(); }
  _friend(p, col) { return p && (col === 'w' ? this._isW(p) : this._isB(p)); }
  _enemy(p, col) { return p && (col === 'w' ? this._isB(p) : this._isW(p)); }
  _inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

  _pseudoMoves(r, c) {
    const piece = this.board[r][c];
    if (!piece) return [];
    const col = this._isW(piece) ? 'w' : 'b';
    const moves = [];

    const addIf = (tr, tc, extra = {}) => {
      if (this._inBounds(tr, tc) && !this._friend(this.board[tr][tc], col))
        moves.push({ from: [r, c], to: [tr, tc], ...extra });
    };
    const slide = (dirs) => {
      for (const [dr, dc] of dirs) {
        let [tr, tc] = [r + dr, c + dc];
        while (this._inBounds(tr, tc)) {
          if (this.board[tr][tc]) {
            if (this._enemy(this.board[tr][tc], col)) moves.push({ from: [r, c], to: [tr, tc] });
            break;
          }
          moves.push({ from: [r, c], to: [tr, tc] });
          tr += dr; tc += dc;
        }
      }
    };

    const pt = piece.toLowerCase();
    if (pt === 'p') {
      const dir = col === 'w' ? -1 : 1;
      const startRow = col === 'w' ? 6 : 1;
      const promoRow = col === 'w' ? 0 : 7;
      const tr = r + dir;
      if (this._inBounds(tr, c) && !this.board[tr][c]) {
        if (tr === promoRow) {
          for (const q of ['q','r','b','n'])
            moves.push({ from:[r,c], to:[tr,c], promotion: col==='w' ? q.toUpperCase() : q });
        } else {
          moves.push({ from:[r,c], to:[tr,c] });
          if (r === startRow && !this.board[tr+dir][c])
            moves.push({ from:[r,c], to:[tr+dir,c], epSquare: this._alg(tr,c) });
        }
      }
      for (const dc of [-1, 1]) {
        const tc = c + dc;
        if (!this._inBounds(tr, tc)) continue;
        const tgt = this.board[tr][tc];
        if (this._enemy(tgt, col)) {
          if (tr === promoRow) {
            for (const q of ['q','r','b','n'])
              moves.push({ from:[r,c], to:[tr,tc], promotion: col==='w' ? q.toUpperCase() : q });
          } else {
            moves.push({ from:[r,c], to:[tr,tc] });
          }
        }
        if (this.enPassant && this._alg(tr,tc) === this.enPassant)
          moves.push({ from:[r,c], to:[tr,tc], epCapture:[r,tc] });
      }
    }
    else if (pt === 'n') {
      for (const [dr,dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]])
        addIf(r+dr, c+dc);
    }
    else if (pt === 'b') slide([[-1,-1],[-1,1],[1,-1],[1,1]]);
    else if (pt === 'r') slide([[-1,0],[1,0],[0,-1],[0,1]]);
    else if (pt === 'q') slide([[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]);
    else if (pt === 'k') {
      for (const [dr,dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]])
        addIf(r+dr, c+dc);
      if (col==='w'&&r===7&&c===4) {
        if (this.castling.wK&&!this.board[7][5]&&!this.board[7][6]&&this.board[7][7]==='R')
          moves.push({from:[r,c],to:[7,6],castle:'K'});
        if (this.castling.wQ&&!this.board[7][3]&&!this.board[7][2]&&!this.board[7][1]&&this.board[7][0]==='R')
          moves.push({from:[r,c],to:[7,2],castle:'Q'});
      }
      if (col==='b'&&r===0&&c===4) {
        if (this.castling.bK&&!this.board[0][5]&&!this.board[0][6]&&this.board[0][7]==='r')
          moves.push({from:[r,c],to:[0,6],castle:'k'});
        if (this.castling.bQ&&!this.board[0][3]&&!this.board[0][2]&&!this.board[0][1]&&this.board[0][0]==='r')
          moves.push({from:[r,c],to:[0,2],castle:'q'});
      }
    }
    return moves;
  }

  _findKing(col) {
    const k = col==='w'?'K':'k';
    for (let r=0;r<8;r++) for (let c=0;c<8;c++) if (this.board[r][c]===k) return [r,c];
    return null;
  }

  _isAttacked(r, c, byCol) {
    for (let pr=0;pr<8;pr++) for (let pc=0;pc<8;pc++) {
      const p = this.board[pr][pc];
      if (!p || (this._isW(p)?'w':'b') !== byCol) continue;
      if (this._pseudoMoves(pr,pc).some(m=>m.to[0]===r&&m.to[1]===c)) return true;
    }
    return false;
  }

  _inCheck(col) {
    const k = this._findKing(col);
    return k ? this._isAttacked(k[0],k[1],col==='w'?'b':'w') : false;
  }

  _applyMove(mv) {
    const [fr,fc]=mv.from,[tr,tc]=mv.to,piece=this.board[fr][fc],cap=this.board[tr][tc];
    this.board[tr][tc]=mv.promotion||piece; this.board[fr][fc]=null;
    if (mv.epCapture) this.board[mv.epCapture[0]][mv.epCapture[1]]=null;
    if (mv.castle==='K'){this.board[7][5]='R';this.board[7][7]=null;}
    if (mv.castle==='Q'){this.board[7][3]='R';this.board[7][0]=null;}
    if (mv.castle==='k'){this.board[0][5]='r';this.board[0][7]=null;}
    if (mv.castle==='q'){this.board[0][3]='r';this.board[0][0]=null;}
    return {piece,cap};
  }

  _undoMove(mv, saved) {
    const [fr,fc]=mv.from,[tr,tc]=mv.to;
    this.board[fr][fc]=saved.piece; this.board[tr][tc]=saved.cap;
    if (mv.epCapture) this.board[mv.epCapture[0]][mv.epCapture[1]]=this._isW(saved.piece)?'p':'P';
    if (mv.castle==='K'){this.board[7][7]='R';this.board[7][5]=null;}
    if (mv.castle==='Q'){this.board[7][0]='R';this.board[7][3]=null;}
    if (mv.castle==='k'){this.board[0][7]='r';this.board[0][5]=null;}
    if (mv.castle==='q'){this.board[0][0]='r';this.board[0][3]=null;}
  }

  legalMoves(from) {
    const [fr,fc]=from,piece=this.board[fr][fc];
    if (!piece) return [];
    const col=this._isW(piece)?'w':'b';
    if (col!==this.turn) return [];
    return this._pseudoMoves(fr,fc).filter(mv=>{
      if (mv.castle) {
        const enemy=col==='w'?'b':'w',kr=mv.to[0];
        const cols=(mv.castle==='K'||mv.castle==='k')?[4,5,6]:[2,3,4];
        if (cols.some(kc=>this._isAttacked(kr,kc,enemy))) return false;
      }
      const saved=this._applyMove(mv),ok=!this._inCheck(col);
      this._undoMove(mv,saved); return ok;
    });
  }

  allLegalMoves() {
    const ms=[];
    for (let r=0;r<8;r++) for (let c=0;c<8;c++) {
      const p=this.board[r][c];
      if (p&&(this._isW(p)?'w':'b')===this.turn) ms.push(...this.legalMoves([r,c]));
    }
    return ms;
  }

  move(from, to, promo) {
    const ms=this.legalMoves(from);
    const mv=ms.find(m=>m.to[0]===to[0]&&m.to[1]===to[1]&&(!m.promotion||m.promotion===promo||!promo));
    if (!mv) return null;
    if (mv.promotion&&!promo) return 'promotion';

    const col=this.turn,enemy=col==='w'?'b':'w',piece=this.board[from[0]][from[1]];
    const info=this._applyMove(mv);
    const pt=piece.toLowerCase();
    if (pt==='k'){if(col==='w'){this.castling.wK=false;this.castling.wQ=false;}else{this.castling.bK=false;this.castling.bQ=false;}}
    if (pt==='r'){if(from[0]===7&&from[1]===7)this.castling.wK=false;if(from[0]===7&&from[1]===0)this.castling.wQ=false;if(from[0]===0&&from[1]===7)this.castling.bK=false;if(from[0]===0&&from[1]===0)this.castling.bQ=false;}
    this.enPassant=mv.epSquare||null;
    if(pt==='p'||info.cap||mv.epCapture)this.halfmove=0;else this.halfmove++;
    if(col==='b')this.fullmove++;
    this.turn=enemy;

    const san=this._toSAN(mv,piece,info.cap||mv.epCapture);
    const inChk=this._inCheck(enemy),allNext=this.allLegalMoves();
    const suffix=allNext.length===0?(inChk?'#':''):(inChk?'+':'');
    const entry={move:mv,san:san+suffix,from:this._alg(from[0],from[1]),to:this._alg(to[0],to[1]),piece,captured:info.cap,fen:this.fen(),color:col};
    this.history.push(entry);
    return entry;
  }

  _toSAN(mv, piece, cap) {
    if (mv.castle==='K'||mv.castle==='k') return 'O-O';
    if (mv.castle==='Q'||mv.castle==='q') return 'O-O-O';
    const pt=piece.toLowerCase(),toAlg=this._alg(mv.to[0],mv.to[1]),frAlg=this._alg(mv.from[0],mv.from[1]);
    if (pt==='p') return (cap?frAlg[0]+'x':'')+toAlg+(mv.promotion?'='+mv.promotion.toUpperCase():'');
    const pc=piece.toUpperCase(); let dis='';
    const same=[];
    for(let r=0;r<8;r++) for(let c=0;c<8;c++) {
      if(r===mv.from[0]&&c===mv.from[1]) continue;
      if(this.board[r][c]===piece){const ms2=this.legalMoves([r,c]);if(ms2.some(m=>m.to[0]===mv.to[0]&&m.to[1]===mv.to[1]))same.push([r,c]);}
    }
    if(same.length>0){const sf=same.filter(([,c])=>c===mv.from[1]),sr=same.filter(([r])=>r===mv.from[0]);if(!sf.length)dis=frAlg[0];else if(!sr.length)dis=frAlg[1];else dis=frAlg;}
    return pc+dis+(cap?'x':'')+toAlg;
  }

  isCheckmate(){return this._inCheck(this.turn)&&!this.allLegalMoves().length;}
  isStalemate(){return!this._inCheck(this.turn)&&!this.allLegalMoves().length;}
  isDraw(){return this.isStalemate()||this.halfmove>=100;}
  inCheck(){return this._inCheck(this.turn);}

  pgn(){
    return this.history.map((h,i)=>(h.color==='w'?`${Math.ceil((i+1)/2)}. `:'')+h.san).join(' ').trim();
  }

  // ════════════════════════════════════════════════════════
  // ROBUST PGN LOADER — handles Chess.com, Lichess, all formats
  // ════════════════════════════════════════════════════════
  loadPgn(pgn) {
    let s = pgn;

    // Remove tag pairs — [Tag "Value"] including multi-line
    s = s.replace(/\[[^\]]*\]\s*/g, '');

    // Remove { comments } — Chess.com puts clocks & evals here
    // Repeat until no more (handles rare nesting)
    for (let i = 0; i < 5; i++) s = s.replace(/\{[^{}]*\}/g, ' ');

    // Remove ( variations )
    for (let i = 0; i < 5; i++) s = s.replace(/\([^()]*\)/g, ' ');

    // Remove NAG codes like $1 $14
    s = s.replace(/\$\d+/g, ' ');

    // Remove game termination markers
    s = s.replace(/\b(1-0|0-1|1\/2-1\/2|\*)\b/g, ' ');

    // Normalize whitespace
    s = s.replace(/\s+/g, ' ').trim();

    // Tokenize
    const tokens = s.split(' ').filter(t => {
      if (!t) return false;
      // Skip pure move numbers: "1." "22." "1..." "12..."
      if (/^\d+\.{1,3}$/.test(t)) return false;
      // Skip if empty after removing annotations
      return t.replace(/[+#!?]/g, '').length > 0;
    });

    this.reset();

    for (const token of tokens) {
      const san = token.replace(/[+#!?]/g, '');
      if (!san) continue;
      if (!this._parseSAN(san)) {
        console.warn('[ChessCalc] Failed SAN:', san, '| ply:', this.history.length, '| turn:', this.turn);
        return false;
      }
    }

    return this.history.length > 0;
  }

  // ════════════════════════════════════════════════════════
  // ROBUST SAN PARSER
  // ════════════════════════════════════════════════════════
  _parseSAN(san) {
    if (!san) return false;

    // ── Castling ──
    if (/^[Oo0]-[Oo0]-[Oo0]$/.test(san)) {
      const r = this.turn === 'w' ? 7 : 0;
      return !!this.move([r,4],[r,2]);
    }
    if (/^[Oo0]-[Oo0]$/.test(san)) {
      const r = this.turn === 'w' ? 7 : 0;
      return !!this.move([r,4],[r,6]);
    }

    let s = san;

    // ── Promotion ──
    let promo = null;
    const promoMatch = s.match(/=?([QRBNqrbn])$/);
    // Confirm it's actually a promotion (destination rank is 1 or 8)
    if (promoMatch) {
      const beforePromo = s.replace(/=?[QRBNqrbn]$/, '');
      if (/[18]$/.test(beforePromo)) {
        const pc = promoMatch[1].toUpperCase();
        promo = this.turn === 'w' ? pc : pc.toLowerCase();
        s = beforePromo;
      }
    }

    // ── Destination square — always last 2 chars ──
    if (s.length < 2) return false;
    const toStr = s.slice(-2);
    if (!/^[a-h][1-8]$/.test(toStr)) return false;
    const [toR, toC] = this._sq(toStr);

    // ── Piece type ──
    let pieceType = 'p';  // default = pawn
    let prefix = '';

    if (/^[KQRBN]/.test(s)) {
      pieceType = s[0].toLowerCase();
      prefix = s.slice(1, -2).replace('x', '');  // disambiguation chars
    } else {
      // Pawn: might start with file for capture, e.g. "exd5" → prefix="e"
      prefix = s.slice(0, -2).replace('x', '');
    }

    // ── Find matching legal move ──
    const all = this.allLegalMoves();
    const candidates = all.filter(m => {
      if (m.to[0] !== toR || m.to[1] !== toC) return false;
      const p = this.board[m.from[0]][m.from[1]];
      if (!p || p.toLowerCase() !== pieceType) return false;
      if (promo && m.promotion && m.promotion.toUpperCase() !== promo.toUpperCase()) return false;
      if (!promo && m.promotion) return false;  // Don't auto-pick promotion
      // Check disambiguation
      if (prefix) {
        const fa = this._alg(m.from[0], m.from[1]);
        for (const ch of prefix) {
          if (/[a-h]/.test(ch) && fa[0] !== ch) return false;
          if (/[1-8]/.test(ch) && fa[1] !== ch) return false;
        }
      }
      return true;
    });

    if (candidates.length === 0) return false;

    const mv = candidates[0];
    const result = this.move(mv.from, mv.to, promo || mv.promotion || undefined);
    return result !== null && result !== 'promotion';
  }
}
