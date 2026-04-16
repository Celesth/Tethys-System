const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const auditStore = require('../../utils/auditStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('auditlogger')
    .setDescription('Configure the audit logger')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('set')
        .setDescription('Set the channel for audit logs')
        .addChannelOption(opt =>
          opt.setName('channel')
            .setDescription('Channel to send audit logs')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('disable')
        .setDescription('Disable audit logging'))
    .addSubcommand(sub =>
      sub.setName('status')
        .setDescription('Check current audit logger status')),

  async execute(interaction) {
    try {
      const sub = interaction.options.getSubcommand();

      if (sub === 'set') {
        const channel = interaction.options.getChannel('channel');

        if (!channel.isTextBased()) {
          return interaction.reply({
            embeds: [new EmbedBuilder()
              .setColor(0xf38ba8)
              .setDescription('❌ Please select a text channel.')],
            flags: 64,
          });
        }

        try {
          await channel.permissionOverwrites.create(interaction.guild.roles.everyone, {
            ViewChannel: null,
            SendMessages: null,
          });
        } catch { /* permissions may already be set */ }

        auditStore.setChannel(interaction.guild.id, channel.id);
        auditStore.reload();

        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(0xa6e3a1)
            .setTitle('Audit Logger Configured')
            .setDescription(`✅ Audit logs will be sent to ${channel}`)
            .addFields([
              { name: 'Status', value: 'Enabled', inline: true },
              { name: 'Channel', value: channel.toString(), inline: true },
            ])
            .setTimestamp()],
        });
      }

      if (sub === 'disable') {
        auditStore.disable(interaction.guild.id);
        auditStore.reload();

        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(0xf38ba8)
            .setTitle('Audit Logger Disabled')
            .setDescription('🔇 Audit logging has been disabled.')],
        });
      }

      if (sub === 'status') {
        const settings = auditStore.getGuild(interaction.guild.id);

        if (!settings || !settings.enabled) {
          return interaction.reply({
            embeds: [new EmbedBuilder()
              .setColor(0x45475a)
              .setTitle('Audit Logger Status')
              .setDescription('🔇 Audit logging is **disabled**.')
              .addFields([
                { name: 'Usage', value: '`/auditlogger set [channel]` to enable', inline: false },
              ])],
          });
        }

        let channel;
        try {
          channel = await interaction.guild.channels.fetch(settings.channelId);
        } catch {
          channel = null;
        }

        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(0xa6e3a1)
            .setTitle('Audit Logger Status')
            .setDescription(`✅ Logging to ${channel ?? `<#${settings.channelId}>`}`)
            .addFields([
              { name: 'Channel', value: channel?.toString() ?? `Unknown (${settings.channelId})`, inline: true },
              { name: 'Status', value: 'Enabled', inline: true },
            ])
            .setTimestamp()],
        });
      }
    } catch (err) {
      console.error('[auditlogger] Error:', err);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0xf38ba8)
          .setDescription('❌ An error occurred while configuring audit logger.')],
        flags: 64,
      }).catch(() => {});
    }
  },
};
