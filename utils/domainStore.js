/**
 * domainStore.js — persistent domain profile storage
 *
 * Structure:
 * {
 *   [userId]: {
 *     domains: [
 *       {
 *         id,          // short unique id
 *         name,
 *         description,
 *         color,       // hex string e.g. "#f38ba8"
 *         thumbnail,   // image url
 *         victoryAnim, // gif/video url shown on win
 *         technique,   // "Binding Vow" | "Barrier" | "CT Reversal" | "Innate"
 *         tier,        // "C" | "B" | "A" | "S" | "SS"
 *         wins,
 *         losses,
 *         rct,         // bool — Reverse Cursed Technique unlocked
 *         createdAt,
 *       }
 *     ],
 *     activeIndex: 0,  // which domain is used in clashes
 *   }
 * }
 */

const fs   = require('fs');
const path = require('path');

const DATA_DIR    = path.join(__dirname, 'data');
const DOMAIN_FILE = path.join(DATA_DIR, 'domains.json');

// Tier thresholds (wins needed to reach each tier)
const TIER_THRESHOLDS = { C: 0, B: 3, A: 7, S: 15, SS: 25 };

function calcTier(wins) {
  if (wins >= 25) return 'SS';
  if (wins >= 15) return 'S';
  if (wins >= 7)  return 'A';
  if (wins >= 3)  return 'B';
  return 'C';
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

// ── I/O ───────────────────────────────────────────────────────
function load() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(DOMAIN_FILE)) return {};
    const raw = fs.readFileSync(DOMAIN_FILE, 'utf8').trim();
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function save(db) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DOMAIN_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
    fs.renameSync(tmp, DOMAIN_FILE);
  } catch (err) {
    console.error('[domainStore] save failed:', err.message);
  }
}

// ── Public API ────────────────────────────────────────────────

function getUser(userId) {
  const db = load();
  return db[userId] ?? { domains: [], activeIndex: 0 };
}

function getDomains(userId) {
  return getUser(userId).domains;
}

function getActiveDomain(userId) {
  const u = getUser(userId);
  return u.domains[u.activeIndex] ?? null;
}

function createDomain(userId, fields) {
  const db   = load();
  if (!db[userId]) db[userId] = { domains: [], activeIndex: 0 };

  // RCT: 30% chance on creation
  const rct = Math.random() < 0.3;

  const domain = {
    id:          genId(),
    name:        fields.name,
    description: fields.description ?? '',
    color:       fields.color ?? '#89b4fa',
    thumbnail:   fields.thumbnail ?? '',
    victoryAnim: fields.victoryAnim ?? '',
    technique:   fields.technique ?? 'Innate',
    tier:        'C',
    wins:        0,
    losses:      0,
    rct,
    createdAt:   new Date().toISOString(),
  };

  db[userId].domains.push(domain);
  save(db);
  return domain;
}

function setActive(userId, index) {
  const db = load();
  if (!db[userId]) return false;
  if (index < 0 || index >= db[userId].domains.length) return false;
  db[userId].activeIndex = index;
  save(db);
  return true;
}

function deleteDomain(userId, domainId) {
  const db = load();
  if (!db[userId]) return false;
  const idx = db[userId].domains.findIndex(d => d.id === domainId);
  if (idx === -1) return false;
  db[userId].domains.splice(idx, 1);
  if (db[userId].activeIndex >= db[userId].domains.length) {
    db[userId].activeIndex = Math.max(0, db[userId].domains.length - 1);
  }
  save(db);
  return true;
}

function recordWin(userId, domainId) {
  const db = load();
  const domain = db[userId]?.domains.find(d => d.id === domainId);
  if (!domain) return;
  domain.wins++;
  domain.tier = calcTier(domain.wins);
  save(db);
}

function recordLoss(userId, domainId) {
  const db = load();
  const domain = db[userId]?.domains.find(d => d.id === domainId);
  if (!domain) return;
  domain.losses++;
  save(db);
}

const TIER_EMOJI = { C: '⚪', B: '🟢', A: '🔵', S: '🔴', SS: '💀' };
const TIER_COLOR = { C: 0x6c7086, B: 0xa6e3a1, A: 0x89b4fa, S: 0xf38ba8, SS: 0xcba6f7 };

module.exports = {
  getDomains, getActiveDomain, getUser,
  createDomain, setActive, deleteDomain,
  recordWin, recordLoss,
  calcTier, TIER_EMOJI, TIER_COLOR,
};
