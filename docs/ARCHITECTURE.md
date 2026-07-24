# Architecture

The entire game ships as a single file, `poker.html`, so that "run the app" means
"open the file". Inside, it is strictly layered:

```
poker.html
├── <style>                 theme + layout (plain CSS, no framework)
├── <body>                  static DOM skeleton (table, seats container, action bar, overlays)
├── <script id="engine">    PURE game logic — no DOM, no timers, no Date/Math.random
└── <script id="ui">        rendering, pacing, input, persistence — talks to the engine only
                            through its public API
```

The engine/UI boundary is load-bearing: the engine block is what
`tests/run-tests.mjs` extracts and runs headlessly in Node (it ends with a
CommonJS `module.exports` guard for exactly this purpose). Keep DOM access,
`setTimeout`, and unseeded randomness out of the engine block.

## The engine (`PokerEngine` namespace)

### Cards

A card is an integer `0..51`: `rank = 2 + (c % 13)` (2…14, ace high) and
`suit = floor(c / 13)` (♠♥♦♣). Helpers: `cardStr` / `cardFromStr` /
`cardsFromStr("As Td 7c")` for tests and logs.

### Hand evaluation

`evaluate5(cards)` returns a single integer score — category (0 = high card …
8 = straight flush) packed with up to five 4-bit tiebreak ranks — so two hands
compare with plain `>`. `evaluate7` takes the best of the 21 five-card
subsets; `bestFive` also returns *which* five cards won (used for showdown
highlighting); `describeScore` renders names like “Full House, Kings over Twos”.
Wheel straights (A-2-3-4-5) are handled explicitly.

### The `Game` state machine

One `Game` instance is one table session. It is driven from outside by exactly
three calls and exposes its progress via `game.state`:

```
new Game({players, smallBlind, bigBlind, rng, buttonIndex})
game.startHand()        posts blinds, deals, finds first actor
game.act(action)        while state === 'awaiting-action'
game.dealNextStreet()   while state === 'street-complete'
```

| `game.state` | Meaning | Caller's move |
| --- | --- | --- |
| `awaiting-action` | `currentPlayer()` must act | `act({type: 'fold'\|'check'\|'call'\|'raise', amount?})` |
| `street-complete` | betting round closed | `dealNextStreet()` (deals flop/turn/river, or runs the showdown after the river) |
| `hand-complete` | pots awarded, `lastResult` set | present results, then `startHand()` |

`legalActions()` describes what the current player may do:
`{toCall, canCheck, canRaise, minRaiseTo, maxRaiseTo}`. `act('raise')` clamps
the requested amount into the legal range, so callers cannot produce an illegal
raise size. Raise amounts are always “raise **to**” totals for the street, not
increments.

Betting bookkeeping lives in a handful of per-player fields (`streetBet`,
`totalBet`, `hasActed`, `canRaiseFlag`, `folded`, `allIn`, `out`) plus table
fields (`currentBet`, `lastRaiseSize`). The subtle rules — short all-ins not
re-opening action, min-raise growth, the big blind's option — are covered in
[GAME_RULES.md](GAME_RULES.md) and pinned down by tests.

Side pots are not tracked during betting; they are derived at showdown from
each player's `totalBet` with the standard layering algorithm (`buildPots`),
which automatically handles dead money from folders and returns uncalled
excess to the deep stack. After pots are awarded, all commitments are zeroed —
**the invariant is that `Σ stack + Σ totalBet` is constant during a hand and
`Σ stack` returns to the starting total after it** (asserted by the tests after
every simulated hand).

All randomness flows through the injected `rng` (`mulberry32(seed)` is
provided), so whole games are reproducible — the determinism test replays 20
hands and expects identical stacks.

### AI

`aiDecide(game, {iters})` returns an action for the current player; personality
knobs and the decision pipeline are documented in
[AI_PLAYERS.md](AI_PLAYERS.md).

## The UI

The UI owns everything the engine doesn't: seat layout (computed on an ellipse
around the table for 2–8 players, hero always bottom-center), the pacing loop,
overlays, and persistence.

The pacing loop (`pump()`) is a simple async driver over `game.state`: AI turns
and street reveals are separated by delays (scaled by the speed setting); when
the human is to act it stops and shows the action bar, and `humanAct()` resumes
it. A monotonically increasing session token (`seq`) invalidates every pending
delay when the session ends or resets — any awaited delay from a dead session
resolves as `"stale"` and its continuation aborts.

The engine appends structured log lines to `game.log`; the UI drains new
entries into the History drawer after every mutation (`drainLog`).

### Persistence

A single `localStorage` key, `holdem-night-save-v1`:

```json
{
  "bankroll": 10000,
  "settings": { "name": "You", "opponents": 5, "speed": "normal" },
  "stats": { "handsPlayed": 0, "handsWon": 0, "biggestPot": 0, "tablesWon": 0 }
}
```

`bankroll` is the player's **total** worth when not seated. Sitting down moves
1,000 to the table; after every completed hand the save is snapshotted as
`bank + current stack`, so closing the tab mid-session never costs more than
the current hand. Missing or corrupted saves (or `localStorage` being
unavailable) fall back to defaults without crashing.

## Tests

`node tests/run-tests.mjs` — a dependency-free runner that regex-extracts the
engine block, evaluates it with `new Function`, and runs ~30 tests: evaluator
categories/kickers/traps plus a randomized ordering cross-check, scripted
betting scenarios (deterministic showdowns are forced by overwriting hole cards
and stacking `game.deck`), side-pot layering, and seeded AI-vs-AI simulations
asserting legality and chip conservation throughout.
