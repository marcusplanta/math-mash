/**
 * game.js — MathCrush core game logic
 *
 * Depends on (loaded before this script):
 *   audio.js   → resumeAC, playClick, playDeselect, playCorrect,
 *                 playWrong, playLevelUp, playGameOver, playTileSelect
 *   visuals.js → burst, BURST_COLORS
 */

// ── Value → colour mapping ────────────────────────────────────────────────────
// Each number 2–20 gets a unique, consistent colour across the board.

const VAL_STYLES = {
  2:  { cls: 'v2',  bg: '#e11d48', fg: '#ffe4e6' },
  3:  { cls: 'v3',  bg: '#ea580c', fg: '#fff7ed' },
  4:  { cls: 'v4',  bg: '#d97706', fg: '#fefce8' },
  5:  { cls: 'v5',  bg: '#65a30d', fg: '#f7fee7' },
  6:  { cls: 'v6',  bg: '#059669', fg: '#ecfdf5' },
  7:  { cls: 'v7',  bg: '#0891b2', fg: '#ecfeff' },
  8:  { cls: 'v8',  bg: '#2563eb', fg: '#eff6ff' },
  9:  { cls: 'v9',  bg: '#7c3aed', fg: '#f5f3ff' },
  10: { cls: 'v10', bg: '#9d174d', fg: '#fdf2f8' },
  11: { cls: 'v11', bg: '#b91c1c', fg: '#fef2f2' },
  12: { cls: 'v12', bg: '#c2410c', fg: '#fff7ed' },
  13: { cls: 'v13', bg: '#a16207', fg: '#fefce8' },
  14: { cls: 'v14', bg: '#4d7c0f', fg: '#f7fee7' },
  15: { cls: 'v15', bg: '#0f766e', fg: '#f0fdfa' },
  16: { cls: 'v16', bg: '#0369a1', fg: '#f0f9ff' },
  17: { cls: 'v17', bg: '#1d4ed8', fg: '#eff6ff' },
  18: { cls: 'v18', bg: '#6d28d9', fg: '#f5f3ff' },
  19: { cls: 'v19', bg: '#86198f', fg: '#fdf4ff' },
  20: { cls: 'v20', bg: '#9f1239', fg: '#fff1f2' },
};

/** Return the style entry for a numeric value, with a safe fallback. */
function valStyle(v) {
  return VAL_STYLES[v] || { cls: 'v9', bg: '#7c3aed', fg: '#f5f3ff' };
}

const OP_CHIP    = { bg: '#38bdf8', fg: '#0c4a6e' };
const BOARD_SIZE = 16; // 4×4 grid

// ── Game state ────────────────────────────────────────────────────────────────

let level      = 1;
let score      = 0;
let xp         = 0;
let bestScore  = 0;
let target     = 0;
let mode       = 'sum';   // 'sum' | 'ops' | 'chain'
let tiles      = [];      // all 16 tile objects on the board
let selected   = [];      // tiles the player has tapped, in tap order
let timerSecs  = 30;
let timeLeft   = 30;
let timerInt   = null;
let gameActive = false;
let idleTimer  = null;

// ── DOM references ────────────────────────────────────────────────────────────

const $grid      = document.getElementById('grid');
const $targetNum = document.getElementById('target-num');
const $eqChips   = document.getElementById('eq-chips');
const $eqResult  = document.getElementById('eq-result');
const $btnGo     = document.getElementById('btn-go');
const $btnClear  = document.getElementById('btn-clear');
const $scoreVal  = document.getElementById('score-val');
const $bestVal   = document.getElementById('best-val');
const $lvlNum    = document.getElementById('lvl-num');
const $xpFill    = document.getElementById('xp-fill');
const $xpTxt     = document.getElementById('xp-txt');
const $timerFill = document.getElementById('timer-fill');
const $timerTxt  = document.getElementById('timer-txt');
const $modePill  = document.getElementById('mode-pill');
const $app       = document.getElementById('app');
const $over      = document.getElementById('screen-over');

// ── Scaling helpers ───────────────────────────────────────────────────────────

function rng(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function xpNeeded()      { return 200 + level * 100; }
function timerForLevel() { return Math.max(15, 30 - Math.floor(level / 3)); }

/**
 * Points for a correct answer.
 * Chain-length bonus: each operator adds 20% on top of the base.
 */
function ptsFor(opCount) {
  return Math.floor((80 + level * 20) * (1 + opCount * 0.2));
}

// ── Idle hint ─────────────────────────────────────────────────────────────────
// Shakes the target card if the player hasn't tapped anything for 8 seconds.

function resetIdleHint() {
  clearTimeout(idleTimer);
  const card = document.getElementById('target-card');
  card.classList.remove('hint');
  if (!gameActive) return;
  idleTimer = setTimeout(() => {
    card.classList.add('hint');
    setTimeout(() => card.classList.remove('hint'), 500);
  }, 8000);
}

// ── Sequence evaluation ───────────────────────────────────────────────────────

/**
 * Evaluate an alternating [num, op, num, op, num, …] sequence left-to-right.
 * @param   {object[]} seq - Array of tile objects in num→op→num order
 * @returns {number|null}  - Integer result, or null if the sequence is invalid
 */
function evalSeq(seq) {
  if (!seq || !seq.length) return null;
  if (seq[0].type !== 'num') return null;
  // Must end on a number and strictly alternate types
  for (let i = 0; i < seq.length; i++) {
    if (i % 2 === 0 && seq[i].type !== 'num') return null;
    if (i % 2 === 1 && seq[i].type !== 'op')  return null;
  }
  if (seq[seq.length - 1].type !== 'num') return null;

  let result = seq[0].val;
  for (let i = 1; i < seq.length - 1; i += 2) {
    const op = seq[i].val;
    const n  = seq[i + 1].val;
    if      (op === '+' )              result += n;
    else if (op === '−' || op === '-') result -= n;
    else if (op === '×' || op === '*') result *= n;
    else if (op === '÷' || op === '/') {
      if (!n || result % n !== 0) return null;
      result = result / n;
    }
  }
  return result;
}

/**
 * Build the evaluation sequence from the current selection.
 *
 * KEY FIX for chaining bug:
 *   The player can tap tiles in any order. Rather than enforcing strict
 *   tap order (which breaks when people tap num → num → op instead of
 *   num → op → num), we separate the tapped tiles into two ordered lists —
 *   nums (in the order they were tapped) and ops (in the order they were
 *   tapped) — then interleave them: num₀ op₀ num₁ op₁ num₂ …
 *
 *   This means:
 *     - "4, ×, 9, −, 3" tapped in any order always evaluates as 4×9−3=33
 *     - The player is free to tap all numbers first, then operators, or mix
 *     - Validation only checks that counts are compatible: #nums = #ops + 1
 */
function buildEvalSequence() {
  // Preserve tap order within each type
  const nums = selected.filter(s => s.type === 'num');
  const ops  = selected.filter(s => s.type === 'op');

  if (nums.length === 0) return null;

  // In sum mode we only need numbers
  if (mode === 'sum') return nums;

  // For ops/chain: need exactly one more number than operators
  if (nums.length !== ops.length + 1) return null;

  // Interleave: num₀, op₀, num₁, op₁, …
  const seq = [];
  for (let i = 0; i < ops.length; i++) {
    seq.push(nums[i], ops[i]);
  }
  seq.push(nums[nums.length - 1]);
  return seq;
}

/** Evaluate the player's current selection. Returns number or null. */
function evalSelected() {
  if (!selected.length) return null;

  if (mode === 'sum') {
    const nums = selected.filter(s => s.type === 'num');
    return nums.length >= 2 ? nums.reduce((a, s) => a + s.val, 0) : null;
  }

  const seq = buildEvalSequence();
  return seq ? evalSeq(seq) : null;
}

// ── Board generation ──────────────────────────────────────────────────────────

/**
 * Generate the game board and pick a guaranteed-valid target.
 * Strategy: build the board first, enumerate reachable expressions,
 * then choose one with result ≥ 10 as the target.
 */
function genLevel() {
  if      (level >= 5) mode = 'chain';
  else if (level >= 3) mode = 'ops';
  else                 mode = 'sum';

  selected   = [];
  timerSecs  = timerForLevel();
  timeLeft   = timerSecs;

  const maxNum = Math.min(3 + level * 2, 20);
  const opPool = ['+', '−', '×'];
  if (level >= 4) opPool.push('÷');

  const boardTiles = buildBoard(maxNum, opPool);
  const validExprs = findValidExprs(boardTiles, mode, opPool);

  // Retry if no valid expressions found (extremely rare edge case)
  if (!validExprs.length) { genLevel(); return; }

  // Prefer targets ≥ 10; shuffle to avoid always picking the same expression
  const good = validExprs.filter(e => e.result >= 10);
  const pool = good.length ? good : validExprs;
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng(0, i);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  target = pool[0].result;

  tiles = boardTiles;
  $targetNum.textContent = target;
  $lvlNum.textContent    = level;
  $modePill.textContent  = { sum: '+ sum mode', ops: '± ops mode', chain: 'chain mode!' }[mode];

  updateXpBar();
  renderGrid();
  resetTimer();
  resetIdleHint();
  gameActive = true;
}

/**
 * Build a fresh 4×4 board appropriate for the current mode.
 * Sum:   16 number tiles
 * Ops:   8 numbers + 8 operators, interleaved
 * Chain: same layout, but exactly 2 of each available operator
 */
function buildBoard(maxNum, opPool) {
  const board = [];

  if (mode === 'sum') {
    for (let i = 0; i < BOARD_SIZE; i++) {
      const v = rng(2, maxNum);
      board.push({ id: i, type: 'num', val: v, col: valStyle(v).cls });
    }
    return board;
  }

  // Build 8 number tiles
  const numTiles = Array.from({ length: 8 }, (_, i) => {
    const v = rng(2, maxNum);
    return { id: i * 2, type: 'num', val: v, col: valStyle(v).cls };
  });

  // Build 8 operator tiles
  let opValues;
  if (mode === 'chain') {
    // Exactly 2 of each available operator, shuffled and trimmed to 8
    let pool = opPool.flatMap(op => [op, op]);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = rng(0, i);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    opValues = pool.slice(0, 8);
  } else {
    opValues = Array.from({ length: 8 }, () => opPool[rng(0, opPool.length - 1)]);
  }
  const opTiles = opValues.map((op, i) => ({ id: i * 2 + 1, type: 'op', val: op, col: 'oc' }));

  // Interleave: num, op, num, op, …
  for (let i = 0; i < 8; i++) {
    board.push(numTiles[i], opTiles[i]);
  }
  return board;
}

/**
 * Find all valid expressions reachable from the given board tiles.
 * @returns {Array<{seq: object[], result: number}>}
 */
function findValidExprs(boardTiles, mode, opPool) {
  const results  = [];
  const numTiles = boardTiles.filter(t => t.type === 'num');
  const opTiles  = boardTiles.filter(t => t.type === 'op');
  const CAP      = 40; // stop early once we have enough candidates

  if (mode === 'sum') {
    // Try all subsets of 2–5 number tiles
    const n = numTiles.length;
    for (let mask = 1; mask < (1 << n); mask++) {
      const bits = [];
      for (let b = 0; b < n; b++) if (mask & (1 << b)) bits.push(b);
      if (bits.length < 2 || bits.length > 5) continue;
      const seq = bits.map(b => numTiles[b]);
      const r   = seq.reduce((a, t) => a + t.val, 0);
      if (r >= 10) results.push({ seq, result: r });
      if (results.length >= CAP) break;
    }
    return results;
  }

  // Ops / chain: depth-first search for N op N [op N …] chains
  const maxOps = mode === 'chain' ? 3 : 1;

  function search(seq, usedIds) {
    const last = seq[seq.length - 1];
    if (last.type === 'num' && seq.length >= 3) {
      const r = evalSeq(seq);
      if (r !== null) results.push({ seq: [...seq], result: r });
    }
    if (results.length >= CAP) return;

    const opCount = seq.filter(t => t.type === 'op').length;
    if (last.type === 'num' && opCount < maxOps) {
      for (const op of opTiles) {
        if (usedIds.has(op.id)) continue;
        for (const num of numTiles) {
          if (usedIds.has(num.id)) continue;
          usedIds.add(op.id);
          usedIds.add(num.id);
          seq.push(op, num);
          search(seq, usedIds);
          seq.pop();
          seq.pop();
          usedIds.delete(op.id);
          usedIds.delete(num.id);
          if (results.length >= CAP) return;
        }
      }
    }
  }

  for (const startNum of numTiles) {
    if (results.length >= CAP) break;
    search([startNum], new Set([startNum.id]));
  }
  return results;
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderGrid() {
  $grid.innerHTML = '';
  tiles.forEach(t => {
    const el = document.createElement('div');
    el.className    = `tile drop-in ${t.col}`;
    el.textContent  = t.val;
    el.dataset.id   = t.id;
    if (selected.find(s => s.id === t.id)) el.classList.add('sel');
    el.addEventListener('click', () => onTileClick(t, el));
    $grid.appendChild(el);
  });
  updateEqBar();
}

// ── Tile interaction ──────────────────────────────────────────────────────────

function onTileClick(t, el) {
  resumeAC();
  resetIdleHint();

  const alreadyIdx = selected.findIndex(s => s.id === t.id);

  if (alreadyIdx >= 0) {
    // Deselect this tile
    selected.splice(alreadyIdx, 1);
    el.classList.remove('sel');
    playDeselect();
  } else {
    // Validate before adding
    if (!canSelect(t)) {
      el.classList.add('wrong-anim');
      setTimeout(() => el.classList.remove('wrong-anim'), 400);
      return;
    }
    selected.push(t);
    el.classList.add('sel');
    // Bounce animation
    el.classList.remove('bounce');
    void el.offsetWidth;
    el.classList.add('bounce');
    playTileSelect(t.type === 'num' ? t.val : 0);
  }

  updateEqBar();
}

/**
 * Check whether a tile can be added to the current selection.
 *
 * Sum mode:   only numbers, max 5
 * Ops mode:   max 2 numbers + 1 operator  (one expression: N op N)
 * Chain mode: max 4 numbers + 3 operators (e.g. N op N op N op N)
 *
 * Because we interleave by type (not tap order), we only need to check
 * that the total count of each type stays within bounds.
 */
function canSelect(t) {
  const numCount = selected.filter(s => s.type === 'num').length;
  const opCount  = selected.filter(s => s.type === 'op').length;

  if (mode === 'sum') {
    return t.type === 'num' && numCount < 5;
  }

  const maxNums = mode === 'chain' ? 4 : 2;
  const maxOps  = mode === 'chain' ? 3 : 1;

  if (t.type === 'num') return numCount < maxNums;
  if (t.type === 'op')  return opCount  < maxOps && opCount < numCount;
  return false;
}

// ── Equation bar ──────────────────────────────────────────────────────────────

function updateEqBar() {
  if (!selected.length) {
    const hint = mode === 'sum'
      ? 'tap numbers that add up to the target'
      : 'tap numbers and operators — any order!';
    $eqChips.innerHTML = `<span class="placeholder">${hint}</span>`;
    $eqResult.textContent = '—';
    $eqResult.className   = '';
    $btnGo.disabled = true;
    return;
  }

  // Display chips using buildEvalSequence order so the equation reads correctly
  const displaySeq = (mode === 'sum')
    ? selected.filter(s => s.type === 'num')
    : (buildEvalSequence() || selected);

  $eqChips.innerHTML = displaySeq.map(s => {
    const st = s.type === 'op' ? OP_CHIP : { bg: valStyle(s.val).bg, fg: valStyle(s.val).fg };
    return `<span style="
      display:inline-flex;align-items:center;justify-content:center;
      min-width:30px;height:30px;padding:0 7px;border-radius:8px;
      font-size:15px;font-weight:900;
      background:${st.bg};color:${st.fg}
    ">${s.val}</span>`;
  }).join('');

  const res = evalSelected();
  if (res === null) {
    $eqResult.textContent = '?';
    $eqResult.className   = '';
    $btnGo.disabled = true;
  } else {
    $eqResult.textContent = `= ${res}`;
    $eqResult.className   = res === target ? 'match' : res > target ? 'over' : 'under';
    $btnGo.disabled = false;
  }
}

// ── Submission ────────────────────────────────────────────────────────────────

function onSubmit() {
  resumeAC();
  const res = evalSelected();

  if (res === target) {
    handleCorrect();
  } else {
    handleWrong();
  }
}

function handleCorrect() {
  playCorrect();

  const opCount = selected.filter(s => s.type === 'op').length;
  const pts     = ptsFor(opCount);
  score += pts;
  xp    += pts;
  if (score > bestScore) bestScore = score;
  $scoreVal.textContent = score;
  $bestVal.textContent  = bestScore;

  // Floating score popup
  const appRect = $app.getBoundingClientRect();
  const pop = document.createElement('div');
  pop.className   = 'score-pop';
  pop.textContent = `+${pts}!`;
  pop.style.left  = `${appRect.left + appRect.width / 2 - 30}px`;
  pop.style.top   = `${appRect.top + 200}px`;
  document.body.appendChild(pop);
  setTimeout(() => pop.remove(), 1200);

  // Burst particles from each cleared tile
  selected.forEach(s => {
    const el = $grid.querySelector(`[data-id="${s.id}"]`);
    if (el) {
      const r = el.getBoundingClientRect();
      burst(r.left + r.width / 2, r.top + r.height / 2, BURST_COLORS, 14);
      el.classList.add('pop-out');
    }
  });

  const removedIds = new Set(selected.map(s => s.id));
  selected = [];

  setTimeout(() => {
    refillBoard(removedIds);
    updateXpBar();
    resetIdleHint();

    if (xp >= xpNeeded()) {
      xp = 0;
      level++;
      playLevelUp();
      burst(window.innerWidth / 2, window.innerHeight / 2, BURST_COLORS, 50);
      genLevel();
    } else {
      renderGrid();
      updateEqBar();
    }
  }, 380);
}

function handleWrong() {
  playWrong();
  $app.classList.remove('shaking');
  void $app.offsetWidth;
  $app.classList.add('shaking');
  setTimeout(() => $app.classList.remove('shaking'), 400);

  $grid.querySelectorAll('.tile.sel').forEach(el => {
    el.classList.add('wrong-anim');
    el.classList.remove('sel');
    setTimeout(() => el.classList.remove('wrong-anim'), 400);
  });
  selected = [];
  updateEqBar();
}

// ── Board refill ──────────────────────────────────────────────────────────────

/**
 * Remove used tiles and refill the board to BOARD_SIZE.
 * After refilling, verify the current target is still reachable;
 * if not, pick a new valid target from the refreshed board.
 */
function refillBoard(removedIds) {
  tiles = tiles.filter(t => !removedIds.has(t.id));

  const maxNum = Math.min(3 + level * 2, 20);
  const opPool = ['+', '−', '×'];
  if (level >= 4) opPool.push('÷');

  while (tiles.length < BOARD_SIZE) {
    const newId = Date.now() + Math.random();
    if (mode === 'sum') {
      const v = rng(2, maxNum);
      tiles.push({ id: newId, type: 'num', val: v, col: valStyle(v).cls });
    } else {
      // Maintain roughly equal numbers and operators
      const numCount = tiles.filter(t => t.type === 'num').length;
      const opCount  = tiles.filter(t => t.type === 'op').length;
      if (numCount <= opCount) {
        const v = rng(2, maxNum);
        tiles.push({ id: newId, type: 'num', val: v, col: valStyle(v).cls });
      } else {
        tiles.push({ id: newId, type: 'op', val: opPool[rng(0, opPool.length - 1)], col: 'oc' });
      }
    }
  }

  // Re-verify target is still reachable on the new board
  const exprs = findValidExprs(tiles, mode, opPool);
  if (exprs.length && !exprs.find(e => e.result === target)) {
    const good = exprs.filter(e => e.result >= 10);
    const pick = (good.length ? good : exprs)[rng(0, Math.min(4, (good.length || exprs.length) - 1))];
    target = pick.result;
    $targetNum.textContent = target;
  }
}

// ── XP bar ────────────────────────────────────────────────────────────────────

function updateXpBar() {
  const need = xpNeeded();
  $xpFill.style.width  = `${Math.min(100, (xp / need) * 100)}%`;
  $xpTxt.textContent   = `${xp} / ${need} to level up`;
}

// ── Timer ─────────────────────────────────────────────────────────────────────

function resetTimer() {
  clearInterval(timerInt);
  $timerFill.style.width      = '100%';
  $timerFill.style.background = '#22c55e';

  timerInt = setInterval(() => {
    if (!gameActive) return;
    timeLeft -= 0.1;
    const pct = (timeLeft / timerSecs) * 100;
    $timerFill.style.width      = `${pct}%`;
    $timerTxt.textContent       = `${Math.ceil(timeLeft)}s`;
    if (pct < 40) $timerFill.style.background = '#f59e0b';
    if (pct < 15) $timerFill.style.background = '#ef4444';
    if (timeLeft <= 0) {
      clearInterval(timerInt);
      gameActive = false;
      gameOver();
    }
  }, 100);
}

// ── Game over ─────────────────────────────────────────────────────────────────

function gameOver() {
  clearTimeout(idleTimer);
  playGameOver();
  if (score > bestScore) bestScore = score;
  document.getElementById('over-lvl').textContent   = level;
  document.getElementById('over-score').textContent = score;
  document.getElementById('over-best').textContent  = bestScore;
  $over.classList.add('show');
}

// ── Button listeners ──────────────────────────────────────────────────────────

document.getElementById('btn-restart').addEventListener('click', () => {
  resumeAC();
  level = 1; score = 0; xp = 0;
  $scoreVal.textContent = 0;
  $bestVal.textContent  = bestScore;
  $over.classList.remove('show');
  genLevel();
});

$btnGo.addEventListener('click', onSubmit);

$btnClear.addEventListener('click', () => {
  resumeAC();
  selected = [];
  $grid.querySelectorAll('.tile').forEach(el => el.classList.remove('sel'));
  updateEqBar();
  playDeselect();
});

// ── Start ─────────────────────────────────────────────────────────────────────
genLevel();
