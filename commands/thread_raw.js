const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    MessageFlags,
    AttachmentBuilder,
    ChannelType,
} = require('discord.js');

// ── helpers ───────────────────────────────────────────────────

async function fetchAllMessages(thread) {
    const messages = [];
    let lastId = null;
    let fetched;
    do {
        const opts = { limit: 100 };
        if (lastId) opts.before = lastId;
        fetched = await thread.messages.fetch(opts);
        for (const [, msg] of fetched) {
            messages.push({
                id:          msg.id,
                author:      msg.author.username,
                authorId:    msg.author.id,
                bot:         msg.author.bot,
                content:     msg.content,
                createdAt:   new Date(msg.createdTimestamp).toISOString(),
                          editedAt:    msg.editedTimestamp ? new Date(msg.editedTimestamp).toISOString() : null,
                          pinned:      msg.pinned,
                          attachments: msg.attachments.map(a => ({
                              id:          a.id,
                              name:        a.name,
                              url:         a.url,
                              size:        a.size,
                              contentType: a.contentType,
                          })),
                          linkPreviews: msg.embeds
                          .filter(e => e.url)
                          .map(e => ({
                              url:   e.url,
                              title: e.title ?? '',
                              desc:  e.description ?? '',
                              image: e.thumbnail?.url ?? e.image?.url ?? '',
                              site:  e.provider?.name ?? (() => {
                                  try { return new URL(e.url).hostname; } catch { return ''; }
                              })(),
                          })),
                          reactions: msg.reactions.cache.map(r => ({
                              emoji: r.emoji.toString(),
                                                                   count: r.count,
                          })),
                          referenceId: msg.reference?.messageId ?? null,
            });
        }
        if (fetched.size > 0) lastId = fetched.last().id;
    } while (fetched.size === 100);

        return messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

// ── command ───────────────────────────────────────────────────

module.exports = {
    data: new SlashCommandBuilder()
    .setName('thread-raw')
    .setDescription('Get the raw data from a thread as a JSON file')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(opt =>
    opt.setName('thread_id')
    .setDescription('Thread ID (right-click thread → Copy ID)')
    .setRequired(false))
    .addBooleanOption(opt =>
    opt.setName('current')
    .setDescription('Use the current channel if it is a thread')
    .setRequired(false)),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const threadId   = interaction.options.getString('thread_id');
        const useCurrent = interaction.options.getBoolean('current') ?? false;

        // Resolve thread
        let thread;
        try {
            if (useCurrent) {
                const ch = interaction.channel;
                const threadTypes = [
                    ChannelType.PublicThread,
                    ChannelType.PrivateThread,
                    ChannelType.AnnouncementThread,
                ];
                if (!threadTypes.includes(ch.type)) {
                    return interaction.editReply({
                        embeds: [
                            new EmbedBuilder()
                            .setColor(0xED4245)
                            .setTitle('❌ Not a Thread')
                            .setDescription('Run this command inside a thread, or provide a `thread_id`.'),
                        ],
                    });
                }
                thread = ch;
            } else if (threadId) {
                thread = await interaction.guild.channels.fetch(threadId);
                const threadTypes = [
                    ChannelType.PublicThread,
                    ChannelType.PrivateThread,
                    ChannelType.AnnouncementThread,
                ];
                if (!thread || !threadTypes.includes(thread.type)) {
                    return interaction.editReply({
                        embeds: [
                            new EmbedBuilder()
                            .setColor(0xED4245)
                            .setTitle('❌ Invalid Thread')
                            .setDescription(`Could not find a thread with ID \`${threadId}\``),
                        ],
                    });
                }
            } else {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                        .setColor(0xFEE75C)
                        .setTitle('⚠️ No Thread Specified')
                        .setDescription('Provide a `thread_id` or use `current:True` inside a thread.'),
                    ],
                });
            }
        } catch (e) {
            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                    .setColor(0xED4245)
                    .setTitle('❌ Fetch Error')
                    .setDescription(`\`${e.message}\``),
                ],
            });
        }

        // Update status
        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('⏳ Fetching Thread...')
                .setDescription(`Reading **${thread.name}**...`),
            ],
        });

        // Fetch all messages
        let messages;
        try {
            messages = await fetchAllMessages(thread);
        } catch (e) {
            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                    .setColor(0xED4245)
                    .setTitle('❌ Message Fetch Failed')
                    .setDescription(`\`${e.message}\``),
                ],
            });
        }

        // Build raw data object
        const raw = {
            thread: {
                id:                  thread.id,
                name:                thread.name,
                type:                thread.type,
                archived:            thread.archived,
                locked:              thread.locked,
                createdAt:           thread.createdTimestamp ? new Date(thread.createdTimestamp).toISOString() : null,
                autoArchiveDuration: thread.autoArchiveDuration,
                rateLimitPerUser:    thread.rateLimitPerUser ?? 0,
                ownerId:             thread.ownerId,
                parentId:            thread.parentId,
                parentName:          thread.parent?.name ?? null,
                appliedTags:         thread.appliedTags ?? [],
                messageCount:        thread.messageCount,
                memberCount:         thread.memberCount,
            },
            exportedAt:   new Date().toISOString(),
            messageCount: messages.length,
            messages,
        };

        // Attach as JSON file
        const json       = JSON.stringify(raw, null, 2);
        const safeName   = thread.name.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 60);
        const fileName   = `thread-${safeName}-${thread.id}.json`;
        const attachment = new AttachmentBuilder(Buffer.from(json, 'utf8'), { name: fileName });

        const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('✅ Thread Raw Data')
        .addFields(
            { name: '🧵 Thread',    value: thread.name,                       inline: true  },
            { name: '💌 Messages',  value: String(messages.length),           inline: true  },
                   { name: '📌 Archived',  value: thread.archived ? 'Yes' : 'No',   inline: true  },
                   { name: '🆔 Thread ID', value: `\`${thread.id}\``,               inline: false },
                   { name: '📂 Parent',    value: thread.parent?.name ?? 'Unknown', inline: true  },
                   { name: '🔗 Previews',  value: String(messages.reduce((s, m) => s + (m.linkPreviews?.length ?? 0), 0)) + ' link embeds', inline: true },
        )
        .setFooter({ text: fileName })
        .setTimestamp();

        await interaction.editReply({ embeds: [embed], files: [attachment] });
    },
};
