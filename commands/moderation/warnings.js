const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getWarnings, clearWarnings, removeWarning } = require('../../utils/warnStore');

module.exports = {
    data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('View or manage warnings for a member')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(opt =>
    opt.setName('user').setDescription('Member to look up').setRequired(true))
    .addStringOption(opt =>
    opt.setName('action')
    .setDescription('What to do')
    .setRequired(false)
    .addChoices(
        { name: 'view (default)', value: 'view' },
                { name: 'clear all',      value: 'clear' },
                { name: 'remove one',     value: 'remove' },
    ))
    .addStringOption(opt =>
    opt.setName('warn_id')
    .setDescription('Warn ID to remove (required for action: remove one)')
    .setRequired(false)),

    async execute(interaction) {
        const target = interaction.options.getUser('user');
        const action = interaction.options.getString('action') ?? 'view';
        const warnId = interaction.options.getString('warn_id');

        if (action === 'clear') {
            const count = getWarnings(interaction.guildId, target.id).length;
            clearWarnings(interaction.guildId, target.id);
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                    .setColor(0xa6e3a1)
                    .setDescription(`✅ Cleared **${count}** warning(s) for ${target}.`),
                ],
            });
        }

        if (action === 'remove') {
            if (!warnId) return interaction.reply({ content: '❌ Provide a `warn_id` to remove.', ephemeral: true });
            const ok = removeWarning(interaction.guildId, target.id, warnId);
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                    .setColor(ok ? 0xa6e3a1 : 0xf38ba8)
                    .setDescription(ok ? `✅ Removed warning \`${warnId}\` from ${target}.` : `❌ Warning ID \`${warnId}\` not found.`),
                ],
                ephemeral: !ok,
            });
        }

        // view
        const warns = getWarnings(interaction.guildId, target.id);
        const embed = new EmbedBuilder()
        .setColor(warns.length ? 0xf9e2af : 0xa6e3a1)
        .setTitle(`Warnings for ${target.tag}`)
        .setThumbnail(target.displayAvatarURL())
        .setFooter({ text: `${warns.length} total warning(s)` })
        .setTimestamp();

        if (!warns.length) {
            embed.setDescription('✅ No warnings on record.');
        } else {
            const lines = warns.slice(-10).reverse().map((w, i) =>
            `**#${warns.length - i}** — <t:${Math.floor(new Date(w.timestamp).getTime() / 1000)}:R>\n` +
            `Reason: ${w.reason}\nMod: <@${w.moderator}>\nID: \`${w.id}\``
            );
            embed.setDescription(lines.join('\n\n'));
            if (warns.length > 10) embed.setFooter({ text: `Showing last 10 of ${warns.length} warnings` });
        }

        await interaction.reply({ embeds: [embed] });
    },
};
