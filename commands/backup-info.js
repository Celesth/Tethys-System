const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getBackupInfo, loadChannelFile, listBackups } = require('../services/BackupService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('backup-info')
    .setDescription('View details of a specific category backup')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(opt =>
      opt.setName('folder')
        .setDescription('Backup folder name (from /backup-list)')
        .setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const folder = interaction.options.getString('folder');
    const meta   = getBackupInfo(folder);

    if (!meta) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('❌ Not Found')
            .setDescription(`No backup found at folder \`${folder}\``),
        ],
      });
    }

    const s = meta.stats;
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`📦 ${meta.name}  —  ${meta.guildName}`)
      .addFields(
        { name: '📅 Backed up', value: new Date(meta.backedUpAt).toLocaleString(), inline: true },
        { name: '📁 Folder',    value: `\`${folder}\``, inline: false },
        { name: '📊 Stats', value: [
          `💬 **Forums:** ${s.totalForums}`,
          `#️⃣ **Channels:** ${s.totalChannels}`,
          `🧵 **Threads:** ${s.totalThreads}`,
          `💌 **Messages:** ${s.totalMessages}`,
        ].join('\n'), inline: false },
      );

    // List every file and its thread/message count
    const fileLines = [];
    for (const fileName of meta.channelFiles || []) {
      const data = loadChannelFile(folder, fileName);
      if (!data) continue;
      const isForum = fileName.startsWith('forum');
      const threadCount = data.threads?.length ?? 0;
      const msgCount = isForum
        ? (data.threads || []).reduce((s, t) => s + (t.messages?.length || 0), 0)
        : (data.messages?.length || 0);
      const icon = isForum ? '💬' : fileName.startsWith('voice') ? '🔊' : '#️⃣';
      fileLines.push(`${icon} **${data.name}** — ${threadCount} threads, ${msgCount} msgs`);
    }

    if (fileLines.length) {
      embed.addFields({
        name:  '📂 Contents',
        value: fileLines.slice(0, 20).join('\n') || 'None',
        inline: false,
      });
    }

    embed.setFooter({ text: 'Use /backup-restore to restore this backup' });
    await interaction.editReply({ embeds: [embed] });
  },
};
