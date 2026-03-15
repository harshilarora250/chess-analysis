/* chess.js - Full rules engine */
class Chess {
  constructor(fen){this.reset();if(fen)this.load(fen);}
  static get START(){return'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';}
  reset(){this.board=Array(8).fill(null).map(()=>Array(8).fill(null));this.turn='w';this.castling={wK:true,wQ:true,bK:true,bQ:true};this.enPassant=null;this.halfmove=0;this.fullmove=1;this.history=[];this.load(Chess.START);}
  load(fen){const p=fen.trim().split(/\s+/);if(p.length<4)return false;this.board=Array(8).fill(null).map(()=>Array(8).fill(null));p[0].split('/').forEach((row,r)=>{let c=0;for(const ch of row){if(/\d/.test(ch))c+=+ch;else this.board[r][c++]=ch;}});this.turn=p[1];this.castling={wK:p[2].includes('K'),wQ:p[2].includes('Q'),bK:p[2].includes('k'),bQ:p[2].includes('q')};this.enPassant=p[3]==='-'?null:p[3];this.halfmove=+p[4]||0;this.fullmove=+p[5]||1;this.history=[];return true;}
  fen(){let pos='';for(let r=0;r<8;r++){let e=0;for(let c=0;c<8;c++){const s=this.board[r][c];if(s){if(e){pos+=e;e=0;}pos+=s;}else e++;}if(e)pos+=e;if(r<7)pos+='/';}const cast=((this.castling.wK?'K':'')+(this.castling.wQ?'Q':'')+(this.castling.bK?'k':'')+(this.castling.bQ?'q':''))||'-';return`${pos} ${this.turn} ${cast} ${this.enPassant||'-'} ${this.halfmove} ${this.fullmove}`;}
  _sq(a){return[8-+a[1],a.charCodeAt(0)-97];}
  _alg(r,c){return String.fromCharCode(97+c)+(8-r);}
  _isW(p){return p&&p===p.toUpperCase();}
  _isB(p){return p&&p===p.toLowerCase();}
  _enemy(p,col){return p&&(col==='w'?this._isB(p):this._isW(p));}
  _friend(p,col){return p&&(col==='w'?this._isW(p):this._isB(p));}
  _inB(r,c){return r>=0&&r<8&&c>=0&&c<8;}
  _pseudo(r,c){
    const piece=this.board[r][c];if(!piece)return[];
    const col=this._isW(piece)?'w':'b',moves=[];
    const add=(tr,tc,ex={})=>{if(this._inB(tr,tc)&&!this._friend(this.board[tr][tc],col))moves.push({from:[r,c],to:[tr,tc],...ex});};
    const slide=dirs=>{for(const[dr,dc]of dirs){let tr=r+dr,tc=c+dc;while(this._inB(tr,tc)){if(this.board[tr][tc]){if(this._enemy(this.board[tr][tc],col))moves.push({from:[r,c],to:[tr,tc]});break;}moves.push({from:[r,c],to:[tr,tc]});tr+=dr;tc+=dc;}}};
    const pt=piece.toLowerCase();
    if(pt==='p'){
      const dir=col==='w'?-1:1,sr=col==='w'?6:1,pr=col==='w'?0:7,tr=r+dir;
      if(this._inB(tr,c)&&!this.board[tr][c]){if(tr===pr){for(const q of['q','r','b','n'])moves.push({from:[r,c],to:[tr,c],promotion:col==='w'?q.toUpperCase():q});}else{moves.push({from:[r,c],to:[tr,c]});if(r===sr&&!this.board[tr+dir][c])moves.push({from:[r,c],to:[tr+dir,c],epSq:this._alg(tr,c)});}}
      for(const dc of[-1,1]){const tc=c+dc;if(!this._inB(tr,tc))continue;const tgt=this.board[tr][tc];if(this._enemy(tgt,col)){if(tr===pr){for(const q of['q','r','b','n'])moves.push({from:[r,c],to:[tr,tc],promotion:col==='w'?q.toUpperCase():q});}else moves.push({from:[r,c],to:[tr,tc]});}if(this.enPassant&&this._alg(tr,tc)===this.enPassant)moves.push({from:[r,c],to:[tr,tc],epCapture:[r,tc]});}
    }else if(pt==='n'){for(const[dr,dc]of[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]])add(r+dr,c+dc);}
    else if(pt==='b')slide([[-1,-1],[-1,1],[1,-1],[1,1]]);
    else if(pt==='r')slide([[-1,0],[1,0],[0,-1],[0,1]]);
    else if(pt==='q')slide([[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]);
    else if(pt==='k'){
      for(const[dr,dc]of[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]])add(r+dr,c+dc);
      if(col==='w'&&r===7&&c===4){if(this.castling.wK&&!this.board[7][5]&&!this.board[7][6]&&this.board[7][7]==='R')moves.push({from:[r,c],to:[7,6],castle:'K'});if(this.castling.wQ&&!this.board[7][3]&&!this.board[7][2]&&!this.board[7][1]&&this.board[7][0]==='R')moves.push({from:[r,c],to:[7,2],castle:'Q'});}
      if(col==='b'&&r===0&&c===4){if(this.castling.bK&&!this.board[0][5]&&!this.board[0][6]&&this.board[0][7]==='r')moves.push({from:[r,c],to:[0,6],castle:'k'});if(this.castling.bQ&&!this.board[0][3]&&!this.board[0][2]&&!this.board[0][1]&&this.board[0][0]==='r')moves.push({from:[r,c],to:[0,2],castle:'q'});}
    }
    return moves;
  }
  _findKing(col){const k=col==='w'?'K':'k';for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(this.board[r][c]===k)return[r,c];return null;}
  _attacked(r,c,byCol){for(let pr=0;pr<8;pr++)for(let pc=0;pc<8;pc++){const p=this.board[pr][pc];if(!p)continue;if((this._isW(p)?'w':'b')!==byCol)continue;if(this._pseudo(pr,pc).some(m=>m.to[0]===r&&m.to[1]===c))return true;}return false;}
  _inCheck(col){const k=this._findKing(col);return k?this._attacked(k[0],k[1],col==='w'?'b':'w'):false;}
  _apply(mv){const[fr,fc]=mv.from,[tr,tc]=mv.to,piece=this.board[fr][fc],cap=this.board[tr][tc];this.board[tr][tc]=mv.promotion||piece;this.board[fr][fc]=null;if(mv.epCapture)this.board[mv.epCapture[0]][mv.epCapture[1]]=null;if(mv.castle==='K'){this.board[7][5]='R';this.board[7][7]=null;}if(mv.castle==='Q'){this.board[7][3]='R';this.board[7][0]=null;}if(mv.castle==='k'){this.board[0][5]='r';this.board[0][7]=null;}if(mv.castle==='q'){this.board[0][3]='r';this.board[0][0]=null;}return{piece,cap};}
  _undo(mv,s){const[fr,fc]=mv.from,[tr,tc]=mv.to;this.board[fr][fc]=s.piece;this.board[tr][tc]=s.cap;if(mv.epCapture)this.board[mv.epCapture[0]][mv.epCapture[1]]=this._isW(s.piece)?'p':'P';if(mv.castle==='K'){this.board[7][7]='R';this.board[7][5]=null;}if(mv.castle==='Q'){this.board[7][0]='R';this.board[7][3]=null;}if(mv.castle==='k'){this.board[0][7]='r';this.board[0][5]=null;}if(mv.castle==='q'){this.board[0][0]='r';this.board[0][3]=null;};}
  legalMoves(from){const[fr,fc]=from,piece=this.board[fr][fc];if(!piece)return[];const col=this._isW(piece)?'w':'b';if(col!==this.turn)return[];return this._pseudo(fr,fc).filter(mv=>{if(mv.castle){const en=col==='w'?'b':'w',kr=mv.to[0],cols=mv.castle==='K'||mv.castle==='k'?[4,5,6]:[2,3,4];if(cols.some(kc=>this._attacked(kr,kc,en)))return false;}const s=this._apply(mv),ok=!this._inCheck(col);this._undo(mv,s);return ok;});}
  allLegal(){const ms=[];for(let r=0;r<8;r++)for(let c=0;c<8;c++){const p=this.board[r][c];if(p&&(this._isW(p)?'w':'b')===this.turn)ms.push(...this.legalMoves([r,c]));}return ms;}
  move(from,to,promo){
    const ms=this.legalMoves(from),mv=ms.find(m=>m.to[0]===to[0]&&m.to[1]===to[1]&&(!m.promotion||m.promotion===promo||!promo));
    if(!mv)return null;if(mv.promotion&&!promo)return'promotion';
    const col=this.turn,piece=this.board[from[0]][from[1]];
    const info=this._apply(mv);
    const pt=piece.toLowerCase();
    if(pt==='k'){if(col==='w'){this.castling.wK=false;this.castling.wQ=false;}else{this.castling.bK=false;this.castling.bQ=false;}}
    if(pt==='r'){if(from[0]===7&&from[1]===7)this.castling.wK=false;if(from[0]===7&&from[1]===0)this.castling.wQ=false;if(from[0]===0&&from[1]===7)this.castling.bK=false;if(from[0]===0&&from[1]===0)this.castling.bQ=false;}
    this.enPassant=mv.epSq||null;
    if(pt==='p'||info.cap||mv.epCapture)this.halfmove=0;else this.halfmove++;
    if(col==='b')this.fullmove++;
    const enemy=col==='w'?'b':'w';this.turn=enemy;
    const san=this._san(mv,piece,info.cap||mv.epCapture);
    const chk=this._inCheck(enemy),all=this.allLegal();
    const sfx=all.length===0?(chk?'#':''):(chk?'+':'');
    const entry={move:mv,san:san+sfx,from:this._alg(from[0],from[1]),to:this._alg(to[0],to[1]),piece,captured:info.cap,fen:this.fen(),color:col};
    this.history.push(entry);return entry;
  }
  _san(mv,piece,cap){
    if(mv.castle==='K'||mv.castle==='k')return'O-O';if(mv.castle==='Q'||mv.castle==='q')return'O-O-O';
    const pt=piece.toLowerCase(),toA=this._alg(mv.to[0],mv.to[1]),frA=this._alg(mv.from[0],mv.from[1]);
    if(pt==='p')return(cap?frA[0]+'x':'')+toA+(mv.promotion?'='+mv.promotion.toUpperCase():'');
    const pc=piece.toUpperCase();let dis='';
    const same=[];for(let r=0;r<8;r++)for(let c=0;c<8;c++){if(r===mv.from[0]&&c===mv.from[1])continue;if(this.board[r][c]===piece){const ms2=this.legalMoves([r,c]);if(ms2.some(m=>m.to[0]===mv.to[0]&&m.to[1]===mv.to[1]))same.push([r,c]);}}
    if(same.length>0){const sf=same.filter(([,c])=>c===mv.from[1]),sr=same.filter(([r])=>r===mv.from[0]);if(!sf.length)dis=frA[0];else if(!sr.length)dis=frA[1];else dis=frA;}
    return pc+dis+(cap?'x':'')+toA;
  }
  isCheckmate(){return this._inCheck(this.turn)&&!this.allLegal().length;}
  isStalemate(){return!this._inCheck(this.turn)&&!this.allLegal().length;}
  isDraw(){return this.isStalemate()||this.halfmove>=100;}
  inCheck(){return this._inCheck(this.turn);}
  pgn(){return this.history.map((h,i)=>(h.color==='w'?`${Math.ceil((i+1)/2)}. `:'')+h.san).join(' ').trim();}
  loadPgn(pgn){
    // Strip headers
    let s=pgn.replace(/\[.*?\]\s*/gs,'');
    // Strip curly-brace comments (Chess.com clock annotations, engine evals, etc.)
    s=s.replace(/\{[^}]*\}/g,' ');
    // Strip parenthesized variations
    s=s.replace(/\([^)]*\)/g,' ');
    // Strip NAG codes like $1 $14 $138
    s=s.replace(/\$\d+/g,' ');
    // Strip result
    s=s.replace(/\s*(1-0|0-1|1\/2-1\/2|\*)\s*$/,'').trim();
    // Tokenize — skip move numbers like "1." "12..." "1..."
    const tokens=s.split(/\s+/).filter(t=>t&&!/^\d+\.+$/.test(t)&&t.trim()!=='');
    this.reset();
    for(const t of tokens){
      const clean=t.replace(/[+#?!]/g,'');
      if(!clean)continue;
      if(!this._parseSAN(clean))return false;
    }
    return true;
  }
  _parseSAN(san){
    if(/^O-O-O$|^0-0-0$/.test(san)){const r=this.turn==='w'?7:0;return!!this.move([r,4],[r,2]);}
    if(/^O-O$|^0-0$/.test(san)){const r=this.turn==='w'?7:0;return!!this.move([r,4],[r,6]);}
    let promo=null,s=san;const pm=s.match(/=([QRBN])$/i);if(pm){promo=this.turn==='w'?pm[1].toUpperCase():pm[1].toLowerCase();s=s.replace(/=[QRBN]$/i,'');}
    const toA=this._sq(s.slice(-2));
    for(const m of this.allLegal()){if(m.to[0]!==toA[0]||m.to[1]!==toA[1])continue;if(promo&&m.promotion&&m.promotion.toUpperCase()!==promo.toUpperCase())continue;const r=this.move(m.from,m.to,promo||m.promotion);if(r&&r!=='promotion')return true;}
    return false;
  }
}
