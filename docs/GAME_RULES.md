# Game rules implemented

The game is standard **no-limit Texas Hold'em**, cash-game style, at fixed
5/10 blinds with a 1,000-chip buy-in. This page states precisely what the
engine enforces, because the details are where poker implementations usually
go wrong — each of these is locked in by `tests/run-tests.mjs`.

## Table structure

- 2–8 seats (you + 1–7 AI). The dealer button rotates one live player clockwise
  after every hand.
- **Blinds:** small blind left of the button, big blind next.
  **Heads-up exception:** the button posts the small blind, acts **first**
  pre-flop, and acts **second** on every later street.
- **First to act:** pre-flop, the player left of the big blind; post-flop, the
  first live player left of the button.
- **Big blind's option:** if the pot is unraised pre-flop, the big blind still
  gets a turn and may check or raise.
- A player whose stack can't cover a blind posts all-in for less; the amount
  for others to call remains the full blind.

## Betting

- **All betting is “raise to” a total for the street.** The engine clamps any
  requested raise into the legal window, so an out-of-range size becomes the
  nearest legal one.
- **Opening bet minimum** is one big blind.
- **Minimum raise** is the size of the last bet or raise on that street (so
  pre-flop the first raise is to at least 2×BB, and after a raise from 10 to
  50, the next raise must be to at least 90).
- **All-in for less than a minimum raise** is allowed, but it does **not
  re-open the betting**: players who already acted may call the extra amount or
  fold, but may not raise again. A full-size raise re-opens action for
  everyone.
- A betting round closes when every live, non-all-in player has acted and
  matched the highest bet. If everyone folds to one player, the hand ends
  immediately and they collect the pot (which automatically returns any
  uncalled excess of their own bet).
- When no further betting is possible (everyone remaining is all-in, or all but
  one), hole cards are revealed and the board **runs out** street by street.

## Showdown and pots

- Best five-card hand from any combination of two hole cards and the five
  community cards; standard rankings, ace plays high or low in straights
  (A-2-3-4-5 “wheel”), no suit ordering — identical ranks split.
- **Side pots** are built by commitment layers: each all-in player is eligible
  only for pots at levels they matched. Folded players' chips stay in as dead
  money at whatever levels they contributed. Any portion of a bet nobody
  matched flows back to the bettor via the top layer.
- **Split pots** divide evenly; leftover odd chips go one each to winners in
  seat order starting left of the button.
- At showdown all live hands are revealed (no mucking losers — friendlier for
  learning, and the log records what everyone had).

## Bankroll model

- You start with a **10,000** bankroll; a seat costs a **1,000** buy-in.
- Your bankroll (banked + table stack) is saved after every completed hand and
  when you leave the table.
- Busting at the table offers a **re-buy** (another 1,000 from the bankroll) as
  long as the bankroll covers it and the table still has opponents.
- AI players do not re-buy — bust an opponent and they leave the table.
  Take every chip in play and the table is “cleaned out” (it counts in your
  stats, and you return to the lobby to start a fresh one).
- The bankroll can only be refilled with **Settings → Reset bankroll & stats**.

## Deliberate simplifications

Kept intentionally simple for a casual single-player game — all are visible,
none affect fairness within a hand:

- **No dead-button rule.** When a blind player busts, the button simply rotates
  among survivors; nobody is skipped or charged a make-up blind.
- **Blinds never escalate** (it's a cash game, not a tournament).
- **One table, one buy-in size**, no straddles, no antes, no chopping blinds.
- **Burn cards** are dealt (for tradition) but have no gameplay effect.
