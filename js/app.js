/* ChessCalc App — v6 */
const P = {K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙',k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'};

class App {
  constructor() {
    this.chess        = new Chess();
    this.engine       = new Engine();
    this.flipped      = false;
    this.selected     = null;
    this.targets      = [];
    this.lastMove     = null;
    this.snaps        = [Chess.START];
    this.ply          = 0;
    this.history      = [];
    this.grades       = [];
    this.bookFlags    = [];
    this.bestMoves    = [];
    this.evalHist     = [];
    this.lossW        = [];
    this.lossB        = [];
    this.engineLines  = {};
    this.playing      = false;
    this.playTimer    = null;
    this.pendingPromo = null;
    this.currentBestMove = null;
    this.ccUsername = '';
    this.ccGames    = [];
    this.ccFilter   = 'all';
    this._initEngine();
    this._bindAll();
    this.showLanding();
  }

  /* ══ ENGINE ══ */
  async _initEngine() {
    const dot=document.getElementById('eDot'), txt=document.getElementById('eTxt');
    dot.className='e-dot loading'; txt.textContent='Loading engine…';
    this.engine.onError=(msg)=>{dot.className='e-dot error';txt.textContent='Engine offline';document.getElementById('engineLines').innerHTML=`<div style="color:#f87171;font-size:12px;padding:4px">⚠ ${msg}</div>`;};
    const ok=await this.engine.init();
    if(ok){dot.className='e-dot ready';txt.textContent='Stockfish ready';this.engine.addListener(l=>this._onEngineLine(l));this._analyze();}
  }

  _onEngineLine(line) {
    if(line.startsWith('info')&&line.includes(' pv ')){
      const info=Engine.parseInfo(line); if(!info)return;
      this.engineLines[info.multipv||1]=info; this._renderLines();
      if((info.multipv===1||!info.multipv)&&info.score)this._renderEval(info.score);
    }
    if(line.startsWith('bestmove')){
      const bm=line.split(' ')[1];
      if(bm&&bm!=='(none)'){this.currentBestMove=bm;this._renderBestMoveRec(bm);}
    }
  }

  _analyze(){
    if(!this.engine.ready)return;
    this.engineLines={};
    const depth=+document.getElementById('depthSlider').value;
    this.engine.analyze(this.chess.fen(),depth,3);
  }

  _renderEval(score){
    const c=this.chess.turn;
    const wpCp=c==='w'?Engine.whiteCp(score):-Engine.whiteCp(score);
    const pct=Engine.evalBar(wpCp);
    const str=Engine.formatEval(score,c);
    const el=document.getElementById('evalNum');
    el.textContent=str;
    el.className='eval-num'+(wpCp>30?' adv-white':wpCp<-30?' adv-black':'');
    document.getElementById('evalBarFill').style.width=pct+'%';
    document.getElementById('evalDepth').textContent=this.engineLines[1]?.depth||'—';
    document.getElementById('evalTurn').textContent=c==='w'?'White':'Black';
    let status='';
    if(this.chess.isCheckmate())status='Checkmate';
    else if(this.chess.isStalemate())status='Stalemate';
    else if(this.chess.isDraw())status='Draw';
    else if(this.chess.inCheck())status='⚠ Check';
    const sel=document.getElementById('evalStatus');
    sel.textContent=status; sel.style.color=status.includes('Check')?'#f87171':'';
  }

  _renderLines(){
    const entries=Object.entries(this.engineLines).sort((a,b)=>+a[0]-+b[0]);
    if(!entries.length)return;
    const c=this.chess.turn;
    document.getElementById('engineLines').innerHTML=entries.map(([,info])=>{
      const score=Engine.formatEval(info.score,c);
      const moves=(info.pv||'').split(' ');
      const html=moves.slice(0,8).map((m,i)=>`<span style="color:${i===0?'var(--b3)':'var(--text3)'}">${m}</span>`).join(' ');
      return `<div class="e-line"><div class="e-line-score">${score}</div><div class="e-line-moves">${html}</div></div>`;
    }).join('');
  }

  _renderBestMoveRec(bestUci){
    const el=document.getElementById('bestMoveRec'); if(!el||!bestUci||bestUci==='(none)')return;
    const from=bestUci.slice(0,2),to=bestUci.slice(2,4),promo=bestUci[4]?bestUci[4].toUpperCase():'';
    const piece=this.chess.board[8-+from[1]][from.charCodeAt(0)-97];
    const pName=piece?({k:'King',q:'Queen',r:'Rook',b:'Bishop',n:'Knight',p:'Pawn'}[piece.toLowerCase()]||''):'';
    el.innerHTML=`<div class="rec-label">Best Move</div><div class="rec-move">${from}→${to}${promo}</div><div class="rec-piece">${pName}</div><button class="rec-btn" onclick="window.app._explainBestMove()">Why? →</button>`;
    el.style.display='flex';
  }

  async _explainBestMove(){
    const btn=document.querySelector('.rec-btn'); if(!btn)return;
    btn.textContent='Thinking…'; btn.disabled=true;
    const bm=this.currentBestMove, fen=this.chess.fen(), turn=this.chess.turn==='w'?'White':'Black';
    const evalStr=document.getElementById('evalNum')?.textContent||'';
    const prompt=`You are a chess coach. Position FEN: ${fen}\nThe engine recommends ${bm} for ${turn}. Evaluation: ${evalStr}.\nIn 2-3 sentences, explain WHY ${bm} is the best move here. Be specific about chess concepts. Simple language for an intermediate player.`;
    const text=await Engine.askClaude(prompt);
    this._showExplainModal('Best Move: '+bm,text);
    btn.textContent='Why? →'; btn.disabled=false;
  }

  /* ══ FULL ANALYSIS ══ */
  async runAnalysis(pgnStr){
    const temp=new Chess();
    if(!temp.loadPgn(pgnStr)||!temp.history.length){this.toast('Could not parse PGN',true);return;}
    const hist=temp.history;
    this.history=hist;
    const snaps=[Chess.START];
    const replay=new Chess();
    for(const h of hist){replay.move(h.move.from,h.move.to,h.move.promotion);snaps.push(replay.fen());}
    this.snaps=snaps; this.grades=new Array(hist.length).fill(null);
    this.bookFlags=new Array(hist.length).fill(false); this.bestMoves=new Array(snaps.length).fill(null);
    this.evalHist=[]; this.lossW=[]; this.lossB=[];
    this.ply=snaps.length-1; this.chess=new Chess(snaps[this.ply]);
    this.lastMove=hist.length?{from:hist[hist.length-1].from,to:hist[hist.length-1].to}:null;
    this.showAnalysis(); this._renderMoves();
    if(!this.engine.ready){this.toast('Engine not ready');return;}
    this._showProgress(true,snaps.length);

    const evals=[],engineBest=[];
    for(let i=0;i<snaps.length;i++){
      const info=await this.engine.evaluateFen(snaps[i],14);
      const stm=new Chess(snaps[i]).turn;
      let wp=0;
      if(info?.score){
        const raw=info.score.type==='mate'?(info.score.value>0?30000:-30000):info.score.value;
        wp=stm==='w'?raw:-raw;
      }
      evals.push(wp); this.evalHist.push(wp);
      const bm=info?.pv?.split(' ')[0]||null;
      engineBest.push(bm); this.bestMoves[i]=bm;
      this._updateProgress(i+1,snaps.length);
    }

    // Walk the game through the opening trie to find book moves
    const bookWalker = OPENING_BOOK.createWalker();
    const bookResults = []; // 'book' or null per move
    for (let i = 0; i < hist.length; i++) {
      const h = hist[i];
      const uci = h.from + h.to + (h.move?.promotion || '');
      bookResults.push(bookWalker.checkMove(uci));
    }

    for(let i=1;i<snaps.length;i++){
      const h=hist[i-1],mW=h.color==='w';

      // Book move: trie walker confirmed this move is theory
      if (bookResults[i-1] === 'book') {
        this.grades[i-1]='book'; this.bookFlags[i-1]=true; continue;
      }

      const prevAdv=mW?evals[i-1]:-evals[i-1];
      const afterAdv=mW?evals[i]:-evals[i];
      const cpLoss=Math.max(0,prevAdv-afterAdv);
      const playedUci=h.from+h.to+(h.move?.promotion||'');
      const ebest=engineBest[i-1];
      const isBest=ebest&&playedUci.toLowerCase()===ebest.toLowerCase();
      const isComplex=Math.abs(prevAdv)<300&&Math.abs(prevAdv)>10;
      const isCoolKid=isBest&&isComplex&&cpLoss<=5&&i>10;
      this.grades[i-1]=Engine.gradeMove(cpLoss,isCoolKid);
      if(mW)this.lossW.push(cpLoss); else this.lossB.push(cpLoss);
    }

    this._hideProgress();
    this.chess=new Chess(snaps[this.ply]);
    this.renderBoard(); this._renderMoves(); this._renderAccuracy();
    this._drawGraph(); this._updateMoveBanner(this.ply); this._analyze();
    this._generateGameStory(hist,evals);
    this.toast('Analysis complete ✓');
  }

  /* ══ GAME STORY ══ */
  async _generateGameStory(hist,evals){
    const sec=document.getElementById('gameStorySection'),el=document.getElementById('gameStoryContent');
    if(!sec||!el)return;
    sec.style.display='block';
    el.innerHTML='<div class="story-loading"><div class="spinner"></div> AI is writing your game story…</div>';
    const moveSummary=hist.slice(0,60).map((h,i)=>{
      const g=this.grades[i];
      const cp=evals[i+1]!==undefined?evals[i+1]:0;
      return `${i%2===0?Math.floor(i/2)+1+'.':''} ${h.san}[${g||'?'},${cp>0?'+':''}${(cp/100).toFixed(1)}]`;
    }).join(' ');
    const wAcc=Engine.accuracy(this.lossW).toFixed(1),bAcc=Engine.accuracy(this.lossB).toFixed(1);
    const wB=this.grades.filter((g,i)=>g==='blunder'&&i%2===0).length;
    const bB=this.grades.filter((g,i)=>g==='blunder'&&i%2!==0).length;
    const wCK=this.grades.filter((g,i)=>g==='coolkid'&&i%2===0).length;
    const bCK=this.grades.filter((g,i)=>g==='coolkid'&&i%2!==0).length;
    let turningPly=0,bigSwing=0;
    for(let i=1;i<evals.length;i++){const sw=Math.abs(evals[i]-evals[i-1]);if(sw>bigSwing){bigSwing=sw;turningPly=i;}}
    const tp=hist[turningPly-1];
    const prompt=`You are a chess coach writing a post-game review. Game data:
Moves: ${moveSummary.slice(0,700)}
White: accuracy ${wAcc}%, blunders ${wB}, CoolKid moves ${wCK}
Black: accuracy ${bAcc}%, blunders ${bB}, CoolKid moves ${bCK}
Turning point: move ${turningPly} (${tp?.san||'?'}) — eval swung ${(bigSwing/100).toFixed(1)} pawns

Write a 3-paragraph game review:
1. Opening — what opening was played, how both sides handled it
2. The key moment — what happened at the turning point and why it mattered
3. Summary — who played better, main lessons, what each player should work on

Be specific and encouraging. Write in flowing prose paragraphs, no bullet points.`;
    const story=await Engine.askClaude(prompt);
    el.innerHTML=story.split('\n\n').filter(p=>p.trim()).map(p=>`<p>${p.trim()}</p>`).join('');
  }

  /* ══ MOVE EXPLANATION ══ */
  async _explainMove(plyIdx){
    if(!this.history[plyIdx-1])return;
    const h=this.history[plyIdx-1],g=this.grades[plyIdx-1];
    if(!g||['book','best','good'].includes(g))return;
    const prevFen=this.snaps[plyIdx-1],color=h.color==='w'?'White':'Black';
    const bestUci=this.bestMoves[plyIdx-1],gradeLabel=Engine.gradeLabel(g);
    this._showExplainModal(`${color}: ${h.san} — ${gradeLabel}`,'Loading explanation…');
    const prompt=`You are a chess coach. ${color} played ${h.san} which was a ${gradeLabel}.
Position before move (FEN): ${prevFen}
Engine's best move was: ${bestUci||'unknown'}
In 2-3 sentences: (1) why ${h.san} was a ${gradeLabel.toLowerCase()}, (2) why ${bestUci||'the engine move'} is better. Be specific. No fluff.`;
    const text=await Engine.askClaude(prompt);
    this._updateExplainModal(text);
  }

  _showExplainModal(title,text){
    document.getElementById('explainTitle').textContent=title;
    document.getElementById('explainBody').textContent=text;
    document.getElementById('explainModal').classList.add('active');
  }
  _updateExplainModal(text){document.getElementById('explainBody').textContent=text;}

  /* ══ BOARD ══ */
  renderBoard(){
    const el=document.getElementById('chessboard'); el.innerHTML='';
    const b=this.chess.board;
    for(let vr=0;vr<8;vr++)for(let vc=0;vc<8;vc++){
      const r=this.flipped?7-vr:vr,c=this.flipped?7-vc:vc;
      const sq=document.createElement('div');
      sq.className='sq '+(((r+c)%2===0)?'light':'dark');
      if(this.selected?.[0]===r&&this.selected?.[1]===c)sq.classList.add('selected');
      if(this.lastMove){
        const a=String.fromCharCode(97+c)+(8-r);
        if(a===this.lastMove.from)sq.classList.add('last-from');
        if(a===this.lastMove.to){
          sq.classList.add('last-to');
          if(this.ply>0){const g=this.grades[this.ply-1];const sym=Engine.gradeSymbol(g);if(g&&sym&&g!=='book'){const bd=document.createElement('div');bd.className='sq-badge';bd.textContent=sym;bd.style.color=Engine.gradeColor(g);sq.appendChild(bd);}}
        }
      }
      if(this.chess.inCheck()){const k=this.chess._findKing(this.chess.turn);if(k?.[0]===r&&k?.[1]===c)sq.classList.add('check');}
      const piece=b[r][c];
      if(piece){const pe=document.createElement('div');pe.className='piece';pe.textContent=P[piece];pe.addEventListener('click',e=>{e.stopPropagation();this._click(r,c);});pe.draggable=true;pe.addEventListener('dragstart',e=>{this._click(r,c);e.dataTransfer.setData('text','');});sq.appendChild(pe);}
      if(this.targets.some(t=>t[0]===r&&t[1]===c)){const dot=document.createElement('div');dot.className='move-dot'+(piece?' cap':'');sq.appendChild(dot);}
      sq.addEventListener('click',()=>this._click(r,c));
      sq.addEventListener('dragover',e=>e.preventDefault());
      sq.addEventListener('drop',e=>{e.preventDefault();this._click(r,c);});
      el.appendChild(sq);
    }
    this._updateLabels(); this._updateFen();
  }

  _updateLabels(){
    const rs=this.flipped?['1','2','3','4','5','6','7','8']:['8','7','6','5','4','3','2','1'];
    const fs=this.flipped?['h','g','f','e','d','c','b','a']:['a','b','c','d','e','f','g','h'];
    document.getElementById('rankLabels').innerHTML=rs.map(r=>`<div>${r}</div>`).join('');
    document.getElementById('fileLabels').innerHTML=fs.map(f=>`<div>${f}</div>`).join('');
  }

  _click(r,c){
    const piece=this.chess.board[r][c],col=this.chess.turn;
    if(this.selected){
      const[sr,sc]=this.selected;
      if(sr===r&&sc===c){this.selected=null;this.targets=[];this.renderBoard();return;}
      if(this.targets.some(t=>t[0]===r&&t[1]===c)){this._tryMove([sr,sc],[r,c]);return;}
    }
    if(piece&&(this.chess._isW(piece)?'w':'b')===col){this.selected=[r,c];this.targets=this.chess.legalMoves([r,c]).map(m=>m.to);this.renderBoard();return;}
    this.selected=null;this.targets=[];this.renderBoard();
  }

  _tryMove(from,to){
    if(this.chess.legalMoves(from).filter(m=>m.to[0]===to[0]&&m.to[1]===to[1]&&m.promotion).length){this._showPromo(from,to);return;}
    this._afterMove(this.chess.move(from,to));
  }

  _afterMove(res){
    if(!res||res==='promotion')return;
    this.selected=null;this.targets=[];this.lastMove={from:res.from,to:res.to};
    this.snaps=this.snaps.slice(0,this.ply+1);this.history=this.history.slice(0,this.ply);
    this.grades=this.grades.slice(0,this.ply);this.bookFlags=this.bookFlags.slice(0,this.ply);
    this.bestMoves=this.bestMoves.slice(0,this.ply+1);
    this.snaps.push(this.chess.fen());this.history.push(res);this.grades.push(null);this.bookFlags.push(false);this.bestMoves.push(null);
    this.ply=this.snaps.length-1;
    this.renderBoard();this._renderMoves();this._analyze();
  }

  _showPromo(from,to){
    this.pendingPromo={from,to};const col=this.chess.turn;
    document.getElementById('promoPieces').innerHTML=(col==='w'?['Q','R','B','N']:['q','r','b','n']).map(p=>`<div class="promo-piece" data-p="${p}">${P[p]}</div>`).join('');
    document.querySelectorAll('.promo-piece').forEach(el=>{el.onclick=()=>{document.getElementById('promoOverlay').classList.remove('active');this._afterMove(this.chess.move(this.pendingPromo.from,this.pendingPromo.to,el.dataset.p));this.pendingPromo=null;};});
    document.getElementById('promoOverlay').classList.add('active');
  }

  /* ══ NAVIGATION ══ */
  _goTo(ply){
    if(ply<0||ply>=this.snaps.length)return;
    this.chess=new Chess(this.snaps[ply]);this.ply=ply;this.selected=null;this.targets=[];
    this.lastMove=ply>0&&this.history[ply-1]?{from:this.history[ply-1].from,to:this.history[ply-1].to}:null;
    this.renderBoard();this._highlightMove(ply);this._updateMoveBanner(ply);this._analyze();this._drawGraph();
  }

  _highlightMove(ply){
    document.querySelectorAll('.m-cell').forEach(el=>el.classList.toggle('active',+el.dataset.ply===ply));
    document.querySelector('.m-cell.active')?.scrollIntoView({block:'nearest',behavior:'smooth'});
  }

  _updateMoveBanner(ply){
    const banner=document.getElementById('moveBanner'); if(!banner)return;
    if(ply===0||!this.history[ply-1]){banner.style.display='none';return;}
    const h=this.history[ply-1],g=this.grades[ply-1];
    if(!g){banner.style.display='none';return;}
    const col=Engine.gradeColor(g),label=Engine.gradeLabel(g),sym=Engine.gradeSymbol(g);
    const canExplain=g&&!['book','best','good','excellent'].includes(g);
    banner.style.display='flex';banner.style.borderColor=col+'44';banner.style.background=col+'10';
    banner.innerHTML=`<div><span style="color:var(--text2);font-size:11px">${h.color==='w'?'White':'Black'}</span><span style="color:var(--text);font-weight:700;font-family:'JetBrains Mono',monospace;margin:0 6px">${h.san}</span><span style="color:${col};font-weight:800">${sym} ${label}</span></div>${canExplain?`<button class="explain-btn" onclick="window.app._explainMove(${ply})">Explain →</button>`:''}`;
  }

  /* ══ MOVE LIST ══ */
  _renderMoves(){
    const hist=this.history;
    if(!hist.length){document.getElementById('movesList').innerHTML='<div class="no-moves">No moves yet</div>';return;}
    const ICON={coolkid:'!!',best:'✓',excellent:'!',good:'·',inaccuracy:'?!',mistake:'?',blunder:'??',book:'📖'};
    let html='';
    for(let i=0;i<hist.length;i+=2){
      const num=Math.floor(i/2)+1,w=hist[i],bk=hist[i+1],wp=i+1,bp=i+2;
      const wg=this.grades[i],bg=this.grades[i+1];
      const cell=(h,g,plyIdx)=>{
        if(!h)return`<span class="m-cell" data-ply="${plyIdx}"></span>`;
        const isActive=this.ply===plyIdx,col=Engine.gradeColor(g),icon=ICON[g]||'';
        const canEx=g&&!['book','best','good','excellent',null].includes(g);
        return`<span class="m-cell${isActive?' active':''}" data-ply="${plyIdx}"><span class="m-san">${h.san}</span>${g?`<span class="m-icon" style="color:${isActive?'rgba(255,255,255,0.9)':col}">${icon}</span>`:''}</span>`;
      };
      html+=`<div class="move-pair"><span class="m-num">${num}.</span>${cell(w,wg,wp)}${cell(bk,bg,bp)}</div>`;
    }
    const el=document.getElementById('movesList');el.innerHTML=html;
    el.querySelectorAll('.m-cell[data-ply]').forEach(c=>c.addEventListener('click',()=>this._goTo(+c.dataset.ply)));
    document.querySelector('.m-cell.active')?.scrollIntoView({block:'nearest',behavior:'smooth'});
  }

  /* ══ ACCURACY ══ */
  _renderAccuracy(){
    const wa=Engine.accuracy(this.lossW),ba=Engine.accuracy(this.lossB);
    document.getElementById('whiteAcc').textContent=wa.toFixed(1)+'%';document.getElementById('whiteAcc').className='acc-pct';
    document.getElementById('blackAcc').textContent=ba.toFixed(1)+'%';document.getElementById('blackAcc').className='acc-pct';
    const count=isW=>{const c={};this.grades.forEach((g,i)=>{if(!g)return;if((i%2===0)===isW)c[g]=(c[g]||0)+1;});return c;};
    const chips=obj=>{
      const order=['coolkid','best','excellent','good','inaccuracy','mistake','blunder','book'];
      return order.filter(g=>obj[g]).map(g=>{const col=Engine.gradeColor(g);return`<span class="grade-chip" style="background:${col}18;color:${col};border:1px solid ${col}35"><strong>${obj[g]}</strong> ${Engine.gradeSymbol(g)} ${Engine.gradeLabel(g)}</span>`;}).join('');
    };
    document.getElementById('wGrades').innerHTML=chips(count(true));
    document.getElementById('bGrades').innerHTML=chips(count(false));
  }

  /* ══ GRAPH ══ */
  _drawGraph(){
    const canvas=document.getElementById('evalGraph'),W=canvas.offsetWidth||280,H=70;
    canvas.width=W;canvas.height=H;
    const ctx=canvas.getContext('2d'),evals=this.evalHist;
    ctx.clearRect(0,0,W,H);ctx.fillStyle='#1e2538';ctx.fillRect(0,0,W,H);
    ctx.strokeStyle='rgba(255,255,255,0.06)';ctx.setLineDash([3,4]);
    ctx.beginPath();ctx.moveTo(0,H/2);ctx.lineTo(W,H/2);ctx.stroke();ctx.setLineDash([]);
    if(evals.length<2){canvas.onclick=null;return;}
    const cl=v=>Math.max(-600,Math.min(600,v)),toY=v=>H/2-(cl(v)/600)*(H/2-5),toX=i=>(i/(evals.length-1))*W;
    ctx.beginPath();ctx.moveTo(toX(0),H/2);evals.forEach((v,i)=>ctx.lineTo(toX(i),v>0?toY(v):H/2));ctx.lineTo(toX(evals.length-1),H/2);ctx.closePath();ctx.fillStyle='rgba(225,234,254,0.15)';ctx.fill();
    ctx.beginPath();ctx.moveTo(toX(0),H/2);evals.forEach((v,i)=>ctx.lineTo(toX(i),v<0?toY(v):H/2));ctx.lineTo(toX(evals.length-1),H/2);ctx.closePath();ctx.fillStyle='rgba(59,130,246,0.2)';ctx.fill();
    ctx.beginPath();ctx.moveTo(toX(0),toY(evals[0]));evals.forEach((v,i)=>ctx.lineTo(toX(i),toY(v)));ctx.strokeStyle='#3b82f6';ctx.lineWidth=2;ctx.stroke();
    if(this.ply<evals.length){ctx.beginPath();ctx.arc(toX(this.ply),toY(evals[this.ply]),4,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();}
    canvas.onclick=e=>{const rect=canvas.getBoundingClientRect();const frac=(e.clientX-rect.left)/rect.width;this._goTo(Math.max(0,Math.min(this.snaps.length-1,Math.round(frac*(evals.length-1)))));this._drawGraph();};
  }

  /* ══ CHESS.COM ══ */
  _openGamesPanel(){document.getElementById('gamesPanel').classList.add('open');}
  _closeGamesPanel(){document.getElementById('gamesPanel').classList.remove('open');}
  async _searchPlayer(){
    const username=document.getElementById('gpInput').value.trim();if(!username)return;
    this.ccUsername=username;
    const listEl=document.getElementById('gpGamesList');
    listEl.innerHTML='<div class="gp-spinner"><div class="spinner"></div></div>';
    document.getElementById('gpPlayerCard').classList.remove('visible');
    try{
      const[player,stats]=await Promise.all([ChessComAPI.getPlayer(username).catch(()=>null),ChessComAPI.getStats(username).catch(()=>null)]);
      if(player){
        document.getElementById('gpPlayerName').textContent=player.username||username;
        document.getElementById('gpPlayerSub').textContent=`${player.country?.split('/').pop()||''} · Joined ${new Date(player.joined*1000).getFullYear()}`;
        const ratings=[];
        if(stats?.chess_blitz?.last?.rating)ratings.push(`⚡ ${stats.chess_blitz.last.rating}`);
        if(stats?.chess_rapid?.last?.rating)ratings.push(`⏱ ${stats.chess_rapid.last.rating}`);
        if(stats?.chess_bullet?.last?.rating)ratings.push(`🔥 ${stats.chess_bullet.last.rating}`);
        document.getElementById('gpRatings').innerHTML=ratings.map(r=>`<span class="rating-chip">${r}</span>`).join('');
        document.getElementById('gpPlayerCard').classList.add('visible');
      }
      const archives=await ChessComAPI.getArchives(username);
      if(!archives.length){listEl.innerHTML='<div class="gp-empty"><div class="gp-empty-icon">📭</div>No games found</div>';return;}
      const gamesArrays=await Promise.all(archives.slice(0,2).map(url=>ChessComAPI.getGames(url).catch(()=>[])));
      this.ccGames=gamesArrays.flat().slice(0,60);this._renderGames();
    }catch(e){listEl.innerHTML=`<div class="gp-empty"><div class="gp-empty-icon">❌</div>${e.message}</div>`;}
  }
  _renderGames(){
    const listEl=document.getElementById('gpGamesList'),username=this.ccUsername.toLowerCase();
    let games=this.ccGames;
    if(this.ccFilter!=='all')games=games.filter(g=>g.time_class===this.ccFilter);
    if(!games.length){listEl.innerHTML='<div class="gp-empty"><div class="gp-empty-icon">♟</div>No games in this category</div>';return;}
    listEl.innerHTML=games.slice(0,40).map((g,idx)=>{
      const res=ChessComAPI.resultLabel(g,username),rc=ChessComAPI.resultColor(res);
      const w=g.white?.username||'?',bl=g.black?.username||'?';
      const wR=g.white?.rating?` (${g.white.rating})`:'',bR=g.black?.rating?` (${g.black.rating})`:'';
      return`<div class="game-card" data-idx="${idx}"><div class="gc-top"><div class="gc-result" style="background:${rc}22;color:${rc};border:1px solid ${rc}44">${res}</div><div class="gc-players"><div class="gc-white">♔ ${w}${wR}</div><div class="gc-black">♚ ${bl}${bR}</div></div><button class="gc-analyze-btn" data-idx="${idx}">Analyse →</button></div><div class="gc-meta"><span>${ChessComAPI.timeLabel(g.time_class)}</span><span>📅 ${ChessComAPI.formatDate(g.end_time)}</span></div></div>`;
    }).join('');
    listEl.querySelectorAll('.gc-analyze-btn').forEach(btn=>{
      btn.addEventListener('click',e=>{e.stopPropagation();const game=games[+btn.dataset.idx];if(game?.pgn){document.getElementById('gameTitle').innerHTML=`<strong>${game.white?.username||'White'}</strong> vs <strong>${game.black?.username||'Black'}</strong>`;this._closeGamesPanel();this.runAnalysis(game.pgn);}else this.toast('No PGN for this game',true);});
    });
  }

  /* ══ PAGES ══ */
  showLanding(){document.getElementById('landingPage').style.display='flex';document.getElementById('analysisPage').classList.remove('active');document.getElementById('supportPage').classList.remove('active');document.getElementById('gamesPanel').classList.remove('open');}
  showAnalysis(){document.getElementById('landingPage').style.display='none';document.getElementById('analysisPage').classList.add('active');document.getElementById('supportPage').classList.remove('active');this.renderBoard();setTimeout(()=>this._drawGraph(),100);}
  showSupport(){document.getElementById('landingPage').style.display='none';document.getElementById('analysisPage').classList.remove('active');document.getElementById('supportPage').classList.add('active');}

  /* ══ MISC ══ */
  _showProgress(show,total=0){document.getElementById('progressOverlay').classList.toggle('active',show);if(show){document.getElementById('progBar').style.width='0%';document.getElementById('progStat').textContent=`0 / ${total}`;}}
  _hideProgress(){document.getElementById('progressOverlay').classList.remove('active');}
  _updateProgress(done,total){document.getElementById('progBar').style.width=(done/total*100)+'%';document.getElementById('progStat').textContent=`${done} / ${total} positions`;}
  _updateFen(){const el=document.getElementById('fenInput');if(el)el.value=this.chess.fen();}
  _loadFen(){const fen=document.getElementById('fenInput').value.trim();if(!fen)return;if(!this.chess.load(fen)){this.toast('Invalid FEN',true);return;}this.snaps=[fen];this.ply=0;this.history=[];this.grades=[];this.bookFlags=[];this.bestMoves=[null];this.evalHist=[];this.lossW=[];this.lossB=[];this.selected=null;this.targets=[];this.lastMove=null;this.renderBoard();this._renderMoves();this._analyze();this.toast('Position loaded');}
  _reset(){this.chess=new Chess();this.snaps=[Chess.START];this.ply=0;this.history=[];this.grades=[];this.bookFlags=[];this.bestMoves=[null];this.evalHist=[];this.lossW=[];this.lossB=[];this.selected=null;this.targets=[];this.lastMove=null;this.engineLines={};if(this.playing)this._togglePlay();this.renderBoard();this._renderMoves();['whiteAcc','blackAcc'].forEach(id=>{document.getElementById(id).textContent='—';document.getElementById(id).className='acc-pct pending';});document.getElementById('wGrades').innerHTML='';document.getElementById('bGrades').innerHTML='';document.getElementById('gameStorySection').style.display='none';const bm=document.getElementById('bestMoveRec');if(bm)bm.style.display='none';const cv=document.getElementById('evalGraph');cv.getContext('2d').clearRect(0,0,cv.width,cv.height);this._analyze();}
  _togglePlay(){this.playing=!this.playing;const btn=document.getElementById('navPlay');if(this.playing){btn.classList.add('playing');btn.textContent='⏸';this.playTimer=setInterval(()=>{if(this.ply>=this.snaps.length-1){this._togglePlay();return;}this._goTo(this.ply+1);this._drawGraph();},1000);}else{btn.classList.remove('playing');btn.textContent='▶';clearInterval(this.playTimer);}}
  _copyPgn(){const pgn=this.history.map((h,i)=>(h.color==='w'?`${Math.ceil((i+1)/2)}. `:'')+h.san).join(' ').trim();if(!pgn){this.toast('No moves yet');return;}navigator.clipboard.writeText(pgn).then(()=>this.toast('PGN copied!'));}
  toast(msg,err=false){document.querySelectorAll('.toast').forEach(t=>t.remove());const el=document.createElement('div');el.className='toast'+(err?' err':'');el.textContent=msg;document.body.appendChild(el);setTimeout(()=>el.remove(),2800);}

  _bindAll(){
    document.querySelectorAll('.i-tab').forEach(tab=>{tab.onclick=()=>{document.querySelectorAll('.i-tab').forEach(t=>t.classList.remove('active'));document.querySelectorAll('.i-pane').forEach(p=>p.classList.remove('active'));tab.classList.add('active');document.getElementById('pane-'+tab.dataset.tab).classList.add('active');};});
    document.getElementById('btnAnalyze').onclick=()=>this._handleLandingAnalyze();
    document.getElementById('btnFenLoad').onclick=()=>this._loadFenFromLanding();
    document.getElementById('btnFreeBoard').onclick=()=>{this.showAnalysis();this._analyze();};
    document.getElementById('btnSample').onclick=()=>this._loadSample();
    document.getElementById('btnSupport').onclick=()=>this.showSupport();
    document.getElementById('btnSupportNav').onclick=()=>this.showSupport();
    document.getElementById('btnBack').onclick=()=>this.showLanding();
    document.getElementById('topBrand').onclick=()=>this.showLanding();
    document.getElementById('btnCopyPgn').onclick=()=>this._copyPgn();
    document.getElementById('btnOpenGames').onclick=()=>this._openGamesPanel();
    document.getElementById('btnAnalysisSupport').onclick=()=>this.showSupport();
    document.getElementById('btnSupportBack').onclick=()=>this.showLanding();
    document.getElementById('gpClose').onclick=()=>this._closeGamesPanel();
    document.getElementById('gpSearchBtn').onclick=()=>this._searchPlayer();
    document.getElementById('gpInput').addEventListener('keydown',e=>{if(e.key==='Enter')this._searchPlayer();});
    document.querySelectorAll('.gp-filter').forEach(f=>{f.onclick=()=>{document.querySelectorAll('.gp-filter').forEach(x=>x.classList.remove('active'));f.classList.add('active');this.ccFilter=f.dataset.filter;this._renderGames();};});
    document.getElementById('btnFlip').onclick=()=>{this.flipped=!this.flipped;this.renderBoard();};
    document.getElementById('btnReset').onclick=()=>this._reset();
    document.getElementById('btnLoadFen').onclick=()=>this._loadFen();
    document.getElementById('btnCopyFen').onclick=()=>{navigator.clipboard.writeText(this.chess.fen()).then(()=>this.toast('FEN copied'));};
    document.getElementById('fenInput').addEventListener('keydown',e=>{if(e.key==='Enter')this._loadFen();});
    document.getElementById('navFirst').onclick=()=>this._goTo(0);
    document.getElementById('navPrev').onclick=()=>this._goTo(Math.max(0,this.ply-1));
    document.getElementById('navPlay').onclick=()=>this._togglePlay();
    document.getElementById('navNext').onclick=()=>this._goTo(Math.min(this.snaps.length-1,this.ply+1));
    document.getElementById('navLast').onclick=()=>this._goTo(this.snaps.length-1);
    document.getElementById('depthSlider').oninput=e=>{document.getElementById('depthVal').textContent=e.target.value;this._analyze();};
    document.getElementById('explainClose').onclick=()=>document.getElementById('explainModal').classList.remove('active');
    document.getElementById('explainModal').addEventListener('click',e=>{if(e.target===document.getElementById('explainModal'))document.getElementById('explainModal').classList.remove('active');});
    document.addEventListener('keydown',e=>{if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA')return;if(e.key==='ArrowLeft')this._goTo(Math.max(0,this.ply-1));if(e.key==='ArrowRight')this._goTo(Math.min(this.snaps.length-1,this.ply+1));if(e.key==='Home')this._goTo(0);if(e.key==='End')this._goTo(this.snaps.length-1);if(e.key==='f'){this.flipped=!this.flipped;this.renderBoard();}if(e.key==='Escape'){this._closeGamesPanel();document.getElementById('explainModal').classList.remove('active');}});
  }

  async _handleLandingAnalyze(){const pgn=document.getElementById('pgnInput').value.trim();if(!pgn){this.toast('Paste a PGN first',true);return;}const wm=pgn.match(/\[White "([^"]+)"\]/),bm=pgn.match(/\[Black "([^"]+)"\]/);document.getElementById('gameTitle').innerHTML=`<strong>${wm?.[1]||'White'}</strong> vs <strong>${bm?.[1]||'Black'}</strong>`;await this.runAnalysis(pgn);}
  _loadFenFromLanding(){const fen=document.getElementById('fenInputLanding').value.trim();if(!fen){this.toast('Enter a FEN',true);return;}if(!this.chess.load(fen)){this.toast('Invalid FEN',true);return;}this.snaps=[fen];this.ply=0;this.history=[];this.grades=[];this.bookFlags=[];this.bestMoves=[null];this.evalHist=[];this.lossW=[];this.lossB=[];this.selected=null;this.targets=[];this.lastMove=null;document.getElementById('gameTitle').innerHTML='FEN Position';this.showAnalysis();this._analyze();}
  _loadSample(){document.querySelectorAll('.i-tab').forEach(t=>t.classList.remove('active'));document.querySelectorAll('.i-pane').forEach(p=>p.classList.remove('active'));document.querySelector('[data-tab="pgn"]').classList.add('active');document.getElementById('pane-pgn').classList.add('active');document.getElementById('pgnInput').value=`[Event "Immortal Game"][White "Adolf Anderssen"][Black "Lionel Kieseritzky"][Result "1-0"]\n1. e4 e5 2. f4 exf4 3. Bc4 Qh4+ 4. Kf1 b5 5. Bxb5 Nf6 6. Nf3 Qh6\n7. d3 Nh5 8. Nh4 Qg5 9. Nf5 c6 10. g4 Nf6 11. Rg1 cxb5 12. h4 Qg6\n13. h5 Qg5 14. Qf3 Ng8 15. Bxf4 Qf6 16. Nc3 Bc5 17. Nd5 Qxb2\n18. Bd6 Bxg1 19. e5 Qxa1+ 20. Ke2 Na6 21. Nxg7+ Kd8 22. Qf6+ Nxf6 23. Be7# 1-0`;}
}

document.addEventListener('DOMContentLoaded',()=>{window.app=new App();});
