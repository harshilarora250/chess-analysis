/* chesscom.js - Chess.com public API integration */
class ChessComAPI {
  static BASE = 'https://api.chess.com/pub';

  static async getPlayer(username) {
    const r = await fetch(`${this.BASE}/player/${username.toLowerCase()}`, {
      headers: { 'User-Agent': 'ChessCalc/1.0 (chesscalc.app)' }
    });
    if (!r.ok) throw new Error(r.status === 404 ? 'Player not found' : 'API error');
    return r.json();
  }

  static async getStats(username) {
    const r = await fetch(`${this.BASE}/player/${username.toLowerCase()}/stats`, {
      headers: { 'User-Agent': 'ChessCalc/1.0' }
    });
    if (!r.ok) throw new Error('Could not fetch stats');
    return r.json();
  }

  static async getArchives(username) {
    const r = await fetch(`${this.BASE}/player/${username.toLowerCase()}/games/archives`, {
      headers: { 'User-Agent': 'ChessCalc/1.0' }
    });
    if (!r.ok) throw new Error('Could not fetch archives');
    const data = await r.json();
    return (data.archives || []).reverse(); // most recent first
  }

  static async getGames(archiveUrl) {
    const r = await fetch(archiveUrl, {
      headers: { 'User-Agent': 'ChessCalc/1.0' }
    });
    if (!r.ok) throw new Error('Could not fetch games');
    const data = await r.json();
    return (data.games || []).reverse(); // most recent first
  }

  static formatDate(ts) {
    if (!ts) return '—';
    return new Date(ts * 1000).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  }

  static resultLabel(game, username) {
    const uname = username.toLowerCase();
    const isWhite = game.white?.username?.toLowerCase() === uname;
    const result = isWhite ? game.white?.result : game.black?.result;
    if (!result) return '—';
    if (result === 'win') return 'W';
    if (['checkmated','resigned','timeout','abandoned','lose'].includes(result)) return 'L';
    return 'D';
  }

  static resultColor(label) {
    return { W: '#4ade80', L: '#f87171', D: '#94a3b8' }[label] || '#94a3b8';
  }

  static timeLabel(timeClass, timeControl) {
    const icons = { bullet:'⚡', blitz:'🔥', rapid:'⏱', daily:'📅', classical:'🕰' };
    return (icons[timeClass] || '♟') + ' ' + (timeClass || '?');
  }
}
