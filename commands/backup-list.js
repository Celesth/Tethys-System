const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { listBackups } = require('../services/BackupService');

module.exports = {
  data: new SlashCommandBuilder()
  .setName('backup-list')
  .setDescription('List all category backups for this server')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const backups = listBackups(interaction.guild.id);

    if (!backups.length) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
          .setColor(0xFEE75C)
          .setTitle('📭 No Backups Found')
          .setDescription('No backups exist yet. Use `/backup-create` to get started.'),
        ],
      });
    }

    const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`🗄️ Backups — ${interaction.guild.name}`)
    .setDescription(`**${backups.length}** backup${backups.length === 1 ? '' : 's'} found`)
    .setTimestamp();

    for (const b of backups.slice(0, 10)) {
      const date = new Date(b.backedUpAt).toLocaleString();
      // Extract stats from raw TOML via regex
      const forumsM   = b.rawMeta.match(/totalForums\s*=\s*(\d+)/);
      const threadsM  = b.rawMeta.match(/totalThreads\s*=\s*(\d+)/);
      const messagesM = b.rawMeta.match(/totalMessages\s*=\s*(\d+)/);
      embed.addFields({
        name: `📁 ${b.name}  •  ${date}`,
        value: [
          `\`\`\`${b.folder}\`\`\``,
          `💬 ${forumsM?.[1] ?? 0} forums • 🧵 ${threadsM?.[1] ?? 0} threads • 💌 ${messagesM?.[1] ?? 0} messages`,
        ].join('\n'),
                      inline: false,
      });
    }

    if (backups.length > 10) embed.setFooter({ text: `Showing 10 of ${backups.length}` });
    await interaction.editReply({ embeds: [embed] });
  },
};
