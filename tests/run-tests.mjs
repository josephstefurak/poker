#!/usr/bin/env node
/**
 * Engine test suite for Hold'em Night.
 *
 * poker.html is a single self-contained file, so this runner extracts the
 * <script id="engine"> block (pure logic, no DOM) and evaluates it in Node.
 *
 * Run:  node tests/run-tests.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(join(root, "poker.html"), "utf8");
const m = html.match(/<script id="engine">([\s\S]*?)<\/script>/);
if (!m) { console.error("engine script block not found in poker.html"); process.exit(1); }
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
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg || "eq"}: expected ${b}, got ${a}`);
}
function ok(v, msg) { if (!v) throw new Error(msg || "expected truthy"); }
function gt(a, b, msg) { if (!(a > b)) throw new Error(`${msg || "gt"}: ${a} <= ${b}`); }

const C = s => E.cardsFromStr(s);
const score = s => E.evaluate7(C(s));
const cat = s => E.scoreCategory(score(s));

/* ---------------- hand evaluator ---------------- */
console.log("\n== hand evaluator ==");

test("categories of canonical 5-card hands", () => {
  eq(cat("As Ks Qs Js Ts"), 8, "royal flush");
  eq(cat("9d 8d 7d 6d 5d"), 8, "straight flush");
  eq(cat("Ac Ad Ah As Kd"), 7, "quads");
  eq(cat("Kc Kd Kh 2s 2d"), 6, "full house");
  eq(cat("Ah Jh 8h 5h 2h"), 5, "flush");
  eq(cat("Tc 9d 8h 7s 6c"), 4, "straight");
  eq(cat("Qc Qd Qh 7s 2c"), 3, "trips");
  eq(cat("Jc Jd 4h 4s Ac"), 2, "two pair");
  eq(cat("Tc Td 8h 5s 2c"), 1, "pair");
  eq(cat("Ac Jd 9h 6s 3c"), 0, "high card");
});

test("wheel straight (A-5) beats trips but loses to 6-high straight", () => {
  const wheel = score("Ah 2c 3d 4s 5h");
  eq(E.scoreCategory(wheel), 4, "wheel is a straight");
  gt(score("2h 3c 4d 5s 6h"), wheel, "6-high straight beats wheel");
  gt(wheel, score("Qc Qd Qh 7s 2c"), "wheel beats trips");
});

test("wheel straight flush is not a royal flush", () => {
  const w = score("Ah 2h 3h 4h 5h");
  eq(E.scoreCategory(w), 8);
  gt(score("As Ks Qs Js Ts"), w);
  ok(E.describeScore(w).includes("Five"), "described as five-high");
});

test("ace does not wrap around (QKA23 is not a straight)", () => {
  eq(cat("Qc Kd Ah 2s 3c"), 0);
});

test("kickers break ties", () => {
  gt(score("Ac Ad Kh 7s 2c"), score("Ah As Qh 7d 2d"), "AA-K beats AA-Q");
  gt(score("Kc Qd 9h 7s 2c"), score("Kh Qs 9d 6s 2d"), "high-card kicker");
  gt(score("Jc Jd 4h 4s Ac"), score("Jh Js 4d 4c Kd"), "two-pair kicker");
});

test("flush compares all five cards", () => {
  gt(score("Ah Kh 8h 5h 2h"), score("As Qs Js 9s 8s"));
  gt(score("Ah Kh 8h 5h 3h"), score("Ad Kd 8d 5d 2d"));
});

test("full house compares trips then pair", () => {
  gt(score("2c 2d 2h Ks Kd"), score("Ah As Ad Qc Qd") - 1_000_000_000, "sanity");
  gt(score("Ah As Ad 2c 2d"), score("Kc Kd Kh As Ad"), "aces full beats kings full");
  gt(score("7h 7s 7d Kc Kd"), score("7c 7d 7h Qs Qd"), "bigger pair wins");
});

test("best five of seven picked correctly", () => {
  // 7 cards contain a flush and a straight -> flush wins
  eq(E.scoreCategory(score("Ah Kh 8h 5h 2h Tc 9c")), 5);
  // pair on board + pair in hand = two pair
  eq(E.scoreCategory(score("Ac Ad 7h 7s 2c 3d 9h")), 2);
  // board plays: broadway on board, rag hole cards tie
  const b = "Tc Jd Qh Ks Ad";
  eq(score(b + " 2c 3d"), score(b + " 4h 5s"), "board plays for both");
});

test("bestFive returns the exact winning cards", () => {
  const seven = C("Ah Kh 8h 5h 2h Tc 9c");
  const { score: s, cards } = E.bestFive(seven);
  eq(E.scoreCategory(s), 5);
  ok(cards.every(c => E.suitOf(c) === 1), "all hearts");
  eq(cards.length, 5);
});

test("describeScore names hands", () => {
  ok(E.describeScore(score("As Ks Qs Js Ts")) === "Royal Flush");
  ok(E.describeScore(score("Kc Kd Kh 2s 2d")).startsWith("Full House, Kings over"));
  ok(E.describeScore(score("Tc Td 8h 5s 2c")).startsWith("Pair of Tens"));
});

test("evaluator agrees with brute-force ordering on random sets", () => {
  // sample random pairs of 5-card hands; verify antisymmetry & category sanity
  const rng = E.mulberry32(42);
  for (let i = 0; i < 500; i++) {
    const deck = E.shuffle(E.newDeck(), rng);
    const h1 = deck.slice(0, 5), h2 = deck.slice(5, 10);
    const s1 = E.evaluate5(h1), s2 = E.evaluate5(h2);
    const c1 = E.scoreCategory(s1), c2 = E.scoreCategory(s2);
    if (c1 > c2) gt(s1, s2, "higher category must score higher");
    if (c2 > c1) gt(s2, s1, "higher category must score higher");
  }
});

/* ---------------- betting engine ---------------- */
console.log("\n== betting engine ==");

function mkGame(stacks, { btn = 0, seed = 7, sb = 5, bb = 10 } = {}) {
  return new E.Game({
    players: stacks.map((s, i) => ({
      name: "P" + i, stack: s, isHuman: i === 0,
      personality: E.PERSONALITIES[i % E.PERSONALITIES.length],
    })),
    smallBlind: sb, bigBlind: bb, rng: E.mulberry32(seed), buttonIndex: btn,
  });
}
const totalChips = g => g.players.reduce((s, p) => s + p.stack + p.totalBet, 0);

/** Force known hole cards and a known runout (bypasses the shuffled deck). */
function rig(g, holes, board) {
  const used = new Set();
  holes.forEach((h, i) => {
    if (h) { g.players[i].hole = C(h); g.players[i].hole.forEach(c => used.add(c)); }
  });
  const b = C(board);
  b.forEach(c => used.add(c));
  const filler = [];
  for (let c = 0; c < 52 && filler.length < 3; c++) if (!used.has(c)) filler.push(c);
  // pops: burn f1 f2 f3 burn turn burn river
  g.deck = [b[4], filler[2], b[3], filler[1], b[2], b[1], b[0], filler[0]];
}

test("blinds posted, UTG acts first (3-handed)", () => {
  const g = mkGame([1000, 1000, 1000], { btn: 0 });
  g.startHand();
  eq(g.sbIndex, 1); eq(g.bbIndex, 2);
  eq(g.players[1].streetBet, 5); eq(g.players[2].streetBet, 10);
  eq(g.currentPlayer().id, 0, "UTG=button acts first 3-handed");
  eq(g.pot(), 15);
});

test("heads-up: button posts SB and acts first preflop; BB first postflop", () => {
  const g = mkGame([500, 500], { btn: 0 });
  g.startHand();
  eq(g.sbIndex, 0, "button is SB");
  eq(g.bbIndex, 1);
  eq(g.currentPlayer().id, 0, "button acts first preflop");
  g.act({ type: "call" });
  eq(g.currentPlayer().id, 1, "BB has the option");
  g.act({ type: "check" });
  eq(g.state, "street-complete");
  g.dealNextStreet();
  eq(g.street, "flop");
  eq(g.currentPlayer().id, 1, "non-button acts first postflop");
});

test("BB gets the option when everyone just calls", () => {
  const g = mkGame([1000, 1000, 1000], { btn: 0 });
  g.startHand();
  g.act({ type: "call" });          // P0 (utg/btn)
  g.act({ type: "call" });          // P1 sb completes
  eq(g.currentPlayer().id, 2, "BB option");
  const la = g.legalActions();
  ok(la.canCheck, "BB can check the option");
  ok(la.canRaise, "BB can raise the option");
  g.act({ type: "check" });
  eq(g.state, "street-complete");
});

test("fold-out: last player standing wins the pot immediately", () => {
  const g = mkGame([1000, 1000, 1000], { btn: 0 });
  g.startHand();
  g.act({ type: "raise", amount: 30 });
  g.act({ type: "fold" });
  g.act({ type: "fold" });
  eq(g.state, "hand-complete");
  eq(g.players[0].stack, 1015, "winner collects blinds (and own raise back)");
  eq(totalChips(g), 3000, "chips conserved");
  ok(!g.lastResult.showdown);
});

test("min-raise bookkeeping", () => {
  const g = mkGame([2000, 2000, 2000], { btn: 0 });
  g.startHand();
  let la = g.legalActions();
  eq(la.minRaiseTo, 20, "first raise is to 2xBB");
  g.act({ type: "raise", amount: 50 });      // raise of 40
  la = g.legalActions();
  eq(la.toCall, 45, "SB owes 45");
  eq(la.minRaiseTo, 90, "re-raise must be at least +40");
  g.act({ type: "raise", amount: 90 });
  la = g.legalActions();
  eq(la.minRaiseTo, 130, "next min re-raise +40");
});

test("postflop opening bet minimum is one BB", () => {
  const g = mkGame([1000, 1000], { btn: 0 });
  g.startHand();
  g.act({ type: "call" });
  g.act({ type: "check" });
  g.dealNextStreet();
  const la = g.legalActions();
  eq(la.toCall, 0);
  eq(la.minRaiseTo, 10, "min open = BB");
});

test("short all-in does NOT reopen betting for a player who already acted", () => {
  // P0 bets 100 on the flop, P1 goes all-in for 130 (short of a full raise
  // to 200), P2 calls 130. Action returns to P0: may call 30 or fold, not raise.
  const g = mkGame([1000, 130, 1000], { btn: 2 });
  g.startHand();               // sb=0, bb=1, first actor=2
  g.act({ type: "call" });     // P2
  g.act({ type: "call" });     // P0 completes SB
  g.act({ type: "check" });    // P1 (BB) — has only 120 behind now
  g.dealNextStreet();          // flop; first actor = P0 (left of btn 2)
  eq(g.currentPlayer().id, 0);
  g.act({ type: "raise", amount: 100 });   // P0 bets 100
  eq(g.currentPlayer().id, 1);
  g.act({ type: "raise", amount: 120 });   // P1 all-in 120 total (short raise)
  ok(g.players[1].allIn);
  eq(g.currentPlayer().id, 2);
  g.act({ type: "call" });                 // P2 calls 120
  eq(g.currentPlayer().id, 0, "action back on P0");
  const la = g.legalActions();
  eq(la.toCall, 20);
  ok(!la.canRaise, "short all-in must not reopen betting");
  g.act({ type: "call" });
  eq(g.state, "street-complete");
});

test("a full raise DOES reopen betting", () => {
  const g = mkGame([1000, 1000, 1000], { btn: 2 });
  g.startHand();
  g.act({ type: "call" }); g.act({ type: "call" }); g.act({ type: "check" });
  g.dealNextStreet();
  g.act({ type: "raise", amount: 100 });   // P0 bets
  g.act({ type: "raise", amount: 300 });   // P1 raises (full)
  g.act({ type: "fold" });                 // P2
  const la = g.legalActions();             // back on P0
  eq(g.currentPlayer().id, 0);
  ok(la.canRaise, "full raise reopens betting");
  eq(la.minRaiseTo, 500, "min re-raise is +200");
});

test("side pots: three-way all-in with 100/300/1000 stacks", () => {
  const g = mkGame([100, 300, 1000], { btn: 0, sb: 5, bb: 10 });
  g.startHand();               // sb=1, bb=2, actor=0
  rig(g, ["Ac Ad", "Kc Kd", "Qc Qd"], "2h 7d 9s 4c Jh"); // aces hold
  g.act({ type: "raise", amount: 100 });  // P0 all-in 100
  g.act({ type: "raise", amount: 300 });  // P1 all-in 300 (full raise over 100)
  g.act({ type: "call" });                // P2 calls 300
  eq(g.state, "street-complete");
  ok(g.runout, "board runs out");
  while (g.state === "street-complete") g.dealNextStreet();
  eq(g.state, "hand-complete");
  const r = g.lastResult;
  eq(r.pots.length, 2, "main + one side pot");
  eq(r.pots[0].amount, 300, "main pot 3x100");
  eq(r.pots[1].amount, 400, "side pot 2x200");
  eq(r.pots[0].winners[0].id, 0, "P0 aces win main");
  eq(r.pots[1].winners[0].id, 1, "P1 kings win side");
  eq(g.players[0].stack, 300);
  eq(g.players[1].stack, 400);
  eq(g.players[2].stack, 700, "P2 keeps uncalled 700");
  eq(totalChips(g), 1400, "chips conserved");
});

test("uncalled excess returns to the aggressor via top side pot", () => {
  const g = mkGame([200, 1000], { btn: 0 });
  g.startHand();
  rig(g, ["2c 3d", "Ac Ah"], "5h 8d 9s Kc Qh");
  g.act({ type: "raise", amount: 200 });   // P0 (btn/sb) all-in 200
  g.act({ type: "call" });                 // P1 calls (only 200 matched)
  while (g.state === "street-complete") g.dealNextStreet();
  eq(g.state, "hand-complete");
  eq(g.players[1].stack, 1200, "P1 wins 200 + keeps rest");
  eq(g.players[0].stack, 0);
  eq(totalChips(g), 1200);
});

test("split pot divides evenly, odd chip goes left of button", () => {
  const g = mkGame([500, 500, 500], { btn: 0, sb: 5, bb: 10 });
  g.startHand();
  // both P1 and P2 play the board (broadway), P0 folds after limping
  rig(g, ["2c 2d", "3h 4s", "6h 7s"], "Tc Jd Qh Ks Ad");
  g.act({ type: "call" });   // P0 limps 10
  g.act({ type: "call" });   // P1 completes
  g.act({ type: "check" });  // P2
  g.dealNextStreet();
  g.act({ type: "check" }); g.act({ type: "check" }); g.act({ type: "fold" }); // wait—P0 must act; order: P1, P2, P0
  // ^ actually flop order 3-handed with btn=0: P1, P2, then P0. P0 folds.
  g.dealNextStreet();
  g.act({ type: "check" }); g.act({ type: "check" });
  g.dealNextStreet();
  g.act({ type: "check" }); g.act({ type: "check" });
  g.dealNextStreet();       // showdown
  eq(g.state, "hand-complete");
  const r = g.lastResult;
  eq(r.pots.length, 1);
  eq(r.pots[0].amount, 30);
  eq(r.pots[0].winners.length, 2, "P1 and P2 split");
  eq(g.players[1].stack + g.players[2].stack, 1010, "they split the pot, netting P0's dead 10");
  eq(totalChips(g), 1500);
});

test("blind all-in shorter than BB still plays", () => {
  const g = mkGame([1000, 4, 1000], { btn: 0 });   // SB has only 4
  g.startHand();
  ok(g.players[1].allIn, "SB all-in on blind");
  eq(g.currentBet, 10, "call amount is still full BB");
  rig(g, ["Ac Ah", "Kc Kd", "2c 7d"], "3h 8d 9s 4c Jh");
  g.act({ type: "call" });                  // P0 calls 10
  g.act({ type: "check" });                 // BB option
  g.dealNextStreet();
  g.act({ type: "check" }); g.act({ type: "check" });
  g.dealNextStreet();
  g.act({ type: "check" }); g.act({ type: "check" });
  g.dealNextStreet();
  g.act({ type: "check" }); g.act({ type: "check" });
  g.dealNextStreet();
  eq(g.state, "hand-complete");
  // P0 aces: wins main (4x3=12) and side (6x2=12) -> stack 1000-10+24=1014
  eq(g.players[0].stack, 1014);
  eq(totalChips(g), 2004);
});

test("button rotates to next live player between hands", () => {
  const g = mkGame([1000, 1000, 1000], { btn: 0 });
  g.startHand();
  const b1 = g.button;
  g.act({ type: "fold" }); g.act({ type: "fold" });
  eq(g.state, "hand-complete");
  g.startHand();
  eq(g.button, (b1 + 1) % 3, "button moved");
});

/* ---------------- AI + simulation ---------------- */
console.log("\n== AI & full-game simulation ==");

test("chen score ordering", () => {
  const c = (a, b) => E.chenScore(E.cardFromStr(a), E.cardFromStr(b));
  eq(c("As", "Ad"), 20, "AA = 20");
  gt(c("As", "Ad"), c("As", "Ks"), "AA > AKs");
  gt(c("As", "Ks"), c("7s", "2d"), "AKs > 72o");
  gt(c("Ts", "9s"), c("Ts", "9d"), "suited bonus");
});

test("equity estimates are sane", () => {
  const rng = E.mulberry32(99);
  const aa = E.estimateEquity(C("As Ad"), [], 1, 600, rng);
  ok(aa > 0.75 && aa < 0.95, `AA vs 1: ${aa.toFixed(2)} should be ~0.85`);
  const trash = E.estimateEquity(C("7c 2d"), [], 1, 600, rng);
  ok(trash < 0.45, `72o vs 1: ${trash.toFixed(2)} should be < 0.45`);
  const nuts = E.estimateEquity(C("Ah Kh"), C("Qh Jh Th"), 3, 400, rng);
  ok(nuts > 0.9, `royal flush equity ${nuts.toFixed(2)} should be ~1`);
});

test("200-hand AI-vs-AI simulation: legal actions, conserved chips, no crashes", () => {
  const rng = E.mulberry32(2026);
  const g = new E.Game({
    players: Array.from({ length: 6 }, (_, i) => ({
      name: "Bot" + i, stack: 1000,
      personality: E.PERSONALITIES[i % E.PERSONALITIES.length],
    })),
    smallBlind: 5, bigBlind: 10, rng, buttonIndex: 0,
  });
  const START = 6000;
  let hands = 0, showdowns = 0, sidePotHands = 0;
  while (g.canContinue() && hands < 200) {
    g.startHand(); hands++;
    let guard = 0;
    while (g.state !== "hand-complete") {
      if (++guard > 500) throw new Error("hand did not terminate");
      if (g.state === "awaiting-action") {
        const la = g.legalActions();
        const d = E.aiDecide(g, { iters: 40 });
        // validate the decision is legal before applying
        if (d.type === "check") ok(la.canCheck, "AI checked illegally");
        if (d.type === "raise") ok(la.canRaise, "AI raised illegally");
        g.act(d);
      } else if (g.state === "street-complete") {
        g.dealNextStreet();
      }
      for (const p of g.players) {
        ok(p.stack >= 0, "negative stack!");
        ok(Number.isInteger(p.stack), "fractional stack!");
      }
    }
    if (g.lastResult.showdown) showdowns++;
    if (g.lastResult.pots.length > 1) sidePotHands++;
    eq(totalChips(g), START, `chips conserved after hand ${hands}`);
  }
  ok(hands >= 50, `played ${hands} hands (table may break early)`);
  ok(showdowns > 3, `expected some showdowns, got ${showdowns}`);
  console.log(`      (${hands} hands, ${showdowns} showdowns, ${sidePotHands} side-pot hands)`);
});

test("deterministic: same seed, same outcome", () => {
  const play = seed => {
    const g = mkGame([800, 800, 800, 800], { seed, btn: 0 });
    for (let h = 0; h < 20 && g.canContinue(); h++) {
      g.startHand();
      while (g.state !== "hand-complete") {
        if (g.state === "awaiting-action") g.act(E.aiDecide(g, { iters: 30 }));
        else g.dealNextStreet();
      }
    }
    return g.players.map(p => p.stack).join(",");
  };
  eq(play(1234), play(1234), "identical runs");
});

/* ---------------- summary ---------------- */
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) { console.log("failures:", failures.join(" | ")); process.exit(1); }
