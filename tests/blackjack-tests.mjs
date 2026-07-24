#!/usr/bin/env node
/**
 * Engine test suite for Blackjack Night.
 *
 * blackjack.html is a single self-contained file; this runner extracts the
 * <script id="engine"> block (pure logic, no DOM) and evaluates it in Node.
 *
 * Run:  node tests/blackjack-tests.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(join(root, "blackjack.html"), "utf8");
const m = html.match(/<script id="engine">([\s\S]*?)<\/script>/);
if (!m) { console.error("engine script block not found in blackjack.html"); process.exit(1); }
const fakeModule = { exports: {} };
new Function("module", m[1])(fakeModule);
const E = fakeModule.exports;

/* ---------------- tiny harness ---------------- */
let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log("  ok  " + name); }
  catch (e) { failed++; failures.push(name); console.log("FAIL  " + name + "\n      " + e.message); }
}
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg || "eq"}: expected ${b}, got ${a}`); }
function ok(v, msg) { if (!v) throw new Error(msg || "expected truthy"); }

const C = s => E.cardsFromStr(s);
const c1 = s => E.cardFromStr(s);

/* ---------------- hand math ---------------- */
console.log("\n== hand math ==");

test("hard and soft totals", () => {
  eq(E.handValue(C("Ts 7h")).total, 17);
  ok(!E.handValue(C("Ts 7h")).soft);
  eq(E.handValue(C("As 6h")).total, 17);
  ok(E.handValue(C("As 6h")).soft, "A6 is soft 17");
  eq(E.handValue(C("As 6h Th")).total, 17);
  ok(!E.handValue(C("As 6h Th")).soft, "A-6-T is hard 17");
  eq(E.handValue(C("As Ah")).total, 12, "AA = 12");
  ok(E.handValue(C("As Ah")).soft);
  eq(E.handValue(C("As Ah Ad Ac")).total, 14, "AAAA = 14");
  eq(E.handValue(C("As Ah 9d")).total, 21);
  eq(E.handValue(C("Ts 9h 5c")).total, 24, "bust counts true total");
});

test("blackjack and bust detection", () => {
  ok(E.isBlackjack(C("As Kh")), "A+K is blackjack");
  ok(E.isBlackjack(C("Th Ad")));
  ok(!E.isBlackjack(C("As 5h 5d")), "3-card 21 is not blackjack");
  ok(!E.isBlackjack(C("Ts Th")), "20 is not blackjack");
  ok(E.isBust(C("Ts 9h 5c")));
  ok(!E.isBust(C("Ts 9h 2c")));
});

test("hi-lo tags", () => {
  eq(E.hiLo(c1("2s")), 1); eq(E.hiLo(c1("6d")), 1);
  eq(E.hiLo(c1("7s")), 0); eq(E.hiLo(c1("9h")), 0);
  eq(E.hiLo(c1("Ts")), -1); eq(E.hiLo(c1("Kd")), -1); eq(E.hiLo(c1("Ah")), -1);
});

test("shoe has 6 decks and is seed-deterministic", () => {
  const a = E.newShoe(E.mulberry32(9)), b = E.newShoe(E.mulberry32(9));
  eq(a.length, 312);
  eq(a.join(","), b.join(","));
  const counts = {};
  for (const c of a) counts[c] = (counts[c] || 0) + 1;
  ok(Object.values(counts).every(n => n === 6), "each card exactly 6 times");
});

/* ---------------- basic strategy ---------------- */
console.log("\n== basic strategy (6D, S17, DAS) ==");

const bs = (hand, up, opts) => E.basicStrategy(C(hand), c1(up), opts || { canDouble: true, canSplit: true });

test("hard totals", () => {
  eq(bs("Ts 6h", "Th"), "hit", "16 v 10");
  eq(bs("Ts 6h", "6h"), "stand", "16 v 6");
  eq(bs("Ts 2h", "2s"), "hit", "12 v 2");
  eq(bs("Ts 2h", "4s"), "stand", "12 v 4");
  eq(bs("6s 5h", "Th"), "double", "11 v 10 doubles");
  eq(bs("6s 5h", "Ah"), "hit", "11 v A hits (S17)");
  eq(bs("6s 4h", "9h"), "double", "10 v 9");
  eq(bs("6s 4h", "Th"), "hit", "10 v 10");
  eq(bs("5s 4h", "3h"), "double", "9 v 3");
  eq(bs("5s 4h", "2h"), "hit", "9 v 2");
  eq(bs("Ts 7h", "Ah"), "stand", "17 stands");
  eq(bs("6s 5h", "Th", { canDouble: false, canSplit: false }), "hit", "11 falls back to hit");
});

test("soft totals", () => {
  eq(bs("As 8h", "6h"), "stand", "A8 stands");
  eq(bs("As 7h", "3h"), "double", "A7 v 3 doubles");
  eq(bs("As 7h", "3h", { canDouble: false, canSplit: false }), "stand", "A7 v 3 stands if no double");
  eq(bs("As 7h", "2h"), "stand", "A7 v 2");
  eq(bs("As 7h", "9h"), "hit", "A7 v 9");
  eq(bs("As 6h", "4h"), "double", "A6 v 4");
  eq(bs("As 6h", "2h"), "hit", "A6 v 2");
  eq(bs("As 3h", "5h"), "double", "A3 v 5");
  eq(bs("As 3h", "4h"), "hit", "A3 v 4");
});

test("pairs", () => {
  eq(bs("As Ah", "Th"), "split", "always split aces");
  eq(bs("8s 8h", "Ah"), "split", "always split eights");
  eq(bs("Ts Th", "6h"), "stand", "never split tens");
  eq(bs("9s 9h", "7h"), "stand", "99 v 7 stands");
  eq(bs("9s 9h", "9h"), "split", "99 v 9 splits");
  eq(bs("7s 7h", "8h"), "hit", "77 v 8 hits");
  eq(bs("5s 5h", "6h"), "double", "55 plays as 10");
  eq(bs("4s 4h", "5h"), "split", "44 v 5 splits (DAS)");
  eq(bs("4s 4h", "2h"), "hit", "44 v 2 hits");
  eq(bs("8s 8h", "Th", { canDouble: true, canSplit: false }), "hit", "88 v T plays as 16 when split unavailable");
  eq(bs("Ks Qh", "6h"), "stand", "KQ counts as a ten pair (stand)");
});

/* ---------------- table scenarios (rigged shoe) ---------------- */
console.log("\n== table rounds ==");

function mkTable(opts = {}) {
  return new E.Table({
    humanName: "Hero", humanBank: opts.bank ?? 1000,
    aiPlayers: opts.ais || [],
    rng: E.mulberry32(opts.seed ?? 7), minBet: 10, maxBet: 500,
  });
}
/** Append cards so they are drawn in the given order (shoe pops from the end). */
function rig(t, cardsStr) {
  const cards = C(cardsStr);
  t.shoe.push(...cards.slice().reverse());
}

test("player blackjack pays 3:2", () => {
  const t = mkTable();
  rig(t, "As 5h Ks 9d");            // P1, DealerUp, P2, Hole
  t.startRound([{ spotIdx: 0, bet: 100 }]);
  eq(t.state, "dealer-play", "no decisions needed");
  while (t.state === "dealer-play") t.dealerStep();
  eq(t.state, "settled");
  eq(t.lastResult.spots[0].hands[0].result, "blackjack");
  eq(t.humanBank, 1150, "3:2 on 100");
  eq(t.dealer.cards.length, 2, "dealer draws nothing vs a lone natural");
});

test("dealer blackjack + insurance is net-zero (even money)", () => {
  const t = mkTable();
  rig(t, "Ts As 6h Kd");
  t.startRound([{ spotIdx: 0, bet: 100 }]);
  eq(t.state, "insurance", "ace up asks for insurance");
  t.insurance(true);
  eq(t.state, "settled", "peek finds blackjack");
  eq(t.lastResult.dealer.blackjack, true);
  eq(t.lastResult.spots[0].hands[0].result, "lose");
  eq(t.lastResult.spots[0].insuranceWon, 150);
  eq(t.humanBank, 1000, "hand loses 100, insurance wins 100");
});

test("declined insurance, dealer has no blackjack, ace-up dealer stands soft", () => {
  const t = mkTable();
  rig(t, "Ts As 7h 9d");            // dealer A+9 = soft 20
  t.startRound([{ spotIdx: 0, bet: 100 }]);
  eq(t.state, "insurance");
  t.insurance(false);
  eq(t.state, "awaiting-action");
  t.act("stand");                    // 17 v soft 20
  while (t.state === "dealer-play") t.dealerStep();
  eq(t.lastResult.spots[0].hands[0].result, "lose");
  eq(t.humanBank, 900);
  eq(t.dealer.cards.length, 2, "soft 20 takes no cards");
});

test("ten-up peek ends the round before any decisions", () => {
  const t = mkTable();
  rig(t, "9s Ks 8h Ad");            // dealer K + A = blackjack
  t.startRound([{ spotIdx: 0, bet: 100 }]);
  eq(t.state, "settled", "peek finds it immediately");
  eq(t.lastResult.spots[0].hands[0].result, "lose");
  eq(t.humanBank, 900);
});

test("double down wins double", () => {
  const t = mkTable();
  rig(t, "6s 6h 5s Th 9d 5c 9c");   // P 11 v 6; doubles into 9 -> 20; dealer 16 draws 5 -> 21? no: 6+T=16, draws 5 = 21
  // adjust: dealer 21 would beat 20 — give dealer a bust card instead
  const t2 = mkTable();
  rig(t2, "6s 6h 5s Th 9d Tc");     // P: 6+5=11, dealer 6+T=16; P doubles -> 9 (20); dealer draws T -> 26 bust
  t2.startRound([{ spotIdx: 0, bet: 100 }]);
  eq(t2.state, "awaiting-action");
  ok(t2.legalMoves().double);
  t2.act("double");
  eq(t2.humanBank, 800, "double deducts a second bet");
  while (t2.state === "dealer-play") t2.dealerStep();
  eq(t2.lastResult.dealer.bust, true);
  eq(t2.lastResult.spots[0].hands[0].result, "win");
  eq(t2.humanBank, 1200, "wins 2x the doubled bet");
});

test("split eights, both hands win", () => {
  const t = mkTable();
  //         P1  Up  P2  Hole | split draws: h1, h2 | h1 hit
  rig(t, "8s 7h 8h Th 3d Td 8d");
  t.startRound([{ spotIdx: 0, bet: 100 }]);
  ok(t.legalMoves().split);
  t.act("split");                    // h1: 8+3=11, h2: 8+T=18
  eq(t.humanBank, 800, "split deducts a second bet");
  eq(t.currentHand().cards.length, 2);
  eq(E.handValue(t.currentHand().cards).total, 11);
  t.act("hit");                      // h1: 11 + 8 = 19
  t.act("stand");
  eq(E.handValue(t.currentHand().cards).total, 18, "now playing hand 2");
  t.act("stand");
  while (t.state === "dealer-play") t.dealerStep();
  eq(t.lastResult.dealer.total, 17);
  eq(t.lastResult.spots[0].hands.length, 2);
  eq(t.lastResult.spots[0].hands[0].result, "win");
  eq(t.lastResult.spots[0].hands[1].result, "win");
  eq(t.humanBank, 1200);
});

test("split aces get exactly one card and 21 pays 1:1, not 3:2", () => {
  const t = mkTable();
  rig(t, "As 9h Ah 8d Kd 4c");      // split: h1 A+K=21 (not natural), h2 A+4=15; dealer 17
  t.startRound([{ spotIdx: 0, bet: 100 }]);
  t.act("split");
  eq(t.state, "dealer-play", "both ace hands auto-complete");
  while (t.state === "dealer-play") t.dealerStep();
  const hands = t.lastResult.spots[0].hands;
  eq(hands[0].result, "win", "A+K after split is a win, not blackjack");
  eq(hands[0].pay, 200, "1:1 payout");
  eq(hands[1].result, "lose", "15 loses to 17");
  eq(t.humanBank, 1000);
});

test("resplit to 3 hands max", () => {
  const t = mkTable({ bank: 2000 });
  //        P1  Up  P2  Hole | split1: h1,h2 | split2: h1,new | then play
  rig(t, "8s 7h 8h Th 8d 2c 8c 3c Ts Td Tc");
  t.startRound([{ spotIdx: 0, bet: 100 }]);
  t.act("split");                    // h1: 8s+8d, h2: 8h+2c
  ok(t.legalMoves().split, "can resplit the new pair");
  t.act("split");                    // h1: 8s+8c, mid: 8d+3c, h2: 8h+2c
  eq(t.spots[0].hands.length, 3);
  ok(!t.legalMoves().split, "3 hands is the cap even with another pair");
  eq(t.humanBank, 2000 - 300);
  t.act("hit"); t.act("stand");      // h1: 16+T bust? 8+8+T = 26 -> busts, auto-advances
  // h1 busted on the hit; current is now the middle hand (8d+3c = 11)
  while (t.state === "awaiting-action") t.act("stand");
  while (t.state === "dealer-play") t.dealerStep();
  eq(t.state, "settled");
});

test("push returns the bet", () => {
  const t = mkTable();
  rig(t, "Ts 9h Th 8d");            // P 20 v dealer 17? 9+8=17 -> stand; P stands 20 -> win
  // make it a push instead: dealer 20
  const t2 = mkTable();
  rig(t2, "Ts Th Th Kd");           // P 20, dealer T+K=20
  t2.startRound([{ spotIdx: 0, bet: 100 }]);
  t2.act("stand");
  while (t2.state === "dealer-play") t2.dealerStep();
  eq(t2.lastResult.spots[0].hands[0].result, "push");
  eq(t2.humanBank, 1000);
});

test("all hands bust: dealer reveals but draws nothing", () => {
  const t = mkTable();
  rig(t, "Ts 6h 6s Th 9c");         // P 16 hits 9 -> 25 bust; dealer 6+T=16 would draw if live
  t.startRound([{ spotIdx: 0, bet: 100 }]);
  t.act("hit");
  eq(t.state, "dealer-play");
  while (t.state === "dealer-play") t.dealerStep();
  eq(t.dealer.cards.length, 2, "no draws vs a dead table");
  ok(t.dealer.revealed);
  eq(t.humanBank, 900);
});

test("multi-spot round settles each hand independently", () => {
  const t = mkTable();
  //       S1  S2  Up  S1  S2  Hole | s1 hits -> bust... keep both standing
  rig(t, "Ts 5h 9h 9s 5d 8d 9c");   // spot1: T+9=19 stand; spot2: 5+5=10 -> hit 9c = 19; dealer 17
  t.startRound([{ spotIdx: 0, bet: 100 }, { spotIdx: 1, bet: 50 }]);
  eq(t.spots.length, 2);
  t.act("stand");                    // spot 1: 19
  t.act("hit");                      // spot 2: 10 + 9 = 19 -> auto-done? 19 < 21 so still acting
  t.act("stand");
  while (t.state === "dealer-play") t.dealerStep();
  eq(t.lastResult.spots[0].hands[0].result, "win");
  eq(t.lastResult.spots[1].hands[0].result, "win");
  eq(t.humanBank, 1150, "+100 and +50");
});

test("bets are validated", () => {
  const t = mkTable({ bank: 100 });
  let threw = 0;
  try { t.startRound([]); } catch (e) { threw++; }
  try { t.startRound([{ spotIdx: 0, bet: 5 }]); } catch (e) { threw++; }
  try { t.startRound([{ spotIdx: 0, bet: 600 }]); } catch (e) { threw++; }
  try { t.startRound([{ spotIdx: 0, bet: 60 }, { spotIdx: 1, bet: 60 }]); } catch (e) { threw++; }
  try { t.startRound([{ spotIdx: 0, bet: NaN }]); } catch (e) { threw++; }
  eq(threw, 5, "all illegal bet sets rejected");
  eq(t.humanBank, 100, "bank untouched");
  eq(t.state, "betting");
});

test("shoe reshuffles when low", () => {
  const t = mkTable();
  t.shoe.length = 40;
  t.startRound([{ spotIdx: 0, bet: 10 }]);
  ok(t.shuffledThisRound, "reshuffled");
  ok(t.shoe.length > 240, "fresh shoe minus this deal");
});

/* ---------------- AI & long simulation ---------------- */
console.log("\n== AI & simulation ==");

test("counter deviates and bets with the count", () => {
  const shark = E.PERSONALITIES.find(p => p.key === "shark");
  const rng = E.mulberry32(3);
  eq(E.aiDecide(shark, C("Ts 6h"), c1("Th"), { canDouble: true, canSplit: false }, rng, 1), "stand",
    "16 v 10 stands at TC >= 0");
  eq(E.aiDecide(shark, C("Ts 6h"), c1("Th"), { canDouble: true, canSplit: false }, rng, -1), "hit",
    "16 v 10 hits at negative count");
  const low = E.aiBet(shark, {}, 10, 500, 2000, 0, rng);
  const high = E.aiBet(shark, {}, 10, 500, 2000, 5, rng);
  ok(high > low, `bet spread: ${low} at TC0 vs ${high} at TC5`);
  ok(E.aiWantsInsurance(shark, 3.5, rng), "insures at high count");
  ok(!E.aiWantsInsurance(shark, 0, rng), "declines at low count");
});

test("aiDecide never returns an illegal action (fuzz)", () => {
  const rng = E.mulberry32(11);
  for (let i = 0; i < 3000; i++) {
    const per = E.PERSONALITIES[i % E.PERSONALITIES.length];
    const shoe = E.newShoe(rng);
    const cards = [shoe.pop(), shoe.pop()];
    if (rng() < 0.4) cards.push(shoe.pop());
    if (E.isBust(cards) || E.handValue(cards).total === 21) continue;
    const up = shoe.pop();
    const opts = { canDouble: cards.length === 2 && rng() < 0.7, canSplit: false };
    const a = E.aiDecide(per, cards, up, opts, rng, Math.floor(rng() * 10) - 4);
    ok(["hit", "stand", "double", "split"].includes(a), "known action");
    if (a === "double") ok(opts.canDouble, `${per.key} doubled illegally`);
    if (a === "split") ok(opts.canSplit, `${per.key} split illegally`);
  }
});

test("300-round full-table simulation: legality, ledgers, no crashes", () => {
  const rng = E.mulberry32(2026);
  const t = new E.Table({
    humanName: "Hero", humanBank: 100000,
    aiPlayers: E.PERSONALITIES.slice(0, 4).map((p, i) => ({
      name: "Bot" + i, personality: p, stack: 5000,
    })),
    rng, minBet: 10, maxBet: 500,
  });
  let rounds = 0, splits = 0, doubles = 0, naturals = 0, shuffles = 0;
  while (rounds < 300 && t.humanBank > 2000) {
    const nSpots = 1 + Math.floor(rng() * 3);
    const bets = [];
    for (let i = 0; i < nSpots; i++) bets.push({ spotIdx: i, bet: 10 + Math.floor(rng() * 10) * 10 });
    const bankAtStart = t.humanBank;
    const stacksBefore = t.ais.map(a => a.stack);
    t.startRound(bets);
    rounds++;
    if (t.shuffledThisRound) shuffles++;
    let guard = 0;
    while (t.state !== "settled") {
      if (++guard > 200) throw new Error("round did not terminate");
      if (t.state === "insurance") {
        t.insurance(rng() < 0.2);
      } else if (t.state === "awaiting-action") {
        const s = t.currentSpot(), h = t.currentHand(), lm = t.legalMoves();
        let move;
        if (s.owner === "human") {
          move = E.basicStrategy(h.cards, t.dealer.cards[0], { canDouble: lm.double, canSplit: lm.split });
        } else {
          move = E.aiDecide(s.ai.personality, h.cards, t.dealer.cards[0],
            { canDouble: lm.double, canSplit: lm.split }, rng, t.trueCount());
        }
        if (move === "double") ok(lm.double, "illegal double emitted");
        if (move === "split") { ok(lm.split, "illegal split emitted"); splits++; }
        if (move === "double") doubles++;
        t.act(move);
      } else if (t.state === "dealer-play") {
        t.dealerStep();
      } else throw new Error("unexpected state " + t.state);
    }
    // ledgers: every owner's balance change over the round equals their reported net
    for (let i = 0; i < t.ais.length; i++) {
      const netForAi = t.lastResult.spots
        .filter(x => x.owner === "ai" && x.name === t.ais[i].name)
        .reduce((s, x) => s + x.net, 0);
      eq(t.ais[i].stack - stacksBefore[i], netForAi, `AI ${t.ais[i].name} ledger`);
    }
    const humanNet = t.lastResult.spots.filter(s => s.owner === "human").reduce((s, x) => s + x.net, 0);
    eq(t.humanBank - bankAtStart, humanNet, "human ledger");
    ok(Number.isInteger(t.humanBank) && t.humanBank >= 0, "bank sane");
    for (const a of t.ais) ok(Number.isInteger(a.stack) && a.stack >= 0, "AI stack sane");
    naturals += t.lastResult.spots.reduce((s, x) => s + x.hands.filter(h => h.result === "blackjack").length, 0);
  }
  ok(rounds >= 200, `played ${rounds} rounds`);
  ok(splits > 5, `saw ${splits} splits`);
  ok(doubles > 10, `saw ${doubles} doubles`);
  ok(naturals > 3, `saw ${naturals} naturals`);
  ok(shuffles > 2, `saw ${shuffles} reshuffles`);
  console.log(`      (${rounds} rounds, ${splits} splits, ${doubles} doubles, ${naturals} naturals, ${shuffles} shuffles)`);
});

test("deterministic: same seed, same outcome", () => {
  const play = seed => {
    const rng = E.mulberry32(seed);
    const t = new E.Table({
      humanName: "H", humanBank: 5000,
      aiPlayers: [{ name: "B", personality: E.PERSONALITIES[1], stack: 2000 }],
      rng, minBet: 10, maxBet: 500,
    });
    for (let r = 0; r < 40; r++) {
      t.startRound([{ spotIdx: 0, bet: 50 }]);
      while (t.state !== "settled") {
        if (t.state === "insurance") t.insurance(false);
        else if (t.state === "awaiting-action") {
          const lm = t.legalMoves(), s = t.currentSpot(), h = t.currentHand();
          const move = s.owner === "human"
            ? E.basicStrategy(h.cards, t.dealer.cards[0], { canDouble: lm.double, canSplit: lm.split })
            : E.aiDecide(s.ai.personality, h.cards, t.dealer.cards[0],
                { canDouble: lm.double, canSplit: lm.split }, rng, t.trueCount());
          t.act(move);
        } else t.dealerStep();
      }
    }
    return `${t.humanBank}|${t.ais[0].stack}|${t.runningCount}`;
  };
  eq(play(777), play(777));
});

/* ---------------- summary ---------------- */
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) { console.log("failures:", failures.join(" | ")); process.exit(1); }
