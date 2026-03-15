/**
 * Chess.js — Complete chess rules engine
 * Handles: legal move generation, FEN parsing/generation, PGN parsing, game state
 */

class Chess {
  constructor(fen) {
    this.reset();
    if (fen) this.load(fen);
  }

  reset() {
    this.board = this._emptyBoard();
    this.turn = 'w';
    this.castling = { wK: true, wQ: true, bK: true, bQ: true };
    this.enPassant = null;
    this.halfmove = 0;
    this.fullmove = 1;
    this.history = [];
    this.load(Chess.DEFAULT_FEN);
  }

  static get DEFAULT_FEN() {
    return 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  }

  _emptyBoard() {
    return Array(8).fill(null).map(() => Array(8).fill(null));
  }

  load(fen) {
    const parts = fen.trim().split(/\s+/);
    if (parts.length < 4) return false;
    const [position, turn, castling, ep, half = '0', full = '1'] = parts;
    this.board = this._emptyBoard();
    const rows = position.split('/');
    for (let r = 0; r < 8; r++) {
      let c = 0;
      for (const ch of rows[r]) {
        if (/\d/.test(ch)) { c += parseInt(ch); }
        else {
          this.board[r][c] = ch;
          c++;
        }
      }
    }
    this.turn = turn;
    this.castling = {
      wK: castling.includes('K'), wQ: castling.includes('Q'),
      bK: castling.includes('k'), bQ: castling.includes('q')
    };
    this.enPassant = ep === '-' ? null : ep;
    this.halfmove = parseInt(half);
    this.fullmove = parseInt(full);
    this.history = [];
    return true;
  }

  fen() {
    let pos = '';
    for (let r = 0; r < 8; r++) {
      let empty = 0;
      for (let c = 0; c < 8; c++) {
        const sq = this.board[r][c];
        if (sq) { if (empty) { pos += empty; empty = 0; } pos += sq; }
        else empty++;
      }
      if (empty) pos += empty;
      if (r < 7) pos += '/';
    }
    const cast = (
      (this.castling.wK ? 'K' : '') + (this.castling.wQ ? 'Q' : '') +
      (this.castling.bK ? 'k' : '') + (this.castling.bQ ? 'q' : '')
    ) || '-';
    return `${pos} ${this.turn} ${cast} ${this.enPassant || '-'} ${this.halfmove} ${this.fullmove}`;
  }

  // Convert algebraic ('e4') to [row, col]
  _sq(alg) {
    const c = alg.charCodeAt(0) - 97;
    const r = 8 - parseInt(alg[1]);
    return [r, c];
  }

  _alg(r, c) {
    return String.fromCharCode(97 + c) + (8 - r);
  }

  _isWhite(p) { return p && p === p.toUpperCase(); }
  _isBlack(p) { return p && p === p.toLowerCase(); }
  _isEnemy(p, color) {
    return p && (color === 'w' ? this._isBlack(p) : this._isWhite(p));
  }
  _isFriend(p, color) {
    return p && (color === 'w' ? this._isWhite(p) : this._isBlack(p));
  }

  _inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

  // Generate pseudo-legal moves for piece at [r,c]
  _pseudoMoves(r, c) {
    const piece = this.board[r][c];
    if (!piece) return [];
    const color = this._isWhite(piece) ? 'w' : 'b';
    const moves = [];
    const add = (tr, tc, extra = {}) => {
      if (this._inBounds(tr, tc) && !this._isFriend(this.board[tr][tc], color)) {
        moves.push({ from: [r, c], to: [tr, tc], ...extra });
      }
    };
    const slide = (dirs) => {
      for (const [dr, dc] of dirs) {
        let tr = r + dr, tc = c + dc;
        while (this._inBounds(tr, tc)) {
          if (this.board[tr][tc]) {
            if (this._isEnemy(this.board[tr][tc], color)) moves.push({ from: [r, c], to: [tr, tc] });
            break;
          }
          moves.push({ from: [r, c], to: [tr, tc] });
          tr += dr; tc += dc;
        }
      }
    };

    const p = piece.toLowerCase();

    if (p === 'p') {
      const dir = color === 'w' ? -1 : 1;
      const startRow = color === 'w' ? 6 : 1;
      const promRow = color === 'w' ? 0 : 7;
      const tr = r + dir;
      // Forward
      if (this._inBounds(tr, c) && !this.board[tr][c]) {
        if (tr === promRow) {
          for (const promo of ['q', 'r', 'b', 'n']) {
            moves.push({ from: [r, c], to: [tr, c], promotion: color === 'w' ? promo.toUpperCase() : promo });
          }
        } else {
          moves.push({ from: [r, c], to: [tr, c] });
          // Double push
          if (r === startRow && !this.board[tr + dir][c]) {
            moves.push({ from: [r, c], to: [tr + dir, c], enPassant: this._alg(tr, c) });
          }
        }
      }
      // Captures
      for (const dc of [-1, 1]) {
        const tc = c + dc;
        if (!this._inBounds(tr, tc)) continue;
        const target = this.board[tr][tc];
        if (this._isEnemy(target, color)) {
          if (tr === promRow) {
            for (const promo of ['q', 'r', 'b', 'n']) {
              moves.push({ from: [r, c], to: [tr, tc], promotion: color === 'w' ? promo.toUpperCase() : promo });
            }
          } else {
            moves.push({ from: [r, c], to: [tr, tc] });
          }
        }
        // En passant
        if (this.enPassant && this._alg(tr, tc) === this.enPassant) {
          moves.push({ from: [r, c], to: [tr, tc], epCapture: [r, tc] });
        }
      }
    }
    else if (p === 'n') {
      for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) add(r+dr, c+dc);
    }
    else if (p === 'b') slide([[-1,-1],[-1,1],[1,-1],[1,1]]);
    else if (p === 'r') slide([[-1,0],[1,0],[0,-1],[0,1]]);
    else if (p === 'q') slide([[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]);
    else if (p === 'k') {
      for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) add(r+dr, c+dc);
      // Castling
      if (color === 'w' && r === 7 && c === 4) {
        if (this.castling.wK && !this.board[7][5] && !this.board[7][6] && this.board[7][7] === 'R') {
          moves.push({ from: [r,c], to: [7,6], castle: 'K' });
        }
        if (this.castling.wQ && !this.board[7][3] && !this.board[7][2] && !this.board[7][1] && this.board[7][0] === 'R') {
          moves.push({ from: [r,c], to: [7,2], castle: 'Q' });
        }
      }
      if (color === 'b' && r === 0 && c === 4) {
        if (this.castling.bK && !this.board[0][5] && !this.board[0][6] && this.board[0][7] === 'r') {
          moves.push({ from: [r,c], to: [0,6], castle: 'k' });
        }
        if (this.castling.bQ && !this.board[0][3] && !this.board[0][2] && !this.board[0][1] && this.board[0][0] === 'r') {
          moves.push({ from: [r,c], to: [0,2], castle: 'q' });
        }
      }
    }
    return moves;
  }

  _findKing(color) {
    const king = color === 'w' ? 'K' : 'k';
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++)
        if (this.board[r][c] === king) return [r, c];
    return null;
  }

  _isAttacked(r, c, byColor) {
    // Check all opponent pieces
    for (let pr = 0; pr < 8; pr++) {
      for (let pc = 0; pc < 8; pc++) {
        const p = this.board[pr][pc];
        if (!p) continue;
        const pColor = this._isWhite(p) ? 'w' : 'b';
        if (pColor !== byColor) continue;
        const moves = this._pseudoMoves(pr, pc);
        if (moves.some(m => m.to[0] === r && m.to[1] === c)) return true;
      }
    }
    return false;
  }

  _inCheck(color) {
    const king = this._findKing(color);
    if (!king) return false;
    const enemy = color === 'w' ? 'b' : 'w';
    return this._isAttacked(king[0], king[1], enemy);
  }

  // Apply move on board state, return captured piece info
  _applyMove(move) {
    const { from, to, promotion, castle, epCapture, enPassant: newEp } = move;
    const [fr, fc] = from;
    const [tr, tc] = to;
    const piece = this.board[fr][fc];
    const captured = this.board[tr][tc];

    this.board[tr][tc] = promotion || piece;
    this.board[fr][fc] = null;

    if (epCapture) { this.board[epCapture[0]][epCapture[1]] = null; }
    if (castle === 'K') { this.board[7][5] = 'R'; this.board[7][7] = null; }
    if (castle === 'Q') { this.board[7][3] = 'R'; this.board[7][0] = null; }
    if (castle === 'k') { this.board[0][5] = 'r'; this.board[0][7] = null; }
    if (castle === 'q') { this.board[0][3] = 'r'; this.board[0][0] = null; }

    return { piece, captured };
  }

  _undoApply(move, { piece, captured }) {
    const { from, to, promotion, castle, epCapture } = move;
    const [fr, fc] = from;
    const [tr, tc] = to;
    this.board[fr][fc] = piece;
    this.board[tr][tc] = captured;
    if (epCapture) {
      const epColor = this._isWhite(piece) ? 'b' : 'w';
      this.board[epCapture[0]][epCapture[1]] = epColor === 'b' ? 'p' : 'P';
    }
    if (castle === 'K') { this.board[7][7] = 'R'; this.board[7][5] = null; }
    if (castle === 'Q') { this.board[7][0] = 'R'; this.board[7][3] = null; }
    if (castle === 'k') { this.board[0][7] = 'r'; this.board[0][5] = null; }
    if (castle === 'q') { this.board[0][0] = 'r'; this.board[0][3] = null; }
  }

  legalMoves(from) {
    const [fr, fc] = from;
    const piece = this.board[fr][fc];
    if (!piece) return [];
    const color = this._isWhite(piece) ? 'w' : 'b';
    if (color !== this.turn) return [];

    const pseudo = this._pseudoMoves(fr, fc);
    const legal = [];

    for (const move of pseudo) {
      // Check castling doesn't pass through check
      if (move.castle) {
        const enemy = color === 'w' ? 'b' : 'w';
        const kr = move.to[0];
        const kcols = move.castle === 'K' || move.castle === 'k' ? [4, 5, 6] : [2, 3, 4];
        if (kcols.some(kc => this._isAttacked(kr, kc, enemy))) continue;
      }

      const saved = this._applyMove(move);
      const inCheck = this._inCheck(color);
      this._undoApply(move, saved);
      if (!inCheck) legal.push(move);
    }
    return legal;
  }

  allLegalMoves() {
    const moves = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this.board[r][c];
        if (!p) continue;
        const color = this._isWhite(p) ? 'w' : 'b';
        if (color === this.turn) moves.push(...this.legalMoves([r, c]));
      }
    }
    return moves;
  }

  move(from, to, promotionPiece) {
    const moves = this.legalMoves(from);
    const move = moves.find(m => m.to[0] === to[0] && m.to[1] === to[1] &&
      (!m.promotion || m.promotion === promotionPiece || !promotionPiece));
    if (!move) return null;
    if (move.promotion && !promotionPiece) return 'promotion';

    const color = this.turn;
    const enemy = color === 'w' ? 'b' : 'w';
    const piece = this.board[from[0]][from[1]];

    // Save state for history
    const prevFen = this.fen();
    const prevCastling = { ...this.castling };
    const prevEp = this.enPassant;
    const prevHalf = this.halfmove;

    const info = this._applyMove(move);

    // Update castling rights
    const p = piece.toLowerCase();
    if (p === 'k') {
      if (color === 'w') { this.castling.wK = false; this.castling.wQ = false; }
      else { this.castling.bK = false; this.castling.bQ = false; }
    }
    if (p === 'r') {
      if (from[0] === 7 && from[1] === 7) this.castling.wK = false;
      if (from[0] === 7 && from[1] === 0) this.castling.wQ = false;
      if (from[0] === 0 && from[1] === 7) this.castling.bK = false;
      if (from[0] === 0 && from[1] === 0) this.castling.bQ = false;
    }

    // En passant
    this.enPassant = move.enPassant || null;

    // Halfmove clock
    if (p === 'p' || info.captured || move.epCapture) this.halfmove = 0;
    else this.halfmove++;

    if (color === 'b') this.fullmove++;

    this.turn = enemy;

    // Generate SAN
    const san = this._toSAN(move, piece, info.captured || move.epCapture, prevCastling);
    const inCheckNow = this._inCheck(enemy);
    const allMoves = this.allLegalMoves();
    let suffix = '';
    if (allMoves.length === 0) suffix = inCheckNow ? '#' : '';
    else if (inCheckNow) suffix = '+';

    const histEntry = {
      move, san: san + suffix,
      from: this._alg(from[0], from[1]),
      to: this._alg(to[0], to[1]),
      piece, captured: info.captured,
      fen: this.fen(),
      color
    };
    this.history.push(histEntry);
    return histEntry;
  }

  _toSAN(move, piece, captured, prevCastling) {
    if (move.castle === 'K' || move.castle === 'k') return 'O-O';
    if (move.castle === 'Q' || move.castle === 'q') return 'O-O-O';

    const p = piece.toLowerCase();
    const toAlg = this._alg(move.to[0], move.to[1]);
    const fromAlg = this._alg(move.from[0], move.from[1]);

    if (p === 'p') {
      const cap = captured || move.epCapture;
      if (cap) return fromAlg[0] + 'x' + toAlg + (move.promotion ? '=' + move.promotion.toUpperCase() : '');
      return toAlg + (move.promotion ? '=' + move.promotion.toUpperCase() : '');
    }

    const pieceChar = piece.toUpperCase();
    // Disambiguation
    let disambig = '';
    const sameType = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (r === move.from[0] && c === move.from[1]) continue;
        if (this.board[r][c] === piece) {
          const ms = this.legalMoves([r, c]);
          if (ms.some(m => m.to[0] === move.to[0] && m.to[1] === move.to[1])) sameType.push([r, c]);
        }
      }
    }
    if (sameType.length > 0) {
      const sameFile = sameType.filter(([, c]) => c === move.from[1]);
      const sameRank = sameType.filter(([r]) => r === move.from[0]);
      if (sameFile.length === 0) disambig = fromAlg[0];
      else if (sameRank.length === 0) disambig = fromAlg[1];
      else disambig = fromAlg;
    }

    return pieceChar + disambig + (captured ? 'x' : '') + toAlg;
  }

  isCheckmate() {
    return this._inCheck(this.turn) && this.allLegalMoves().length === 0;
  }

  isStalemate() {
    return !this._inCheck(this.turn) && this.allLegalMoves().length === 0;
  }

  isDraw() {
    return this.isStalemate() || this.halfmove >= 100;
  }

  inCheck() { return this._inCheck(this.turn); }

  pgn() {
    let result = '';
    for (let i = 0; i < this.history.length; i++) {
      const h = this.history[i];
      if (h.color === 'w') result += `${this.history[i] ? Math.ceil((i+1)/2) : ''}.`;
      result += ` ${h.san}`;
    }
    return result.trim();
  }

  loadPgn(pgn) {
    // Strip headers
    const stripped = pgn.replace(/\[.*?\]\s*/gs, '').trim();
    // Remove result
    const cleaned = stripped.replace(/\s*(1-0|0-1|1\/2-1\/2|\*)\s*$/, '').trim();
    // Tokenize
    const tokens = cleaned.split(/\s+/).filter(t => t && !/^\d+\.+$/.test(t));

    this.reset();
    for (const token of tokens) {
      const t = token.replace(/[+#?!]/g, '');
      if (!this._parseSAN(t)) return false;
    }
    return true;
  }

  _parseSAN(san) {
    // Castling
    if (san === 'O-O-O' || san === '0-0-0') {
      const r = this.turn === 'w' ? 7 : 0;
      return this.move([r, 4], [r, 2]) !== null;
    }
    if (san === 'O-O' || san === '0-0') {
      const r = this.turn === 'w' ? 7 : 0;
      return this.move([r, 4], [r, 6]) !== null;
    }

    const all = this.allLegalMoves();
    // Promotion
    let promo = null;
    let s = san;
    const promoMatch = s.match(/=([QRBN])$/i);
    if (promoMatch) {
      promo = this.turn === 'w' ? promoMatch[1].toUpperCase() : promoMatch[1].toLowerCase();
      s = s.replace(/=[QRBN]$/i, '');
    }

    const toFile = s.slice(-2, -1);
    const toRank = s.slice(-1);
    const toSq = this._sq(toFile + toRank);

    for (const m of all) {
      if (m.to[0] !== toSq[0] || m.to[1] !== toSq[1]) continue;
      if (promo && m.promotion && m.promotion.toUpperCase() !== promo.toUpperCase()) continue;
      const result = this.move(m.from, m.to, promo || m.promotion);
      if (result && result !== 'promotion') return true;
    }
    return false;
  }
}
