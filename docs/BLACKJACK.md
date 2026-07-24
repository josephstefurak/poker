# Blackjack Night — rules, AI, and architecture

`blackjack.html` follows the same single-file design as the poker game: open it
in a browser and play, no install. This page documents exactly what it
implements; everything below is pinned down by `tests/blackjack-tests.mjs`.

## House rules (Vegas classic)

- **Six-deck shoe**, reshuffled between rounds once fewer than 60 cards remain
  (the shoe indicator on the table shows the count).
- **Dealer stands on all 17s** (S17), including soft 17.
- **Blackjack pays 3:2.** Only a two-card 21 on an unsplit hand is a natural —
  a 21 made after splitting pays 1:1.
- **Peek:** with an ace or ten-value showing, the dealer checks for blackjack
  before anyone acts. With an ace up, **insurance** is offered first (half your
  bet, pays 2:1).
- **Double down on any two cards**, including after a split (DAS). One card,
  then the hand is done.
- **Split** any pair (by value — K♠Q♦ counts) up to **3 hands per spot**.
  **Split aces receive one card each** and cannot be re-hit.
- **No surrender**, no even-money shortcut (decline insurance instead).
- Dealer draws nothing when every hand has busted or is a natural — cards stay
  in the shoe.

## Your seats and money

- Play **1–3 spots per round**, each with its own bet of **10–500**, set with
  chip buttons (or *Rebet & deal* to repeat the last round).
- Your bankroll starts at **10,000** and persists in the browser
  (`localStorage` key `blackjack-night-save-v1` — completely separate from the
  poker game's save). It snapshots after every settled round; *Settings → Reset
  bankroll & stats* starts you over.

## The AI table-mates

AI players bet their own 2,000-chip stacks against the dealer — in blackjack
they can't take your money, but they burn real cards from the shoe and set the
table's rhythm. When their chips run out, they leave.

| Personality | Emoji | How they play |
| --- | :-: | --- |
| Professor | 🎓 | Perfect basic strategy, steady bets. Watch them to learn. |
| Shark | 🦈 | **Counts cards** (Hi-Lo). Spreads bets 1–8 units with the true count, takes insurance only when the count justifies it, and plays famous index deviations (16 v 10 stands at TC ≥ 0, 12 v 3 at TC ≥ 2, …). |
| Tourist | 🧢 | ~18% characteristic mistakes: won't bust a stiff hand against a high card, stands on soft 18, too timid to double or split. Takes insurance on vibes. |
| The Rock | 🪨 | Basic strategy, but never risks a double or split. Minimum bets forever. |
| Gambler | 🎲 | Martingale-ish: doubles the bet after a loss, always thinks the next one's the one. |

The AI decision function (`aiDecide`) starts from the full 6-deck S17 basic
strategy table and applies personality filters; every emitted action is checked
against the engine's `legalMoves()` in tests (3,000-decision fuzz plus a
300-round full-table simulation).

## Architecture

Identical layering to `poker.html` (see [ARCHITECTURE.md](ARCHITECTURE.md) for
the philosophy):

- `<script id="engine">` — pure logic, no DOM: cards/shoe, hand math,
  `basicStrategy`, Hi-Lo counting, personalities, and the `Table` state
  machine. States flow `betting → (insurance) → awaiting-action → dealer-play →
  settled`, driven from outside via `startRound(bets)`, `insurance(bool)`,
  `act(move)`, and `dealerStep()`.
- `<script id="ui">` — rendering, pacing (same stale-timer `seq` token
  pattern), the betting panel, and persistence.

The test suite (`node tests/blackjack-tests.mjs`, no dependencies) extracts the
engine block and covers hand math, the full basic-strategy table, rigged-shoe
round scenarios (3:2 naturals, insurance/peek, doubles, splits including the
3-hand cap and one-card aces, pushes, dead-table dealer behavior, multi-spot
settlement), bet validation, reshuffling, counter behavior, and per-round
ledger checks over a 300-round simulation.
