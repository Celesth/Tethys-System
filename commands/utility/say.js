const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} = require('discord.js');

// Channel types the bot can send to (no voice, stage, category)
const SENDABLE = new Set([
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.PublicThread,
    ChannelType.PrivateThread,
    ChannelType.AnnouncementThread,
    ChannelType.GuildForum,       // sends as a new post
    ChannelType.GuildMedia,       // sends as a new post
]);

// Named colour presets (hex without #)
const COLORS = {
    default:  0x89b4fa,   // catppuccin blue
        red:      0xf38ba8,
        green:    0xa6e3a1,
        yellow:   0xf9e2af,
        purple:   0xcba6f7,
        pink:     0xf5c2e7,
        teal:     0x94e2d5,
        orange:   0xfab387,
        white:    0xcdd6f4,
        black:    0x11111b,
};

// ── Session store — keeps embed data in memory, customId = short key ─
// Discord limits customId to 100 chars — we store data server-side instead.
// Keys expire after 30 min to avoid unbounded memory growth.
const sayStore  = new Map(); // key → { data, expiresAt }
const SESSION_TTL = 30 * 60 * 1000; // 30 minutes

function genKey() {
    return 'say_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function storeData(data) {
    const key = genKey();
    sayStore.set(key, { data, expiresAt: Date.now() + SESSION_TTL });
    // Prune expired entries while we're here
    for (const [k, v] of sayStore) {
        if (Date.now() > v.expiresAt) sayStore.delete(k);
    }
    return key; // always <= ~20 chars — well under Discord's 100-char limit
}

function packData(data) {
    const key = storeData(data);
    return `say:${key}`; // e.g. "say:say_lxk3m2a8f"
}

function unpackData(customId) {
    const key    = customId.slice(4); // strip "say:"
    const entry  = sayStore.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { sayStore.delete(key); return null; }
    return entry.data;
}

// Update stored data in-place (used after modal edits)
function updateStored(customId, patch) {
    const key   = customId.slice(4);
    const entry = sayStore.get(key);
    if (!entry) return packData(patch); // fallback: store fresh
    entry.data = { ...entry.data, ...patch };
    entry.expiresAt = Date.now() + SESSION_TTL; // refresh TTL
    return customId; // same key, data updated in place
}

// ── Build EmbedBuilder from plain options object ───────────────
function buildEmbed(opts) {
    const embed = new EmbedBuilder();

    // Treat empty strings same as missing — never pass '' to Discord
    const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

    if (str(opts.title))       embed.setTitle(str(opts.title).slice(0, 256));
    if (str(opts.description)) embed.setDescription(str(opts.description).slice(0, 4096));
    if (str(opts.url))         { try { embed.setURL(str(opts.url)); } catch {} }
    if (str(opts.image_url))   { try { embed.setImage(str(opts.image_url)); } catch {} }
    if (str(opts.thumbnail))   { try { embed.setThumbnail(str(opts.thumbnail)); } catch {} }
    if (str(opts.footer))      embed.setFooter({ text: str(opts.footer).slice(0, 2048) });
    if (str(opts.author))      embed.setAuthor({ name: str(opts.author).slice(0, 256) });

    // Colour — named preset or raw hex (#rrggbb / rrggbb)
    const rawColor = str(opts.color) ?? 'default';
    const preset   = COLORS[rawColor.toLowerCase()];
    if (preset !== undefined) {
        embed.setColor(preset);
    } else {
        const hex = parseInt(rawColor.replace('#', ''), 16);
        if (!isNaN(hex)) embed.setColor(hex);
    }

    embed.setTimestamp(opts.show_timestamp ? new Date() : null);

    return embed;
}

// ── Resolve target channel / create forum post ─────────────────
async function sendToTarget(channel, content, embed) {
    // Forum / Media channels need a thread (new post)
    if (channel.type === ChannelType.GuildForum || channel.type === ChannelType.GuildMedia) {
        const title = embed.data?.title || content?.slice(0, 100) || 'Announcement';
        return channel.threads.create({
            name:    title.slice(0, 100),
                                      message: { content: content || null, embeds: [embed] },
        });
    }
    return channel.send({ content: content || null, embeds: [embed] });
}

module.exports = {
    data: new SlashCommandBuilder()
    .setName('say')
    .setDescription('Send a message or rich embed as the bot to any channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)

    // ── Required ──────────────────────────────────────────────
    .addChannelOption(opt =>
    opt.setName('channel')
    .setDescription('Target channel (text, announcement, forum, thread — no voice)')
    .setRequired(true)
    .addChannelTypes(
        ChannelType.GuildText,
        ChannelType.GuildAnnouncement,
        ChannelType.PublicThread,
        ChannelType.PrivateThread,
        ChannelType.AnnouncementThread,
        ChannelType.GuildForum,
        ChannelType.GuildMedia,
    ))

    // ── Embed fields ──────────────────────────────────────────
    .addStringOption(opt =>
    opt.setName('title')
    .setDescription('Embed title (max 256 chars)')
    .setRequired(false))

    .addStringOption(opt =>
    opt.setName('description')
    .setDescription('Embed body text — use \\n for new lines (max 4096 chars)')
    .setRequired(false))

    .addStringOption(opt =>
    opt.setName('content')
    .setDescription('Plain text above the embed (e.g. @mentions, short note)')
    .setRequired(false))

    .addStringOption(opt =>
    opt.setName('color')
    .setDescription('Accent colour: default | red | green | yellow | purple | pink | teal | orange | #rrggbb')
    .setRequired(false))

    .addStringOption(opt =>
    opt.setName('image_url')
    .setDescription('Large image URL displayed inside the embed')
    .setRequired(false))

    .addStringOption(opt =>
    opt.setName('thumbnail')
    .setDescription('Small thumbnail URL shown top-right of the embed')
    .setRequired(false))

    .addStringOption(opt =>
    opt.setName('url')
    .setDescription('URL to hyperlink the embed title')
    .setRequired(false))

    .addStringOption(opt =>
    opt.setName('footer')
    .setDescription('Footer text at the bottom of the embed')
    .setRequired(false))

    .addStringOption(opt =>
    opt.setName('author')
    .setDescription('Author name shown above the title')
    .setRequired(false))

    .addBooleanOption(opt =>
    opt.setName('show_timestamp')
    .setDescription('Show current timestamp in the embed footer (default: false)')
    .setRequired(false))

    .addBooleanOption(opt =>
    opt.setName('preview')
    .setDescription('Show a private preview before sending (default: true)')
    .setRequired(false)),

    // ── /say executed ─────────────────────────────────────────────
    async execute(interaction) {
        const channel        = interaction.options.getChannel('channel');
        const showPreview    = interaction.options.getBoolean('preview') ?? true;

        // Sanity check — channel must be sendable
        if (!SENDABLE.has(channel.type)) {
            return interaction.reply({
                content: `❌ Cannot send to **${channel.name}** — voice, stage, and category channels aren't supported.`,
                flags: 64, // ephemeral
            });
        }

        // Check bot has SEND_MESSAGES permission in target
        const me = interaction.guild.members.me;
        const perms = channel.permissionsFor(me);
        const needsSend = channel.type === ChannelType.GuildForum || channel.type === ChannelType.GuildMedia
        ? perms?.has(PermissionFlagsBits.SendMessages) && perms?.has(PermissionFlagsBits.CreatePublicThreads)
        : perms?.has(PermissionFlagsBits.SendMessages);

        if (!needsSend) {
            return interaction.reply({
                content: `❌ I don't have permission to send messages in <#${channel.id}>.`,
                flags: 64,
            });
        }

        // Collect embed options
        const opts = {
            title:          interaction.options.getString('title')          ?? '',
            description:    interaction.options.getString('description')    ?? '',
            content:        interaction.options.getString('content')        ?? '',
            color:          interaction.options.getString('color')          ?? 'default',
            image_url:      interaction.options.getString('image_url')      ?? '',
            thumbnail:      interaction.options.getString('thumbnail')      ?? '',
            url:            interaction.options.getString('url')            ?? '',
            footer:         interaction.options.getString('footer')         ?? '',
            author:         interaction.options.getString('author')         ?? '',
            show_timestamp: interaction.options.getBoolean('show_timestamp') ?? false,
            channelId:      channel.id,
        };

        // Require at least one of: title, description, content, image
        if (!opts.title && !opts.description && !opts.content && !opts.image_url) {
            return interaction.reply({
                content: '❌ Provide at least one of: `title`, `description`, `content`, or `image_url`.',
                flags: 64,
            });
        }

        const embed = buildEmbed(opts);

        // ── No preview — send immediately ─────────────────────────
        if (!showPreview) {
            await interaction.deferReply({ flags: 64 });
            try {
                const sent = await sendToTarget(channel, opts.content || null, embed);
                const link = sent.url ?? `https://discord.com/channels/${interaction.guildId}/${channel.id}`;
                return interaction.editReply(`✅ Sent to <#${channel.id}> → [jump](${link})`);
            } catch (err) {
                return interaction.editReply(`❌ Failed to send: ${err.message}`);
            }
        }

        // ── Preview mode — show embed + confirm / edit / cancel ───
        await interaction.reply({
            content: `**Preview** → will send to <#${channel.id}>\n${opts.content ? `*Plain text:* ${opts.content}` : ''}`,
            embeds: [embed],
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                    .setCustomId(packData({ action: 'send',   ...opts }))
                    .setLabel('Send')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('📨'),
                                                     new ButtonBuilder()
                                                     .setCustomId(packData({ action: 'edit',   ...opts }))
                                                     .setLabel('Edit description')
                                                     .setStyle(ButtonStyle.Secondary)
                                                     .setEmoji('✏️'),
                                                     new ButtonBuilder()
                                                     .setCustomId(packData({ action: 'cancel', ...opts }))
                                                     .setLabel('Cancel')
                                                     .setStyle(ButtonStyle.Danger)
                                                     .setEmoji('🗑️'),
                ),
            ],
            flags: 64, // ephemeral preview
        });
    },

    // ── Button / Modal handler — call from interactionCreate.js ──
    async handleComponent(interaction) {
        // ── Buttons ───────────────────────────────────────────────
        if (interaction.isButton()) {
            const data = unpackData(interaction.customId);
            if (!data) return;

            if (data.action === 'cancel') {
                return interaction.update({ content: '❌ Cancelled.', embeds: [], components: [] });
            }

            if (data.action === 'edit') {
                // Open a modal pre-filled with current description
                const modal = new ModalBuilder()
                .setCustomId(packData({ action: 'modal_submit', ...data }))
                .setTitle('Edit embed description');

                const descInput = new TextInputBuilder()
                .setCustomId('description')
                .setLabel('Description (supports markdown)')
                .setStyle(TextInputStyle.Paragraph)
                .setValue(data.description ?? '')
                .setRequired(false)
                .setMaxLength(4000);

                const titleInput = new TextInputBuilder()
                .setCustomId('title')
                .setLabel('Title')
                .setStyle(TextInputStyle.Short)
                .setValue(data.title ?? '')
                .setRequired(false)
                .setMaxLength(256);

                const footerInput = new TextInputBuilder()
                .setCustomId('footer')
                .setLabel('Footer text')
                .setStyle(TextInputStyle.Short)
                .setValue(data.footer ?? '')
                .setRequired(false)
                .setMaxLength(2048);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(titleInput),
                                    new ActionRowBuilder().addComponents(descInput),
                                    new ActionRowBuilder().addComponents(footerInput),
                );

                return interaction.showModal(modal);
            }

            if (data.action === 'send') {
                const channel = interaction.guild.channels.cache.get(data.channelId);
                if (!channel) return interaction.update({ content: '❌ Channel not found.', embeds: [], components: [] });

                const embed = buildEmbed(data);
                try {
                    const sent = await sendToTarget(channel, data.content || null, embed);
                    const link = sent.url ?? `https://discord.com/channels/${interaction.guildId}/${channel.id}`;
                    return interaction.update({
                        content: `✅ Sent to <#${channel.id}> → [jump](${link})`,
                                              embeds:  [],
                                              components: [],
                    });
                } catch (err) {
                    return interaction.update({ content: `❌ Failed: ${err.message}`, embeds: [], components: [] });
                }
            }
        }

        // ── Modal submit (after "Edit description") ────────────────
        if (interaction.isModalSubmit()) {
            const data = unpackData(interaction.customId);
            if (!data || data.action !== 'modal_submit') return;

            // Merge modal values back into opts
            const updated = {
                ...data,
                title:       interaction.fields.getTextInputValue('title')       || data.title,
                description: interaction.fields.getTextInputValue('description') || '',
                footer:      interaction.fields.getTextInputValue('footer')      || '',
                action:      'send', // next button click = send
            };

            const embed   = buildEmbed(updated);
            const channel = interaction.guild.channels.cache.get(updated.channelId);
            const chName  = channel ? `<#${channel.id}>` : 'unknown channel';

            return interaction.update({
                content: `**Updated preview** → will send to ${chName}\n${updated.content ? `*Plain text:* ${updated.content}` : ''}`,
                embeds:  [embed],
                components: [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                        .setCustomId(packData({ ...updated, action: 'send' }))
                        .setLabel('Send')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('📨'),
                                                         new ButtonBuilder()
                                                         .setCustomId(packData({ ...updated, action: 'edit' }))
                                                         .setLabel('Edit again')
                                                         .setStyle(ButtonStyle.Secondary)
                                                         .setEmoji('✏️'),
                                                         new ButtonBuilder()
                                                         .setCustomId(packData({ ...updated, action: 'cancel' }))
                                                         .setLabel('Cancel')
                                                         .setStyle(ButtonStyle.Danger)
                                                         .setEmoji('🗑️'),
                    ),
                ], // Note: packData stores data server-side, customId is always a short key
            });
        }
    },
};
