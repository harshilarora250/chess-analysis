/* openings.js — ECO opening book for book move detection */
/* FEN prefixes of well-known opening lines (first 10-15 moves) */
const OPENING_BOOK = (() => {
  // We store known book positions as a Set of FEN strings (position only, no clocks)
  // Generated from common ECO lines
  const lines = [
    // Starting position
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -',
    // 1.e4
    'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -',
    // 1...e5
    'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -',
    // 1...c5 Sicilian
    'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -',
    // 1...e6 French
    'rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -',
    // 1...c6 Caro-Kann
    'rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -',
    // 1...d5 Scandinavian
    'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -',
    // 1...Nf6 Alekhine
    'rnbqkb1r/pppppppp/5n2/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -',
    // 1.d4
    'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq -',
    // 1.Nf3
    'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq -',
    // 1.c4 English
    'rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq -',
    // 1.g3
    'rnbqkbnr/pppppppp/8/8/8/6P1/PPPPPP1P/RNBQKBNR b KQkq -',
    // Italian: 1.e4 e5 2.Nf3 Nc6 3.Bc4
    'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq -',
    // Ruy Lopez: 1.e4 e5 2.Nf3 Nc6 3.Bb5
    'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq -',
    // Scotch: 1.e4 e5 2.Nf3 Nc6 3.d4
    'r1bqkbnr/pppp1ppp/2n5/4p3/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq -',
    // King's Gambit: 1.e4 e5 2.f4
    'rnbqkbnr/pppp1ppp/8/4p3/4PP2/8/PPPP2PP/RNBQKBNR b KQkq -',
    // Sicilian Najdorf: 1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6
    'rnbqkb1r/1p2pppp/p2p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq -',
    // French Defense: 1.e4 e6 2.d4 d5
    'rnbqkbnr/ppp2ppp/4p3/3p4/3PP3/8/PPP2PPP/RNBQKBNR w KQkq -',
    // Caro-Kann: 1.e4 c6 2.d4 d5
    'rnbqkbnr/pp2pppp/2p5/3p4/3PP3/8/PPP2PPP/RNBQKBNR w KQkq -',
    // Queen's Gambit: 1.d4 d5 2.c4
    'rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq -',
    // King's Indian: 1.d4 Nf6 2.c4 g6
    'rnbqkb1r/pppppp1p/5np1/8/2PP4/8/PP2PPPP/RNBQKBNR w KQkq -',
    // Nimzo-Indian: 1.d4 Nf6 2.c4 e6 3.Nc3 Bb4
    'rnbqk2r/pppp1ppp/4pn2/8/1bPP4/2N5/PP2PPPP/R1BQKBNR w KQkq -',
    // Grünfeld: 1.d4 Nf6 2.c4 g6 3.Nc3 d5
    'rnbqkb1r/ppp1pp1p/5np1/3p4/2PP4/2N5/PP2PPPP/R1BQKBNR w KQkq -',
    // Queen's Gambit Declined
    'rnbqkbnr/ppp2ppp/4p3/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq -',
    // Slav Defense
    'rnbqkbnr/pp2pppp/2p5/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq -',
    // English Opening: 1.c4 e5
    'rnbqkbnr/pppp1ppp/8/4p3/2P5/8/PP1PPPPP/RNBQKBNR w KQkq -',
    // Pirc Defense: 1.e4 d6 2.d4 Nf6
    'rnbqkb1r/ppp1pppp/3p1n2/8/3PP3/8/PPP2PPP/RNBQKBNR w KQkq -',
    // Dutch Defense: 1.d4 f5
    'rnbqkbnr/ppppp1pp/8/5p2/3P4/8/PPP1PPPP/RNBQKBNR w KQkq -',
    // London System: 1.d4 d5 2.Nf3 Nf6 3.Bf4
    'rnbqkb1r/ppp1pppp/5n2/3p4/3P1B2/5N2/PPP1PPPP/RN1QKB1R b KQkq -',
    // Reti Opening: 1.Nf3 d5 2.c4
    'rnbqkbnr/ppp1pppp/8/3p4/2P5/5N2/PP1PPPPP/RNBQKB1R b KQkq -',
    // Four Knights: 1.e4 e5 2.Nf3 Nc6 3.Nc3 Nf6
    'r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/2N2N2/PPPP1PPP/R1BQKB1R w KQkq -',
    // Petrov: 1.e4 e5 2.Nf3 Nf6
    'rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -',
    // Two Knights: 1.e4 e5 2.Nf3 Nc6 3.Bc4 Nf6
    'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq -',
    // Vienna Game: 1.e4 e5 2.Nc3
    'rnbqkbnr/pppp1ppp/8/4p3/4P3/2N5/PPPP1PPP/R1BQKBNR b KQkq -',
    // Bishop's Opening: 1.e4 e5 2.Bc4
    'rnbqkbnr/pppp1ppp/8/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR b KQkq -',
    // Sicilian Dragon: 1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 g6
    'rnbqkb1r/pp2pp1p/3p1np1/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq -',
    // Sicilian Scheveningen
    'rnbqkb1r/pp3ppp/4pn2/2pp4/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq -',
    // Benoni Defense: 1.d4 Nf6 2.c4 c5
    'rnbqkb1r/pp1ppppp/5n2/2p5/2PP4/8/PP2PPPP/RNBQKBNR w KQkq -',
    // Catalan Opening: 1.d4 Nf6 2.c4 e6 3.g3
    'rnbqkb1r/pppp1ppp/4pn2/8/2PP4/6P1/PP2PP1P/RNBQKBNR b KQkq -',
    // Budapest Gambit: 1.d4 Nf6 2.c4 e5
    'rnbqkb1r/pppp1ppp/5n2/4p3/2PP4/8/PP2PPPP/RNBQKBNR w KQkq -',
  ];

  const bookSet = new Set(lines);

  return {
    isBook(fen) {
      // Compare only the position part (first field of FEN)
      const pos = fen.split(' ').slice(0, 4).join(' ');
      return bookSet.has(pos);
    },

    // Check if a position is within book depth (ply <= 20)
    isBookPly(ply) {
      return ply <= 20;
    }
  };
})();
