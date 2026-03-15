/* openings.js — Opening book using move sequences (trie)
 *
 * How it works:
 *   We store hundreds of known theory lines as UCI move sequences.
 *   We replay the game's moves through the trie as we go.
 *   A move is "Book" if it exists in the trie at the current node.
 *   This is 100% accurate — only actual theory lines get the Book label.
 */

const OPENING_BOOK = (() => {

  // Each line is a space-separated sequence of UCI moves
  // These cover the most common ECO lines to ~10-15 moves deep
  const LINES = [
    // ── 1.e4 ──────────────────────────────────────────
    'e2e4',

    // 1...e5 Open Game
    'e2e4 e7e5',
    'e2e4 e7e5 g1f3',
    'e2e4 e7e5 g1f3 b8c6',
    'e2e4 e7e5 g1f3 b8c6 f1c4',                          // Italian
    'e2e4 e7e5 g1f3 b8c6 f1c4 g8f6',                     // Two Knights
    'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5',                     // Italian Bc5
    'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3',
    'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 g8f6',
    'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 d7d6',
    'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 e1g1',
    'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 d2d3',
    'e2e4 e7e5 g1f3 b8c6 f1b5',                          // Ruy Lopez
    'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6',                     // Morphy Defense
    'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4',
    'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6',
    'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1',
    'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f8e7',
    'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f8e7 f1e1',
    'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f8e7 f1e1 b7b5',
    'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f8e7 f1e1 b7b5 a4b3',
    'e2e4 e7e5 g1f3 b8c6 f1b5 f7f5',                     // Schliemann
    'e2e4 e7e5 g1f3 b8c6 f1b5 g8f6',                     // Berlin
    'e2e4 e7e5 g1f3 b8c6 f1b5 g8f6 e1g1',
    'e2e4 e7e5 g1f3 b8c6 f1b5 d7d6',                     // Steinitz
    'e2e4 e7e5 g1f3 b8c6 d2d4',                          // Scotch
    'e2e4 e7e5 g1f3 b8c6 d2d4 e5d4',
    'e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4',
    'e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4 g8f6',
    'e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4 f8c5',
    'e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4 d8h4',           // Scotch Haxo
    'e2e4 e7e5 g1f3 b8c6 b1c3',                          // Three Knights
    'e2e4 e7e5 g1f3 b8c6 b1c3 g8f6',                     // Four Knights
    'e2e4 e7e5 g1f3 b8c6 b1c3 g8f6 f1b5',                // Spanish Four Knights
    'e2e4 e7e5 g1f3 g8f6',                               // Petrov
    'e2e4 e7e5 g1f3 g8f6 f3e5',
    'e2e4 e7e5 g1f3 g8f6 f3e5 d7d6',
    'e2e4 e7e5 g1f3 g8f6 f3e5 d7d6 e5f3 f6e4',
    'e2e4 e7e5 g1f3 g8f6 d2d4',                          // Petrov 3.d4
    'e2e4 e7e5 f2f4',                                    // King's Gambit
    'e2e4 e7e5 f2f4 e5f4',
    'e2e4 e7e5 f2f4 e5f4 g1f3',
    'e2e4 e7e5 f2f4 e5f4 g1f3 g7g5',
    'e2e4 e7e5 f2f4 f8c5',                               // King's Gambit Declined
    'e2e4 e7e5 b1c3',                                    // Vienna
    'e2e4 e7e5 b1c3 g8f6',
    'e2e4 e7e5 b1c3 b8c6',
    'e2e4 e7e5 f1c4',                                    // Bishop's Opening
    'e2e4 e7e5 f1c4 g8f6',
    'e2e4 e7e5 f1c4 f8c5',

    // 1...c5 Sicilian
    'e2e4 c7c5',
    'e2e4 c7c5 g1f3',
    'e2e4 c7c5 g1f3 d7d6',
    'e2e4 c7c5 g1f3 d7d6 d2d4',
    'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4',
    'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4',
    'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6',
    'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3',
    'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6',  // Najdorf
    'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 g7g6',  // Dragon
    'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 g7g6 c1e3',
    'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 g7g6 c1e3 f8g7',
    'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 e7e6',  // Scheveningen
    'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 b8c6',  // Classical
    'e2e4 c7c5 g1f3 b8c6',
    'e2e4 c7c5 g1f3 b8c6 d2d4',
    'e2e4 c7c5 g1f3 b8c6 d2d4 c5d4 f3d4',
    'e2e4 c7c5 g1f3 b8c6 d2d4 c5d4 f3d4 g8f6 b1c3',
    'e2e4 c7c5 g1f3 b8c6 d2d4 c5d4 f3d4 g8f6 b1c3 d7d6',
    'e2e4 c7c5 g1f3 b8c6 d2d4 c5d4 f3d4 g8f6 b1c3 e7e5',
    'e2e4 c7c5 g1f3 e7e6',
    'e2e4 c7c5 g1f3 e7e6 d2d4',
    'e2e4 c7c5 g1f3 e7e6 d2d4 c5d4 f3d4',
    'e2e4 c7c5 g1f3 e7e6 d2d4 c5d4 f3d4 a7a6',           // Kan
    'e2e4 c7c5 g1f3 e7e6 d2d4 c5d4 f3d4 b8c6',
    'e2e4 c7c5 b1c3',
    'e2e4 c7c5 b1c3 b8c6',
    'e2e4 c7c5 b1c3 g7g6',                               // Accelerated Dragon
    'e2e4 c7c5 c2c3',                                    // Alapin
    'e2e4 c7c5 c2c3 d7d5',
    'e2e4 c7c5 c2c3 g8f6',
    'e2e4 c7c5 d2d4',                                    // Smith-Morra
    'e2e4 c7c5 f2f4',                                    // Grand Prix Attack

    // 1...e6 French
    'e2e4 e7e6',
    'e2e4 e7e6 d2d4',
    'e2e4 e7e6 d2d4 d7d5',
    'e2e4 e7e6 d2d4 d7d5 b1c3',                          // Classical/Winawer
    'e2e4 e7e6 d2d4 d7d5 b1c3 f8b4',                     // Winawer
    'e2e4 e7e6 d2d4 d7d5 b1c3 f8b4 e4e5',
    'e2e4 e7e6 d2d4 d7d5 b1c3 f8b4 e4e5 c7c5',
    'e2e4 e7e6 d2d4 d7d5 b1c3 g8f6',                     // Classical
    'e2e4 e7e6 d2d4 d7d5 b1c3 g8f6 c1g5',
    'e2e4 e7e6 d2d4 d7d5 b1d2',                          // Tarrasch
    'e2e4 e7e6 d2d4 d7d5 b1d2 g8f6',
    'e2e4 e7e6 d2d4 d7d5 b1d2 c7c5',
    'e2e4 e7e6 d2d4 d7d5 e4e5',                          // Advance
    'e2e4 e7e6 d2d4 d7d5 e4e5 c7c5',
    'e2e4 e7e6 d2d4 d7d5 e4e5 c7c5 c2c3',
    'e2e4 e7e6 d2d4 d7d5 e4d5',                          // Exchange

    // 1...c6 Caro-Kann
    'e2e4 c7c6',
    'e2e4 c7c6 d2d4',
    'e2e4 c7c6 d2d4 d7d5',
    'e2e4 c7c6 d2d4 d7d5 b1c3',
    'e2e4 c7c6 d2d4 d7d5 b1c3 d5e4',                     // Classical
    'e2e4 c7c6 d2d4 d7d5 b1c3 d5e4 c3e4 c8f5',
    'e2e4 c7c6 d2d4 d7d5 b1c3 d5e4 c3e4 g8f6',
    'e2e4 c7c6 d2d4 d7d5 e4e5',                          // Advance
    'e2e4 c7c6 d2d4 d7d5 e4d5',                          // Exchange
    'e2e4 c7c6 d2d4 d7d5 b1d2',                          // Modern
    'e2e4 c7c6 d2d4 d7d5 b1d2 d5e4 d2e4 g8f6',

    // 1...d5 Scandinavian
    'e2e4 d7d5',
    'e2e4 d7d5 e4d5',
    'e2e4 d7d5 e4d5 d8d5',
    'e2e4 d7d5 e4d5 d8d5 b1c3',
    'e2e4 d7d5 e4d5 d8d5 b1c3 d5a5',
    'e2e4 d7d5 e4d5 d8d5 b1c3 d5d6',
    'e2e4 d7d5 e4d5 g8f6',                               // Modern Scandinavian

    // 1...Nf6 Alekhine
    'e2e4 g8f6',
    'e2e4 g8f6 e4e5',
    'e2e4 g8f6 e4e5 f6d5',
    'e2e4 g8f6 e4e5 f6d5 d2d4 d7d6',

    // 1...d6 Pirc/Modern
    'e2e4 d7d6',
    'e2e4 d7d6 d2d4',
    'e2e4 d7d6 d2d4 g8f6',
    'e2e4 d7d6 d2d4 g8f6 b1c3',
    'e2e4 d7d6 d2d4 g8f6 b1c3 g7g6',                     // Pirc
    'e2e4 g7g6',                                          // Modern
    'e2e4 g7g6 d2d4 f8g7',

    // ── 1.d4 ──────────────────────────────────────────
    'd2d4',

    // 1...d5
    'd2d4 d7d5',
    'd2d4 d7d5 c2c4',                                    // Queen's Gambit
    'd2d4 d7d5 c2c4 e7e6',                               // QGD
    'd2d4 d7d5 c2c4 e7e6 b1c3',
    'd2d4 d7d5 c2c4 e7e6 b1c3 g8f6',
    'd2d4 d7d5 c2c4 e7e6 b1c3 g8f6 c1g5',                // Classical QGD
    'd2d4 d7d5 c2c4 e7e6 b1c3 f8e7',
    'd2d4 d7d5 c2c4 e7e6 g1f3',
    'd2d4 d7d5 c2c4 e7e6 g1f3 g8f6 b1c3',
    'd2d4 d7d5 c2c4 e7e6 g1f3 g8f6 b1c3 c7c6',           // Semi-Slav
    'd2d4 d7d5 c2c4 e7e6 g1f3 g8f6 b1c3 f8e7',
    'd2d4 d7d5 c2c4 e7e6 g1f3 g8f6 b1c3 c7c5',           // Tarrasch QGD
    'd2d4 d7d5 c2c4 c7c6',                               // Slav
    'd2d4 d7d5 c2c4 c7c6 g1f3',
    'd2d4 d7d5 c2c4 c7c6 g1f3 g8f6',
    'd2d4 d7d5 c2c4 c7c6 g1f3 g8f6 b1c3',
    'd2d4 d7d5 c2c4 c7c6 b1c3',
    'd2d4 d7d5 c2c4 c7c6 b1c3 g8f6',
    'd2d4 d7d5 c2c4 d5c4',                               // QGA
    'd2d4 d7d5 c2c4 d5c4 g1f3',
    'd2d4 d7d5 c2c4 d5c4 e2e4',
    'd2d4 d7d5 g1f3',
    'd2d4 d7d5 g1f3 g8f6',
    'd2d4 d7d5 g1f3 g8f6 c1f4',                          // London
    'd2d4 d7d5 g1f3 g8f6 c1f4 e7e6',
    'd2d4 d7d5 g1f3 g8f6 c1f4 c7c5',
    'd2d4 d7d5 g1f3 g8f6 c1g5',                          // Torre
    'd2d4 d7d5 g1f3 g8f6 e2e3',
    'd2d4 d7d5 g1f3 c7c6 c1f4',

    // 1...Nf6 Indian Systems
    'd2d4 g8f6',
    'd2d4 g8f6 c2c4',
    'd2d4 g8f6 c2c4 g7g6',                               // King's Indian / Grünfeld
    'd2d4 g8f6 c2c4 g7g6 b1c3',
    'd2d4 g8f6 c2c4 g7g6 b1c3 f8g7',
    'd2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4',                // King's Indian
    'd2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6',
    'd2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6 g1f3',
    'd2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6 g1f3 e8g8',
    'd2d4 g8f6 c2c4 g7g6 b1c3 d7d5',                     // Grünfeld
    'd2d4 g8f6 c2c4 g7g6 b1c3 d7d5 c4d5',
    'd2d4 g8f6 c2c4 g7g6 b1c3 d7d5 c4d5 f6d5',
    'd2d4 g8f6 c2c4 g7g6 b1c3 d7d5 c4d5 f6d5 e2e4',
    'd2d4 g8f6 c2c4 e7e6',
    'd2d4 g8f6 c2c4 e7e6 b1c3',
    'd2d4 g8f6 c2c4 e7e6 b1c3 f8b4',                     // Nimzo-Indian
    'd2d4 g8f6 c2c4 e7e6 b1c3 f8b4 e2e3',
    'd2d4 g8f6 c2c4 e7e6 b1c3 f8b4 d1c2',
    'd2d4 g8f6 c2c4 e7e6 b1c3 f8b4 a2a3',
    'd2d4 g8f6 c2c4 e7e6 g1f3',
    'd2d4 g8f6 c2c4 e7e6 g1f3 d7d5',                     // Queen's Indian-like
    'd2d4 g8f6 c2c4 e7e6 g1f3 b7b6',                     // Queen's Indian
    'd2d4 g8f6 c2c4 e7e6 g1f3 b7b6 b1c3',
    'd2d4 g8f6 c2c4 e7e6 g1f3 b7b6 g2g3',
    'd2d4 g8f6 c2c4 e7e6 g2g3',                          // Catalan
    'd2d4 g8f6 c2c4 e7e6 g2g3 d7d5',
    'd2d4 g8f6 c2c4 e7e6 g2g3 d7d5 g1f3',
    'd2d4 g8f6 c2c4 c7c5',                               // Benoni
    'd2d4 g8f6 c2c4 c7c5 d4d5',
    'd2d4 g8f6 c2c4 c7c5 d4d5 e7e6',
    'd2d4 g8f6 g1f3',
    'd2d4 g8f6 g1f3 g7g6',
    'd2d4 g8f6 g1f3 e7e6',
    'd2d4 g8f6 g1f3 d7d5',

    // 1...f5 Dutch
    'd2d4 f7f5',
    'd2d4 f7f5 g2g3',
    'd2d4 f7f5 g2g3 g8f6',
    'd2d4 f7f5 c2c4',
    'd2d4 f7f5 c2c4 g8f6',
    'd2d4 f7f5 b1c3',

    // ── 1.c4 English ──────────────────────────────────
    'c2c4',
    'c2c4 e7e5',
    'c2c4 e7e5 b1c3',
    'c2c4 e7e5 b1c3 g8f6',
    'c2c4 e7e5 b1c3 f8b4',
    'c2c4 e7e5 g1f3',
    'c2c4 c7c5',
    'c2c4 c7c5 b1c3',
    'c2c4 c7c5 g1f3',
    'c2c4 g8f6',
    'c2c4 g8f6 b1c3',
    'c2c4 g8f6 g1f3',
    'c2c4 e7e6',
    'c2c4 e7e6 b1c3',
    'c2c4 d7d6',
    'c2c4 g7g6',

    // ── 1.Nf3 ──────────────────────────────────────────
    'g1f3',
    'g1f3 d7d5',
    'g1f3 d7d5 c2c4',
    'g1f3 d7d5 g2g3',
    'g1f3 g8f6',
    'g1f3 g8f6 c2c4',
    'g1f3 g8f6 g2g3',
    'g1f3 c7c5',
    'g1f3 c7c5 c2c4',
    'g1f3 e7e6',
    'g1f3 f7f5',

    // ── 1.d4 d5 2.Nf3 (London etc) ────────────────────
    'd2d4 d7d5 g1f3 g8f6 c1f4 e7e6 e2e3',
    'd2d4 d7d5 g1f3 g8f6 c1f4 e7e6 e2e3 f8d6',
    'd2d4 d7d5 g1f3 g8f6 c1f4 e7e6 e2e3 c7c5',

    // ── 1.g3 / 1.b3 / 1.f4 ────────────────────────────
    'g2g3',
    'g2g3 d7d5',
    'g2g3 g8f6',
    'b2b3',
    'b2b3 e7e5',
    'b2b3 d7d5',
    'f2f4',
  ];

  // Build a trie from the move sequences
  // Each node: { children: Map<uci, node>, isBook: bool }
  const root = { children: new Map() };

  for (const line of LINES) {
    const moves = line.trim().split(' ').filter(Boolean);
    let node = root;
    for (const uci of moves) {
      if (!node.children.has(uci)) {
        node.children.set(uci, { children: new Map() });
      }
      node = node.children.get(uci);
    }
    node.isTerminal = true;
  }

  // The book walker — created fresh per game
  // Call .reset() at the start of a game, then .checkMove(uci) for each move
  return {
    createWalker() {
      let node = root;
      let inBook = true;

      return {
        // Returns 'book' if the move is theory, null otherwise.
        // Call in order for each move of the game.
        checkMove(uci) {
          if (!inBook || !node) return null;
          const key = uci.toLowerCase();
          if (node.children.has(key)) {
            node = node.children.get(key);
            return 'book';
          }
          // Move not in trie — we've left theory
          inBook = false;
          node = null;
          return null;
        },

        reset() {
          node = root;
          inBook = true;
        }
      };
    }
  };

})();
