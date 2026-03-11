const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Bulk delete messages in this channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(opt =>
    opt.setName('amount')
    .setDescription('Number of messages to delete (1–100)')
    .setMinValue(1)
    .setMaxValue(100)
    .setRequired(true))
    .addUserOption(opt =>
    opt.setName('user')
    .setDescription('Only delete messages from this user (optional)')
    .setRequired(false))
    .addStringOption(opt =>
    opt.setName('contains')
    .setDescription('Only delete messages containing this text (optional)')
    .setRequired(false)),

    async execute(interaction) {
        const amount   = interaction.options.getInteger('amount');
        const filterUser = interaction.options.getUser('user');
        const filterText = interaction.options.getString('contains')?.toLowerCase();
        const channel  = interaction.channel;

        await interaction.deferReply({ ephemeral: true });

        // Fetch messages — always fetch 100 so we have enough to filter down to `amount`
        const fetched = await channel.messages.fetch({ limit: 100 });

        // Discord won't bulk-delete messages older than 14 days
        const cutoff  = Date.now() - 13 * 24 * 60 * 60 * 1000;
        let eligible  = fetched.filter(m => m.createdTimestamp > cutoff);

        if (filterUser) eligible = eligible.filter(m => m.author.id === filterUser.id);
        if (filterText) eligible = eligible.filter(m => m.content.toLowerCase().includes(filterText));

        const toDelete = eligible.first(amount);

        if (!toDelete.length) {
            return interaction.editReply('❌ No eligible messages found (messages may be older than 14 days).');
        }

        const deleted = await channel.bulkDelete(toDelete, true).catch(err => {
            throw new Error(`Bulk delete failed: ${err.message}`);
        });

        const embed = new EmbedBuilder()
        .setColor(0x89b4fa)
        .setTitle('🗑️ Messages purged')
        .addFields(
            { name: 'Deleted',   value: `${deleted.size} message(s)`,                     inline: true },
                   { name: 'Channel',   value: `${channel}`,                                      inline: true },
                   { name: 'By',        value: `${interaction.user}`,                             inline: true },
                   ...(filterUser ? [{ name: 'User filter',  value: `${filterUser}` }] : []),
                   ...(filterText ? [{ name: 'Text filter',  value: `"${filterText}"` }]   : []),
        )
        .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        // Auto-delete the confirmation after 5s so it doesn't clutter the channel
        setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
    },
};
