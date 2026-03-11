const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Lock or unlock a channel for @everyone')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand(sub =>
    sub.setName('channel')
    .setDescription('Lock a channel — @everyone can no longer send messages')
    .addChannelOption(opt =>
    opt.setName('channel').setDescription('Channel to lock (defaults to current)').setRequired(false))
    .addStringOption(opt =>
    opt.setName('reason').setDescription('Reason (shown in audit log)').setRequired(false)))
    .addSubcommand(sub =>
    sub.setName('unlock')
    .setDescription('Unlock a channel — restore @everyone send permissions')
    .addChannelOption(opt =>
    opt.setName('channel').setDescription('Channel to unlock (defaults to current)').setRequired(false))
    .addStringOption(opt =>
    opt.setName('reason').setDescription('Reason').setRequired(false))),

    async execute(interaction) {
        const sub     = interaction.options.getSubcommand();
        const channel = interaction.options.getChannel('channel') ?? interaction.channel;
        const reason  = interaction.options.getString('reason') ?? 'No reason provided';
        const everyoneRole = interaction.guild.roles.everyone;

        const isLocking = sub === 'channel';

        // For forum channels, deny CreatePublicThreads instead of SendMessages
        const isForum = channel.type === ChannelType.GuildForum || channel.type === ChannelType.GuildMedia;
        const perm    = isForum ? PermissionFlagsBits.CreatePublicThreads : PermissionFlagsBits.SendMessages;

        try {
            await channel.permissionOverwrites.edit(everyoneRole, {
                [isForum ? 'CreatePublicThreads' : 'SendMessages']: isLocking ? false : null,
            }, { reason: `${sub} by ${interaction.user.tag}: ${reason}` });
        } catch (err) {
            return interaction.reply({ content: `❌ Failed to ${sub}: ${err.message}`, ephemeral: true });
        }

        const embed = new EmbedBuilder()
        .setColor(isLocking ? 0xf38ba8 : 0xa6e3a1)
        .setTitle(isLocking ? '🔒 Channel locked' : '🔓 Channel unlocked')
        .addFields(
            { name: 'Channel',   value: `${channel}`,         inline: true },
            { name: 'By',        value: `${interaction.user}`, inline: true },
            { name: 'Reason',    value: reason },
        )
        .setTimestamp();

        await interaction.reply({ embeds: [embed] });

        // Send a notice in the locked/unlocked channel (unless it's the same channel)
        if (channel.id !== interaction.channelId) return;
        const noticeEmbed = new EmbedBuilder()
        .setColor(isLocking ? 0xf38ba8 : 0xa6e3a1)
        .setDescription(
            isLocking
            ? `🔒 This channel has been locked by a moderator.\n**Reason:** ${reason}`
            : `🔓 This channel has been unlocked.`
        );
        await channel.send({ embeds: [noticeEmbed] }).catch(() => {});
    },
};
