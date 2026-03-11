const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { addWarning, getWarnings } = require('../../utils/warnStore');

module.exports = {
    data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Issue a warning to a member')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(opt =>
    opt.setName('user').setDescription('Member to warn').setRequired(true))
    .addStringOption(opt =>
    opt.setName('reason').setDescription('Reason for the warning').setRequired(true)),

    async execute(interaction) {
        const target = interaction.options.getMember('user');
        const reason = interaction.options.getString('reason');

        if (!target) return interaction.reply({ content: '❌ Member not found.', ephemeral: true });
        if (target.user.bot) return interaction.reply({ content: '❌ Cannot warn bots.', ephemeral: true });
        if (target.id === interaction.user.id) return interaction.reply({ content: '❌ Cannot warn yourself.', ephemeral: true });

        const warning = addWarning(interaction.guildId, target.id, {
            reason,
            moderator: interaction.user.id,
            timestamp: new Date().toISOString(),
        });

        const allWarnings = getWarnings(interaction.guildId, target.id);

        // DM the warned user
        const dmEmbed = new EmbedBuilder()
        .setColor(0xf9e2af)
        .setTitle(`⚠️ You received a warning in ${interaction.guild.name}`)
        .addFields(
            { name: 'Reason',      value: reason },
            { name: 'Moderator',   value: `<@${interaction.user.id}>` },
            { name: 'Total warns', value: `${allWarnings.length}` },
        )
        .setTimestamp();

        await target.send({ embeds: [dmEmbed] }).catch(() => {}); // ignore if DMs closed

        const replyEmbed = new EmbedBuilder()
        .setColor(0xf9e2af)
        .setTitle('⚠️ Warning issued')
        .addFields(
            { name: 'User',        value: `${target} (${target.user.tag})`, inline: true },
                   { name: 'Moderator',   value: `${interaction.user}`,            inline: true },
                   { name: 'Total warns', value: `${allWarnings.length}`,          inline: true },
                   { name: 'Reason',      value: reason },
        )
        .setFooter({ text: `Warn ID: ${warning.id}` })
        .setTimestamp();

        await interaction.reply({ embeds: [replyEmbed] });
    },
};
