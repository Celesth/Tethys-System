const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

// Parse duration strings like "10m", "2h", "1d" → milliseconds
function parseDuration(str) {
    const match = str.trim().match(/^(\d+)\s*(s|sec|m|min|h|hr|d|day)s?$/i);
    if (!match) return null;
    const n    = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    const map  = { s: 1000, sec: 1000, m: 60000, min: 60000, h: 3600000, hr: 3600000, d: 86400000, day: 86400000 };
    return n * map[unit];
}

function fmtDuration(ms) {
    const s = Math.floor(ms / 1000);
    if (s < 60)   return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
}

module.exports = {
    data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Timeout (mute) or unmute a member')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand(sub =>
    sub.setName('add')
    .setDescription('Timeout a member')
    .addUserOption(opt => opt.setName('user').setDescription('Member to mute').setRequired(true))
    .addStringOption(opt =>
    opt.setName('duration')
    .setDescription('Duration e.g. 10m  2h  1d  (max 28d)')
    .setRequired(true))
    .addStringOption(opt =>
    opt.setName('reason').setDescription('Reason').setRequired(false)))
    .addSubcommand(sub =>
    sub.setName('remove')
    .setDescription('Remove timeout from a member')
    .addUserOption(opt => opt.setName('user').setDescription('Member to unmute').setRequired(true))
    .addStringOption(opt =>
    opt.setName('reason').setDescription('Reason').setRequired(false))),

    async execute(interaction) {
        const sub    = interaction.options.getSubcommand();
        const target = interaction.options.getMember('user');
        const reason = interaction.options.getString('reason') ?? 'No reason provided';

        if (!target) return interaction.reply({ content: '❌ Member not found.', ephemeral: true });
        if (target.user.bot) return interaction.reply({ content: '❌ Cannot mute bots.', ephemeral: true });
        if (!target.moderatable) return interaction.reply({ content: '❌ I cannot moderate this member (check role hierarchy).', ephemeral: true });

        if (sub === 'add') {
            const raw = interaction.options.getString('duration');
            const ms  = parseDuration(raw);

            if (!ms) return interaction.reply({ content: '❌ Invalid duration. Use formats like `10m`, `2h`, `1d`.', ephemeral: true });
            if (ms > 28 * 86400000) return interaction.reply({ content: '❌ Discord maximum timeout is 28 days.', ephemeral: true });
            if (ms < 5000) return interaction.reply({ content: '❌ Minimum timeout is 5 seconds.', ephemeral: true });

            await target.timeout(ms, reason);

            const unixEnd = Math.floor((Date.now() + ms) / 1000);
            const embed = new EmbedBuilder()
            .setColor(0xf38ba8)
            .setTitle('🔇 Member muted')
            .addFields(
                { name: 'User',      value: `${target} (${target.user.tag})`, inline: true },
                       { name: 'Duration',  value: fmtDuration(ms),                  inline: true },
                       { name: 'Expires',   value: `<t:${unixEnd}:R>`,               inline: true },
                       { name: 'Reason',    value: reason },
                       { name: 'Moderator', value: `${interaction.user}` },
            )
            .setTimestamp();

            // DM the user
            const dmEmbed = new EmbedBuilder()
            .setColor(0xf38ba8)
            .setTitle(`🔇 You were muted in ${interaction.guild.name}`)
            .addFields(
                { name: 'Duration', value: fmtDuration(ms) },
                       { name: 'Expires',  value: `<t:${unixEnd}:R>` },
                       { name: 'Reason',   value: reason },
            )
            .setTimestamp();

            await target.send({ embeds: [dmEmbed] }).catch(() => {});
            return interaction.reply({ embeds: [embed] });
        }

        if (sub === 'remove') {
            if (!target.isCommunicationDisabled()) {
                return interaction.reply({ content: `❌ ${target} is not currently muted.`, ephemeral: true });
            }

            await target.timeout(null, reason);

            const embed = new EmbedBuilder()
            .setColor(0xa6e3a1)
            .setTitle('🔊 Member unmuted')
            .addFields(
                { name: 'User',      value: `${target} (${target.user.tag})`, inline: true },
                       { name: 'Moderator', value: `${interaction.user}`,            inline: true },
                       { name: 'Reason',    value: reason },
            )
            .setTimestamp();

            await target.send({
                embeds: [
                    new EmbedBuilder()
                    .setColor(0xa6e3a1)
                    .setTitle(`🔊 You were unmuted in ${interaction.guild.name}`)
                    .addFields({ name: 'Reason', value: reason })
                    .setTimestamp(),
                ],
            }).catch(() => {});

            return interaction.reply({ embeds: [embed] });
        }
    },
};
