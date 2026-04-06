/**
 * domainclash.js — JJK Domain Clash
 *
 * PvP:  /domainclash @user         — both need a saved domain via >domaincreate
 * PvE:  /domainclash @Tethys       — fight the bot (Tethys Computation domain)
 *       optional: difficulty: easy | medium | hard
 *
 * Clash flow:
 *   1. Reveal both domains
 *   2. 7 cursed words — 30s typing challenge (bot simulates typing in PvE)
 *   3. RCT bonus (30% chance +10 weight if domain has rct)
 *   4. Tier bonus applied
 *   5. Weighted RNG → result → victory animation → tier/record update
 */

const {
  SlashCommandBuilder,
  EmbedBuilder,
} = require('discord.js');

const store = require('../../utils/domainStore');

// ── Tethys bot domain (permanent, SS-tier) ─────────────────────
const TETHYS_DOMAIN = {
  id:          'tethys_system',
  name:        'Tethys Computation',
  description: '*"All variables accounted for. All outcomes calculated.\nThere is no trajectory that leads to your survival."*\n\nAn infinite bounded field of data streams and recursive calculation. Every cursed technique within range is analyzed, decomposed, and countered in real time. The sure-hit effect rewrites probability itself.',
  color:       '#89dceb',
  thumbnail:   'https://static.wikia.nocookie.net/wutheringwaves/images/5/5d/Resonator_Shorekeeper.png',
  victoryAnim: '',
  technique:   'CT Reversal — Infinite Calculation',
  tier:        'SS',
  wins:        0,
  losses:      0,
  rct:         true,
  createdAt:   '2024-01-01T00:00:00.000Z',
};

// Bot word counts per difficulty (out of 7)
const BOT_DIFFICULTY = {
  easy:   { min: 1, max: 3, label: '🟢 Easy',   tierBonus: 0  },
  medium: { min: 3, max: 5, label: '🟡 Medium',  tierBonus: 10 },
  hard:   { min: 5, max: 7, label: '🔴 Hard',    tierBonus: 20 },
};

// Tethys-specific narration lines
const TETHYS_NARRATION = [
  '*"Calculation complete. Resistance factor: negligible."*',
  '*"Every movement predicted. Every technique catalogued."*',
  '*"The output exceeds measurable thresholds."*',
  '*"Processing... processing... answer found."*',
  '*"Your cursed energy signature has been indexed."*',
];

const TETHYS_WIN_LINES = [
  '*"The computation was never in doubt."*',
  '*"All variables resolved. As expected."*',
  '*"Tethys Computation cannot be overwritten. It simply absorbs."*',
  '*"You fought well. The data has been recorded."*',
];

const TETHYS_LOSE_LINES = [
  '*"An... unexpected variable."*',
  '*"Recalculating. This outcome was assigned 0.3% probability."*',
  '*"The computation failed. Anomaly detected."*',
  '*"You broke through the calculation. Remarkable."*',
];

// ── Shared word pool ───────────────────────────────────────────
const CURSED_WORDS = [
  'malevolent','shrine','infinite','void','divergent','fist',
  'chimera','shadow','gojo','sukuna','jujutsu','cursed',
  'technique','barrier','expansion','reversal','hollow',
  'purple','black','flash','domain','binding','vow',
  'tengen','sorcerer','special','grade','vessel','ritual',
  'cleave','dismantle','stacked','overflow','inverted',
  'spear','lightning','tiger','funeral','coffin','iron',
  'mountain','wind','scream','horizon','collapse','output',
  'azure','ember','phantom','eclipse','resonance','rupture',
];

const NARRATION = [
  'The barriers collide — reality fractures at the seams.',
  'Two sure-hit techniques. Only one can overwrite the other.',
  'Cursed energy tears through the air like a living thing.',
  'The ground beneath them ceases to exist.',
  'Neither sorcerer blinks. Neither breathes.',
  'The clash compresses time itself into a single, violent moment.',
  'Spectators feel the pressure even from outside the barrier.',
  'The domains fight for dominance — space itself takes sides.',
  'A binding vow is made in blood and cursed energy.',
  'The output is immeasurable. The readings break.',
];

const WIN_LINES = [
  '*"A sorcerer of that caliber... was always going to win."*',
  '*"Their cursed energy simply overwhelmed the other."*',
  '*"The domain was perfect. Not a single gap."*',
  '*"There was no avoiding it. Their technique was absolute."*',
  '*"The barrier collapsed — and only one walked out."*',
];

const LOSE_LINES = [
  '*"Their domain crumbled from the inside."*',
  '*"A flaw in the barrier. That\'s all it takes."*',
  '*"Their cursed energy ran dry at the worst possible moment."*',
  '*"They never had a chance against that technique."*',
];

// ── Helpers ────────────────────────────────────────────────────
function pick(arr)  { return arr[Math.floor(Math.random() * arr.length)]; }
function pause(ms)  { return new Promise(r => setTimeout(r, ms)); }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function parseColor(str) {
  if (!str || !str.trim()) return 0x89b4fa;
  const hex = parseInt(str.replace('#', ''), 16);
  return isNaN(hex) ? 0x89b4fa : hex;
}

// Active clashes per channel
const activeClashes = new Map();

// ── Slash command ──────────────────────────────────────────────
module.exports = {
  data: new SlashCommandBuilder()
    .setName('domainclash')
    .setDescription('Challenge a sorcerer — or the bot itself — to a Domain Expansion clash')
    .addUserOption(opt =>
      opt.setName('opponent')
        .setDescription('The sorcerer to clash with. Tag @Tethys to fight the bot.')
        .setRequired(true))
    .addStringOption(opt =>
      opt.setName('difficulty')
        .setDescription('Bot difficulty (only applies when fighting Tethys)')
        .setRequired(false)
        .addChoices(
          { name: '🟢 Easy   — Tethys is holding back',         value: 'easy'   },
          { name: '🟡 Medium — a real fight',                   value: 'medium' },
          { name: '🔴 Hard   — full Tethys Computation output', value: 'hard'   },
        )),

  async execute(interaction) {
    const challenger = interaction.user;
    const opponent   = interaction.options.getUser('opponent');
    const difficulty = interaction.options.getString('difficulty') ?? 'medium';

    if (opponent.id === challenger.id)
      return interaction.reply({ content: '❌ You cannot clash with yourself.', flags: 64 });

    if (activeClashes.has(interaction.channelId))
      return interaction.reply({ content: '❌ A domain clash is already in progress in this channel.', flags: 64 });

    // ── PvE: opponent is the bot ─────────────────────────────
    const isBotFight = opponent.id === interaction.client.user.id;

    if (isBotFight) {
      const cDomain = store.getActiveDomain(challenger.id);
      if (!cDomain) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder().setColor(0xf38ba8)
              .setDescription('❌ You need an active domain first. Use `>domaincreate`.'),
          ],
          flags: 64,
        });
      }

      await interaction.deferReply();
      activeClashes.set(interaction.channelId, true);
      try {
        await runBotClash(interaction.channel, challenger, cDomain, difficulty, interaction.client.user);
      } finally {
        activeClashes.delete(interaction.channelId);
      }
      return;
    }

    // ── PvP: both humans ─────────────────────────────────────
    if (opponent.bot)
      return interaction.reply({ content: '❌ That bot has no cursed energy. Tag **@Tethys** to fight me.', flags: 64 });

    const cDomain = store.getActiveDomain(challenger.id);
    const oDomain = store.getActiveDomain(opponent.id);

    if (!cDomain) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0xf38ba8).setDescription('❌ You need an active domain. Use `>domaincreate`.')],
        flags: 64,
      });
    }
    if (!oDomain) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0xf38ba8).setDescription('❌ <@' + opponent.id + '> has no active domain. They need to use `>domaincreate`.')],
        flags: 64,
      });
    }

    await interaction.deferReply();
    activeClashes.set(interaction.channelId, true);
    try {
      await runClash(interaction.channel, challenger, opponent, cDomain, oDomain);
    } finally {
      activeClashes.delete(interaction.channelId);
    }
  },
};

// ── PvE clash ──────────────────────────────────────────────────
async function runBotClash(channel, challenger, cDomain, difficulty, botUser) {
  const diff    = BOT_DIFFICULTY[difficulty];
  const bDomain = TETHYS_DOMAIN;

  // Announce
  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x89dceb)
        .setTitle('⚡ TETHYS COMPUTATION — DOMAIN CLASH')
        .setDescription(
          '<@' + challenger.id + '> challenges **Tethys System** to a Domain Expansion clash.\n\n' +
          '**' + cDomain.name + '** ' + store.TIER_EMOJI[cDomain.tier] + cDomain.tier +
          '  vs  **Tethys Computation** 💀SS\n\n' +
          '*Difficulty: ' + diff.label + '*\n\n' +
          pick(TETHYS_NARRATION)
        )
        .setThumbnail(bDomain.thumbnail)
        .setTimestamp(),
    ],
  });
  await pause(2000);

  // Reveal challenger domain
  const cEmbed = new EmbedBuilder()
    .setColor(parseColor(cDomain.color))
    .setTitle('⚡ ' + cDomain.name.toUpperCase())
    .setDescription(cDomain.description || '*No description.*')
    .addFields(
      { name: 'Tier',      value: store.TIER_EMOJI[cDomain.tier] + ' ' + cDomain.tier, inline: true },
      { name: 'Technique', value: cDomain.technique,                                    inline: true },
      { name: 'RCT',       value: cDomain.rct ? '✅' : '❌',                            inline: true },
    )
    .setAuthor({ name: challenger.username, iconURL: challenger.displayAvatarURL() });
  if (cDomain.thumbnail) cEmbed.setThumbnail(cDomain.thumbnail);

  // Reveal Tethys domain
  const bEmbed = new EmbedBuilder()
    .setColor(0x89dceb)
    .setTitle('⚡ TETHYS COMPUTATION')
    .setDescription(bDomain.description)
    .addFields(
      { name: 'Tier',      value: '💀 SS',                         inline: true },
      { name: 'Technique', value: bDomain.technique,               inline: true },
      { name: 'RCT',       value: '✅ Always active',              inline: true },
    )
    .setAuthor({ name: botUser.username, iconURL: botUser.displayAvatarURL() })
    .setThumbnail(bDomain.thumbnail);

  await channel.send({ embeds: [cEmbed, bEmbed] });
  await pause(2000);

  // Word challenge
  const words   = shuffle(CURSED_WORDS).slice(0, 7);
  const scores  = { player: 0, bot: 0 };
  const matched = new Set();

  const wordEmbed = new EmbedBuilder()
    .setColor(0xcba6f7)
    .setTitle('🧠 CURSED ENERGY OUTPUT TEST')
    .setDescription(
      'Type as many words as possible in **30 seconds**.\n' +
      '*Tethys Computation is calculating in parallel...*\n\n' +
      '```\n' + words.join('   ') + '\n```\n' +
      '⏳ **GO.**'
    );

  await channel.send({ embeds: [wordEmbed] });

  // Bot "types" words after random delays within the 30s window
  const botWordCount  = randInt(diff.min, diff.max);
  const botWords      = shuffle([...words]).slice(0, botWordCount);
  const botTypeTimers = [];

  for (const word of botWords) {
    const delay = randInt(3000, 27000);
    const t = setTimeout(async () => {
      // Bot posts a subtle computation message mid-challenge
      await channel.send({
        content: '`[Tethys Computation]: processing ' + word + '... indexed.`',
      }).catch(() => {});
      scores.bot++;
    }, delay);
    botTypeTimers.push(t);
  }

  // Collect player messages
  const filter    = m => m.author.id === challenger.id && !m.author.bot;
  const collector = channel.createMessageCollector({ filter, time: 30_000 });

  collector.on('collect', m => {
    const typed = m.content.toLowerCase().trim().split(/\s+/);
    for (const w of typed) {
      if (words.includes(w) && !matched.has(w)) {
        matched.add(w);
        scores.player++;
      }
    }
  });

  await new Promise(r => collector.once('end', r));
  botTypeTimers.forEach(t => clearTimeout(t));

  // RCT rolls
  const rctBonus = { player: 0, bot: 0 };
  if (cDomain.rct && Math.random() < 0.3) rctBonus.player = 10;
  // Tethys RCT always has 60% chance (it's always active)
  if (Math.random() < 0.6) rctBonus.bot = 10;

  // Tier bonus
  const tierBonus = { C: 0, B: 5, A: 10, S: 18, SS: 28 };

  const pWeight = 10 + scores.player * 15 + (tierBonus[cDomain.tier] ?? 0) + rctBonus.player;
  const bWeight = 10 + scores.bot    * 15 + tierBonus.SS + diff.tierBonus  + rctBonus.bot;
  const total   = pWeight + bWeight;
  const roll    = Math.random() * total;
  const playerWon = roll < pWeight;
  const pPct    = Math.round(pWeight / total * 100);

  await pause(1500);

  // Score breakdown
  const rctNotes = [];
  if (rctBonus.player) rctNotes.push(challenger.username + '\'s RCT activated (+10)');
  if (rctBonus.bot)    rctNotes.push('Tethys RCT pulsed (+10)');

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x45475a)
        .setTitle('📊 Output Analysis')
        .addFields(
          {
            name:  challenger.username + ' — ' + cDomain.name,
            value: 'Words: **' + scores.player + '/7** · Tier: +' + (tierBonus[cDomain.tier] ?? 0) +
                   (rctBonus.player ? ' · RCT: +10' : '') +
                   '\nWeight: **' + pWeight + '** (' + pPct + '% win chance)',
            inline: true,
          },
          {
            name:  'Tethys Computation',
            value: 'Words: **' + scores.bot + '/7** · Tier: +' + tierBonus.SS +
                   ' · Diff: +' + diff.tierBonus +
                   (rctBonus.bot ? ' · RCT: +10' : '') +
                   '\nWeight: **' + bWeight + '** (' + (100 - pPct) + '% win chance)',
            inline: true,
          },
        )
        .setFooter({ text: rctNotes.length ? '⚡ ' + rctNotes.join(' · ') : 'No RCT activations' }),
    ],
  });

  await pause(2000);

  // Narration
  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x1e1e2e)
        .setTitle('⚔️ THE COMPUTATION RESOLVES')
        .setDescription(
          '**' + pick(NARRATION) + '**\n\n' +
          '**' + pick(TETHYS_NARRATION) + '**\n\n' +
          '*The barrier shudders. One technique overwrites the other.*'
        ),
    ],
  });
  await pause(2500);

  // Result
  if (playerWon) {
    const resultEmbed = new EmbedBuilder()
      .setColor(parseColor(cDomain.color))
      .setTitle('💀 ' + cDomain.name.toUpperCase() + ' OVERWRITES THE COMPUTATION')
      .setDescription(
        '<@' + challenger.id + '> **defeats Tethys Computation.**\n\n' +
        pick(WIN_LINES) + '\n\n' +
        pick(TETHYS_LOSE_LINES) + '\n\n' +
        '**Win probability was ' + pPct + '%**'
      )
      .setTimestamp();
    if (cDomain.thumbnail) resultEmbed.setThumbnail(cDomain.thumbnail);
    await channel.send({ embeds: [resultEmbed] });

    if (cDomain.victoryAnim) {
      await pause(800);
      await channel.send({ content: '🏆 **' + challenger.username + '\'s victory:**\n' + cDomain.victoryAnim });
    }

    store.recordWin(challenger.id, cDomain.id);

    // Tier-up check
    const oldTier = cDomain.tier;
    const updated = store.getActiveDomain(challenger.id);
    if (updated && updated.tier !== oldTier) {
      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(store.TIER_COLOR[updated.tier])
            .setTitle('⬆️ TIER UP!')
            .setDescription(
              '<@' + challenger.id + '>\'s **' + updated.name + '** rose from ' +
              store.TIER_EMOJI[oldTier] + ' **' + oldTier + '** to ' +
              store.TIER_EMOJI[updated.tier] + ' **' + updated.tier + '**!'
            ),
        ],
      });
    }

  } else {
    const resultEmbed = new EmbedBuilder()
      .setColor(0x89dceb)
      .setTitle('💻 TETHYS COMPUTATION PREVAILS')
      .setDescription(
        '**Tethys System** wins.\n\n' +
        pick(TETHYS_WIN_LINES) + '\n\n' +
        '*<@' + challenger.id + '>\'s **' + cDomain.name + '** crumbles.*\n' +
        pick(LOSE_LINES) + '\n\n' +
        '**Your win probability was ' + pPct + '%**'
      )
      .setThumbnail(bDomain.thumbnail)
      .setTimestamp();
    await channel.send({ embeds: [resultEmbed] });

    store.recordLoss(challenger.id, cDomain.id);
  }
}

// ── PvP clash ──────────────────────────────────────────────────
async function runClash(channel, challenger, opponent, cDomain, oDomain) {

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x11111b)
        .setTitle('⚡ DOMAIN CLASH')
        .setDescription(
          '<@' + challenger.id + '> has challenged <@' + opponent.id + '> to a **Domain Expansion clash**.\n\n' +
          '**' + cDomain.name + '** ' + store.TIER_EMOJI[cDomain.tier] + cDomain.tier +
          (cDomain.rct ? ' *(RCT)*' : '') +
          '  vs  ' +
          '**' + oDomain.name + '** ' + store.TIER_EMOJI[oDomain.tier] + oDomain.tier +
          (oDomain.rct ? ' *(RCT)*' : '') +
          '\n\n*The barriers rise...*'
        )
        .setTimestamp(),
    ],
  });
  await pause(2000);

  await channel.send({ embeds: [pick(NARRATION), pick(NARRATION)].map(line =>
    new EmbedBuilder().setColor(0x1e1e2e).setDescription('*' + line + '*')
  )});
  await pause(1500);

  const cEmbed = new EmbedBuilder()
    .setColor(parseColor(cDomain.color))
    .setTitle('⚡ ' + cDomain.name.toUpperCase())
    .setDescription(cDomain.description || '*No description.*')
    .addFields(
      { name: 'Tier',      value: store.TIER_EMOJI[cDomain.tier] + ' ' + cDomain.tier, inline: true },
      { name: 'Technique', value: cDomain.technique,                                    inline: true },
      { name: 'RCT',       value: cDomain.rct ? '✅' : '❌',                            inline: true },
    )
    .setAuthor({ name: challenger.username, iconURL: challenger.displayAvatarURL() });
  if (cDomain.thumbnail) cEmbed.setThumbnail(cDomain.thumbnail);

  const oEmbed = new EmbedBuilder()
    .setColor(parseColor(oDomain.color))
    .setTitle('⚡ ' + oDomain.name.toUpperCase())
    .setDescription(oDomain.description || '*No description.*')
    .addFields(
      { name: 'Tier',      value: store.TIER_EMOJI[oDomain.tier] + ' ' + oDomain.tier, inline: true },
      { name: 'Technique', value: oDomain.technique,                                    inline: true },
      { name: 'RCT',       value: oDomain.rct ? '✅' : '❌',                            inline: true },
    )
    .setAuthor({ name: opponent.username, iconURL: opponent.displayAvatarURL() });
  if (oDomain.thumbnail) oEmbed.setThumbnail(oDomain.thumbnail);

  await channel.send({ embeds: [cEmbed, oEmbed] });
  await pause(2000);

  const words   = shuffle(CURSED_WORDS).slice(0, 7);
  const scores  = { [challenger.id]: 0, [opponent.id]: 0 };
  const matched = { [challenger.id]: new Set(), [opponent.id]: new Set() };

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0xcba6f7)
        .setTitle('🧠 CURSED ENERGY OUTPUT TEST')
        .setDescription(
          'Type as many of these words as possible in **30 seconds**.\n' +
          'More correct = higher win chance.\n\n' +
          '```\n' + words.join('   ') + '\n```\n' +
          '⏳ **GO.**'
        ),
    ],
  });

  const filter    = m => [challenger.id, opponent.id].includes(m.author.id) && !m.author.bot;
  const collector = channel.createMessageCollector({ filter, time: 30_000 });

  collector.on('collect', m => {
    const uid   = m.author.id;
    const typed = m.content.toLowerCase().trim().split(/\s+/);
    for (const w of typed) {
      if (words.includes(w) && !matched[uid].has(w)) {
        matched[uid].add(w);
        scores[uid]++;
      }
    }
  });

  await new Promise(r => collector.once('end', r));

  const rctBonus = { [challenger.id]: 0, [opponent.id]: 0 };
  if (cDomain.rct && Math.random() < 0.3) rctBonus[challenger.id] = 10;
  if (oDomain.rct && Math.random() < 0.3) rctBonus[opponent.id]   = 10;

  const tierBonus = { C: 0, B: 5, A: 10, S: 18, SS: 28 };
  const cWeight   = 10 + scores[challenger.id] * 15 + (tierBonus[cDomain.tier] ?? 0) + rctBonus[challenger.id];
  const oWeight   = 10 + scores[opponent.id]   * 15 + (tierBonus[oDomain.tier] ?? 0) + rctBonus[opponent.id];
  const total     = cWeight + oWeight;
  const roll      = Math.random() * total;
  const [winner, loser, wDomain, lDomain] = roll < cWeight
    ? [challenger, opponent, cDomain, oDomain]
    : [opponent, challenger, oDomain, cDomain];

  const wPct = Math.round((roll < cWeight ? cWeight : oWeight) / total * 100);

  await pause(1500);

  const rctLines = [];
  if (rctBonus[challenger.id]) rctLines.push(challenger.username + '\'s RCT activated (+10)');
  if (rctBonus[opponent.id])   rctLines.push(opponent.username + '\'s RCT activated (+10)');

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x45475a)
        .setTitle('📊 Cursed Energy Output')
        .addFields(
          {
            name:  challenger.username + ' — ' + cDomain.name,
            value: 'Words: **' + scores[challenger.id] + '/7** · Tier: +' + (tierBonus[cDomain.tier] ?? 0) +
                   (rctBonus[challenger.id] ? ' · RCT: +10' : '') +
                   '\nWeight: **' + cWeight + '**',
            inline: true,
          },
          {
            name:  opponent.username + ' — ' + oDomain.name,
            value: 'Words: **' + scores[opponent.id] + '/7** · Tier: +' + (tierBonus[oDomain.tier] ?? 0) +
                   (rctBonus[opponent.id] ? ' · RCT: +10' : '') +
                   '\nWeight: **' + oWeight + '**',
            inline: true,
          },
        )
        .setFooter({ text: rctLines.length ? '⚡ ' + rctLines.join(' · ') : '' }),
    ],
  });

  await pause(2000);

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x1e1e2e)
        .setTitle('⚔️ THE DOMAINS COLLAPSE')
        .setDescription('**' + pick(NARRATION) + '**\n\n**' + pick(NARRATION) + '**\n\n*The barrier shatters. One technique overwrites the other.*'),
    ],
  });
  await pause(2500);

  const resultEmbed = new EmbedBuilder()
    .setColor(parseColor(wDomain.color))
    .setTitle('💀 ' + wDomain.name.toUpperCase() + ' PREVAILS')
    .setDescription(
      '<@' + winner.id + '> **wins the Domain Clash.**\n\n' +
      pick(WIN_LINES) + '\n\n' +
      '*<@' + loser.id + '>\'s **' + lDomain.name + '** crumbles.*\n' +
      pick(LOSE_LINES) + '\n\n' +
      '**Win probability: ' + wPct + '%**'
    )
    .addFields(
      { name: 'Winner', value: store.TIER_EMOJI[wDomain.tier] + ' ' + wDomain.tier + ' — ' + wDomain.name, inline: true },
      { name: 'Loser',  value: store.TIER_EMOJI[lDomain.tier] + ' ' + lDomain.tier + ' — ' + lDomain.name, inline: true },
    )
    .setTimestamp();
  if (wDomain.thumbnail) resultEmbed.setThumbnail(wDomain.thumbnail);

  await channel.send({ embeds: [resultEmbed] });

  if (wDomain.victoryAnim) {
    await pause(800);
    await channel.send({ content: '🏆 **' + winner.username + '\'s victory:**\n' + wDomain.victoryAnim });
  }

  store.recordWin(winner.id, wDomain.id);
  store.recordLoss(loser.id, lDomain.id);

  const oldTier = wDomain.tier;
  const updated = store.getActiveDomain(winner.id);
  if (updated && updated.tier !== oldTier) {
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(store.TIER_COLOR[updated.tier])
          .setTitle('⬆️ TIER UP!')
          .setDescription(
            '<@' + winner.id + '>\'s **' + updated.name + '** rose from ' +
            store.TIER_EMOJI[oldTier] + ' **' + oldTier + '** to ' +
            store.TIER_EMOJI[updated.tier] + ' **' + updated.tier + '**!'
          ),
      ],
    });
  }
}