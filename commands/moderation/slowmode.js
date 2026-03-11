const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

// Discord max slowmode is 6 hours (21600s)
const PRESETS = [0, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 21600];

function fmtSeconds(s) {
    if (s === 0)     return 'off';
    if (s < 60)      return `${s}s`;
    if (s < 3600)    return `${Math.floor(s / 60)}m`;
    return `${Math.floor(s / 3600)}h`;
}

module.exports = {
    data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Set or clear slowmode for a channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addIntegerOption(opt =>
    opt.setName('seconds')
    .setDescription('Slowmode delay in seconds (0 = off, max 21600). Common: 5, 10, 30, 60, 300')
    .setMinValue(0)
    .setMaxValue(21600)
    .setRequired(true))
    .addChannelOption(opt =>
    opt.setName('channel')
    .setDescription('Target channel (defaults to current)')
    .setRequired(false)),

    async execute(interaction) {
        const seconds = interaction.options.getInteger('seconds');
        const channel = interaction.options.getChannel('channel') ?? interaction.channel;

        if (!channel.setRateLimitPerUser) {
            return interaction.reply({ content: '❌ That channel type does not support slowmode.', ephemeral: true });
        }

        const prev = channel.rateLimitPerUser ?? 0;
        await channel.setRateLimitPerUser(seconds, `Set by ${interaction.user.tag}`);

        const embed = new EmbedBuilder()
        .setColor(seconds === 0 ? 0xa6e3a1 : 0xf9e2af)
        .setTitle(seconds === 0 ? '✅ Slowmode disabled' : `🐢 Slowmode set`)
        .addFields(
            { name: 'Channel',  value: `${channel}`,         inline: true },
            { name: 'Before',   value: fmtSeconds(prev),     inline: true },
                   { name: 'After',    value: fmtSeconds(seconds),  inline: true },
                   { name: 'Set by',   value: `${interaction.user}` },
        )
        .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};
