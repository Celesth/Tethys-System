/**
 * domainPrefix.js — Prefix commands for domain management
 *
 * Commands (prefix: >):
 *   >domaincreate  — opens a button → modal to create a new domain
 *   >domainlist    — shows all your domains, select menu to set active
 *   >domainview [@user] — view active domain card of you or someone else
 *   >domaindelete  — list with delete buttons
 *
 * Wire handleMessage() into your messageCreate event in index.js.
 * Wire handleComponent() into your interactionCreate event.
 */

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
} = require('discord.js');

const store = require('../../utils/domainStore');

const PREFIX = '>';

// Pending modal session: userId → 'create'
const pendingModal = new Map();

// ── Helpers ───────────────────────────────────────────────────
function parseColor(str) {
  if (!str || !str.trim()) return 0x89b4fa;
  const hex = parseInt(str.replace('#', ''), 16);
  return isNaN(hex) ? 0x89b4fa : hex;
}

function nextTierInfo(domain) {
  const thresholds = { C: 3, B: 7, A: 15, S: 25, SS: null };
  const next = thresholds[domain.tier];
  if (!next) return '*Maximum tier reached*';
  return `**${next - domain.wins}** more wins to next tier`;
}

function buildDomainEmbed(domain, user, isActive) {
  const embed = new EmbedBuilder()
    .setColor(parseColor(domain.color))
    .setTitle('⚡ ' + domain.name + (isActive ? '  *(active)*' : ''))
    .setDescription(domain.description || '*No technique description.*')
    .addFields(
      { name: 'Tier',             value: store.TIER_EMOJI[domain.tier] + ' **' + domain.tier + '**', inline: true },
      { name: 'Technique',        value: domain.technique,                                            inline: true },
      { name: 'RCT',              value: domain.rct ? '✅ Unlocked' : '❌ Not unlocked',              inline: true },
      { name: 'Record',           value: domain.wins + 'W / ' + domain.losses + 'L',                 inline: true },
      { name: 'Progress',         value: nextTierInfo(domain),                                        inline: true },
    )
    .setFooter({ text: 'ID: ' + domain.id + ' · ' + new Date(domain.createdAt).toLocaleDateString() });

  if (user)             embed.setAuthor({ name: user.username, iconURL: user.displayAvatarURL() });
  if (domain.thumbnail) embed.setThumbnail(domain.thumbnail);

  return embed;
}

// ── >domaincreate ─────────────────────────────────────────────
async function handleCreate(message) {
  pendingModal.set(message.author.id, 'create');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('dp:create:' + message.author.id)
      .setLabel('Open Domain Creator')
      .setEmoji('⚡')
      .setStyle(ButtonStyle.Danger),
  );

  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x1e1e2e)
        .setTitle('⚡ Domain Creation')
        .setDescription(
          'Click the button below to open the **Domain Creator**.\n\n' +
          '> Name, description, color, thumbnail, victory animation URL, technique type.\n' +
          '> **Reverse Cursed Technique** is randomly assigned (30% chance).\n' +
          '> Domains start at ⚪ **C-Tier** and rise with wins:\n' +
          '> C → B (3W) → A (7W) → S (15W) → SS (25W)'
        ),
    ],
    components: [row],
  });
}

// ── >domainlist ───────────────────────────────────────────────
async function handleList(message) {
  const domains   = store.getDomains(message.author.id);
  const userData  = store.getUser(message.author.id);

  if (!domains.length) {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x45475a)
          .setDescription('You have no domains yet. Use `>domaincreate` to make one.'),
      ],
    });
  }

  const embeds = domains.slice(0, 10).map((d, i) =>
    buildDomainEmbed(d, message.author, i === userData.activeIndex)
  );

  const options = domains.slice(0, 25).map((d, i) => ({
    label:   d.name.slice(0, 100),
    description: store.TIER_EMOJI[d.tier] + ' ' + d.tier + '-Tier · ' + d.wins + 'W ' + d.losses + 'L',
    value:   String(i),
    default: i === userData.activeIndex,
  }));

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('dp:setactive:' + message.author.id)
      .setPlaceholder('Set active domain for clashes…')
      .addOptions(options),
  );

  await message.reply({ embeds, components: [row] });
}

// ── >domainview ───────────────────────────────────────────────
async function handleView(message) {
  const target = message.mentions.users.first() ?? message.author;
  const domain = store.getActiveDomain(target.id);

  if (!domain) {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x45475a)
          .setDescription(
            (target.id === message.author.id
              ? 'You have'
              : target.username + ' has') +
            ' no active domain. Use `>domaincreate` to make one.'
          ),
      ],
    });
  }

  await message.reply({ embeds: [buildDomainEmbed(domain, target, true)] });
}

// ── >domaindelete ─────────────────────────────────────────────
async function handleDelete(message) {
  const domains = store.getDomains(message.author.id);

  if (!domains.length) {
    return message.reply({
      embeds: [
        new EmbedBuilder().setColor(0x45475a).setDescription('You have no domains to delete.'),
      ],
    });
  }

  const rows = [];
  // Up to 5 buttons per row, max 5 rows = 25 domains
  for (let i = 0; i < Math.min(domains.length, 25); i += 5) {
    const row = new ActionRowBuilder();
    for (let j = i; j < Math.min(i + 5, domains.length); j++) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('dp:delete:' + message.author.id + ':' + domains[j].id)
          .setLabel(domains[j].name.slice(0, 20))
          .setStyle(ButtonStyle.Danger),
      );
    }
    rows.push(row);
  }

  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xf38ba8)
        .setTitle('🗑️ Delete a Domain')
        .setDescription('Click the button for the domain you want to permanently delete.'),
    ],
    components: rows,
  });
}

// ── messageCreate router ──────────────────────────────────────
async function handleMessage(message) {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args    = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const cmd     = args[0].toLowerCase();

  try {
    if (cmd === 'domaincreate')  return await handleCreate(message);
    if (cmd === 'domainlist')    return await handleList(message);
    if (cmd === 'domainview')    return await handleView(message);
    if (cmd === 'domaindelete')  return await handleDelete(message);
  } catch (err) {
    console.error('[domainPrefix]', cmd, err);
    message.reply('❌ Something went wrong: ' + err.message).catch(() => {});
  }
}

// ── interactionCreate router ──────────────────────────────────
async function handleComponent(interaction) {

  // ── Open domain creator modal ─────────────────────────────
  if (interaction.isButton() && interaction.customId.startsWith('dp:create:')) {
    const userId = interaction.customId.split(':')[2];

    if (interaction.user.id !== userId) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0xf38ba8).setDescription('❌ This button is not for you.')],
        flags: 64,
      });
    }

    const modal = new ModalBuilder()
      .setCustomId('dp:modal:' + userId)
      .setTitle('⚡ Create Your Domain');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('name')
          .setLabel('Domain Name')
          .setPlaceholder('e.g. Malevolent Shrine')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(50)
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('description')
          .setLabel('Cursed Technique / Description')
          .setPlaceholder('Describe your domain\'s sure-hit technique...')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(300)
          .setRequired(false),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('technique')
          .setLabel('Technique Type')
          .setPlaceholder('Binding Vow / Barrier / CT Reversal / Innate')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(30)
          .setRequired(false),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('color')
          .setLabel('Accent Color (hex e.g. #f38ba8)')
          .setPlaceholder('#89b4fa')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(7)
          .setRequired(false),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('urls')
          .setLabel('Thumbnail URL  |  Victory Animation URL')
          .setPlaceholder('thumbnail: https://...  |  victory: https://...')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(600)
          .setRequired(false),
      ),
    );

    return interaction.showModal(modal);
  }

  // ── Modal submitted ───────────────────────────────────────
  if (interaction.isModalSubmit() && interaction.customId.startsWith('dp:modal:')) {
    const userId = interaction.customId.split(':')[2];

    if (interaction.user.id !== userId) return;

    const name        = interaction.fields.getTextInputValue('name').trim();
    const description = interaction.fields.getTextInputValue('description').trim();
    const technique   = interaction.fields.getTextInputValue('technique').trim() || 'Innate';
    const color       = interaction.fields.getTextInputValue('color').trim();

    // Parse combined url field: "thumbnail: <url>  |  victory: <url>"
    const urlRaw      = interaction.fields.getTextInputValue('urls').trim();
    let thumbnail  = '';
    let victoryAnim = '';

    const thumbMatch   = urlRaw.match(/thumbnail:\s*(https?:\/\/\S+)/i);
    const victoryMatch = urlRaw.match(/victory:\s*(https?:\/\/\S+)/i);
    if (thumbMatch)   thumbnail   = thumbMatch[1];
    if (victoryMatch) victoryAnim = victoryMatch[1];

    // Fallback: if no labels, treat first URL as thumbnail, second as victory
    if (!thumbnail && !victoryAnim) {
      const urls = urlRaw.match(/https?:\/\/\S+/g) ?? [];
      thumbnail   = urls[0] ?? '';
      victoryAnim = urls[1] ?? '';
    }

    const domain = store.createDomain(userId, { name, description, color, thumbnail, victoryAnim, technique });

    const embed = new EmbedBuilder()
      .setColor(parseColor(color))
      .setTitle('⚡ ' + domain.name + ' — Domain Created!')
      .setDescription(domain.description || '*No description.*')
      .addFields(
        { name: 'Tier',      value: '⚪ **C** *(starting tier)*',                         inline: true },
        { name: 'Technique', value: domain.technique,                                       inline: true },
        { name: 'RCT',       value: domain.rct ? '✅ Unlocked! (30% chance — lucky)' : '❌ Not unlocked (30% chance on creation)', inline: false },
        { name: 'Victory Animation', value: victoryAnim ? '[Link](' + victoryAnim + ')' : '*None set*', inline: true },
      )
      .setFooter({ text: 'Use >domainlist to manage your domains · ID: ' + domain.id });

    if (thumbnail) embed.setThumbnail(thumbnail);

    return interaction.reply({ embeds: [embed], flags: 64 });
  }

  // ── Set active domain ─────────────────────────────────────
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('dp:setactive:')) {
    const userId = interaction.customId.split(':')[2];

    if (interaction.user.id !== userId) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0xf38ba8).setDescription('❌ These are not your domains.')],
        flags: 64,
      });
    }

    const index  = parseInt(interaction.values[0]);
    const ok     = store.setActive(userId, index);
    const domain = store.getDomains(userId)[index];

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(ok ? parseColor(domain?.color) : 0xf38ba8)
          .setDescription(ok
            ? '✅ Active domain set to **' + (domain?.name ?? '?') + '**. This will be used in all clashes.'
            : '❌ Failed to set active domain.'
          ),
      ],
      flags: 64,
    });
  }

  // ── Delete a domain ───────────────────────────────────────
  if (interaction.isButton() && interaction.customId.startsWith('dp:delete:')) {
    const parts    = interaction.customId.split(':');
    const userId   = parts[2];
    const domainId = parts[3];

    if (interaction.user.id !== userId) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0xf38ba8).setDescription('❌ These are not your domains.')],
        flags: 64,
      });
    }

    const domains = store.getDomains(userId);
    const domain  = domains.find(d => d.id === domainId);
    const ok      = store.deleteDomain(userId, domainId);

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(ok ? 0xa6e3a1 : 0xf38ba8)
          .setDescription(ok
            ? '🗑️ **' + (domain?.name ?? 'Domain') + '** has been deleted.'
            : '❌ Domain not found.'
          ),
      ],
      flags: 64,
    });
  }
}

module.exports = { handleMessage, handleComponent };