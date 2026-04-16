const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/auditSettings.json');

let _cache = null;
let _cacheTime = 0;
const CACHE_TTL = 10_000;

function load() {
  const now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL) return _cache;
  try {
    if (!fs.existsSync(path.dirname(DATA_FILE))) {
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    }
    if (fs.existsSync(DATA_FILE)) {
      _cache = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } else {
      _cache = {};
    }
  } catch (err) {
    console.error('[auditStore] Failed to load:', err);
    _cache = {};
  }
  _cacheTime = now;
  return _cache;
}

function save(data) {
  try {
    if (!fs.existsSync(path.dirname(DATA_FILE))) {
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    }
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, DATA_FILE);
    _cache = data;
    _cacheTime = Date.now();
  } catch (err) {
    console.error('[auditStore] Failed to save:', err);
  }
}

function getGuild(guildId) {
  const data = load();
  return data[guildId] || null;
}

function setChannel(guildId, channelId) {
  const data = load();
  data[guildId] = { channelId, enabled: true };
  save(data);
}

function disable(guildId) {
  const data = load();
  if (data[guildId]) {
    data[guildId].enabled = false;
    save(data);
  }
}

function reload() {
  _cache = null;
  _cacheTime = 0;
  return load();
}

module.exports = { getGuild, setChannel, disable, reload };
