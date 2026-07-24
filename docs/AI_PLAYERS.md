# The AI opponents

Every AI seat gets a random name and one of seven **personalities**. A
personality is just three knobs on the same decision pipeline:

| Personality | Emoji | `tight` | `aggr` | `bluff` | Table image |
| --- | :-: | :-: | :-: | :-: | --- |
| The Rock | 🪨 | 1.30 | 0.55 | 0.03 | Plays almost nothing; a bet means it. |
| Professor | 🎓 | 1.10 | 0.90 | 0.08 | Solid and by-the-book. |
| Shark | 🦈 | 1.00 | 1.15 | 0.14 | Balanced, applies pressure. |
| Gambler | 🎲 | 0.80 | 1.05 | 0.18 | Loose and sporty. |
| Maniac | 🔥 | 0.60 | 1.45 | 0.28 | Raises first, thinks later. |
| Tourist | 🧢 | 0.75 | 0.45 | 0.05 | Calls too much, raises too little. |
| Night Owl | 🦉 | 1.15 | 0.75 | 0.10 | Patient, a little sneaky. |

- **`tight`** scales every hand-strength threshold — higher means fewer hands
  played.
- **`aggr`** scales raise frequency and sizing.
- **`bluff`** is the base probability of betting with nothing.

## Decision pipeline

### Pre-flop: Chen formula + position

Hole cards are scored with the classic **Chen formula** (AA = 20, AKs = 12, 7-2o
negative), given a small multiplicative jitter so play isn't robotic, then a
**position bonus** (up to +1.5) for having fewer players left to act. The
effective score is compared against open / call / three-bet thresholds, each
scaled by `tight`; facing a raise the thresholds jump sharply, and calling a
bet that's large relative to the stack requires near-premium strength.

### Post-flop: Monte Carlo equity vs pot odds

The AI estimates its **equity** — the probability its hand wins at showdown —
by simulation: deal random hole cards to every live opponent and random cards to
complete the board, evaluate everyone, repeat ~160 times (ties split evenly
among the tied hands). This runs in a few milliseconds and naturally understands draws,
blockers, and multiway pressure without any hand-coded heuristics.

The action then falls out of comparing equity to the price:

- **Facing a bet:** call while `equity > pot odds + margin` (margin scales with
  `tight`); raise when equity clears a much higher bar (probability scaled by
  `aggr`); occasionally bluff-raise cheap bets (`bluff`); make a slightly
  losing “crying call” only when the price is tiny.
- **Checked to:** value-bet strong equity, stab sometimes with decent equity,
  bluff at the `bluff` rate, otherwise check.
- **Sizing:** raises target roughly ½–1× pot, scaled by `aggr`, jittered,
  rounded to whole small blinds, and clamped by the engine to the legal window.

## Reproducibility

The AI draws every random number from the game's seeded RNG
(`mulberry32`), so a table created with a fixed seed replays identically —
which is how the determinism test can assert that 20 hands of 4 AI players
produce byte-identical stacks twice in a row. In the browser each session is
seeded from the clock, so no two nights are alike.

## Honest limitations

It's a fun home-game opponent, not a solver: it doesn't model *your* range or
betting patterns, doesn't remember previous hands, and can be exploited once
you spot a personality's habits (that's half the fun). The `iters` parameter
(default 160 in-game, lower in tests for speed) bounds how sharp its equity
estimates are.
