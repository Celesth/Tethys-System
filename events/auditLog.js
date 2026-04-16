const { Events, EmbedBuilder } = require('discord.js');
const auditStore = require('../utils/auditStore');

const LOG_COLOR = 0x89b4fa;
const ACTION_COLORS = {
  1:  0xa6e3a1,
  10: 0xf38ba8,
  12: 0xf9e2af,
  14: 0x89b4fa,
  20: 0xcba6f7,
  21: 0x89b4fa,
  22: 0xf38ba8,
  24: 0x89b4fa,
  25: 0xf38ba8,
  26: 0x89b4fa,
  27: 0xf38ba8,
  28: 0x89b4fa,
  30: 0xf38ba8,
  31: 0xf38ba8,
  32: 0xf38ba8,
  40: 0xf9e2af,
  41: 0xf9e2af,
  42: 0xf9e2af,
  50: 0x89b4fa,
  51: 0x89b4fa,
  52: 0x89b4fa,
  60: 0xf38ba8,
  72: 0xf38ba8,
  73: 0xf38ba8,
  74: 0xf38ba8,
  75: 0xf38ba8,
  80: 0x89b4fa,
  81: 0x89b4fa,
  82: 0x89b4fa,
  83: 0x89b4fa,
  84: 0x89b4fa,
  85: 0x89b4fa,
  90: 0x89b4fa,
  91: 0x89b4fa,
  92: 0x89b4fa,
  93: 0x89b4fa,
  94: 0x89b4fa,
  95: 0x89b4fa,
  100: 0xf38ba8,
  101: 0xf38ba8,
  102: 0xf38ba8,
  103: 0xf38ba8,
  110: 0x89b4fa,
  111: 0x89b4fa,
  112: 0x89b4fa,
  113: 0x89b4fa,
  114: 0x89b4fa,
  121: 0x89b4fa,
  122: 0x89b4fa,
  123: 0x89b4fa,
  124: 0x89b4fa,
  125: 0x89b4fa,
  126: 0x89b4fa,
  127: 0x89b4fa,
  128: 0x89b4fa,
  129: 0x89b4fa,
  130: 0x89b4fa,
  131: 0x89b4fa,
  132: 0x89b4fa,
  133: 0x89b4fa,
  134: 0x89b4fa,
  140: 0xf9e2af,
  141: 0xf9e2af,
  142: 0xf9e2af,
  143: 0xf9e2af,
  144: 0xf9e2af,
  145: 0xf9e2af,
  146: 0xf9e2af,
  147: 0xf9e2af,
  148: 0xf9e2af,
  149: 0xf9e2af,
  150: 0xf9e2af,
  151: 0xf9e2af,
  152: 0xf9e2af,
  153: 0xf9e2af,
  154: 0xf9e2af,
  155: 0xf9e2af,
  160: 0xf38ba8,
  161: 0xf38ba8,
  162: 0xf38ba8,
  163: 0xf38ba8,
  164: 0xf38ba8,
  165: 0xf38ba8,
  170: 0x89b4fa,
  171: 0x89b4fa,
  172: 0x89b4fa,
  180: 0x89b4fa,
  181: 0x89b4fa,
  182: 0x89b4fa,
  183: 0x89b4fa,
  184: 0x89b4fa,
  185: 0x89b4fa,
  186: 0x89b4fa,
  190: 0x89b4fa,
  191: 0x89b4fa,
  192: 0x89b4fa,
  193: 0x89b4fa,
  194: 0x89b4fa,
  195: 0x89b4fa,
  200: 0xf38ba8,
  201: 0xf38ba8,
  218: 0xf38ba8,
  219: 0xf38ba8,
  220: 0xf38ba8,
  221: 0xf38ba8,
  222: 0xf38ba8,
  223: 0xf38ba8,
  224: 0xf38ba8,
  225: 0xf38ba8,
  230: 0xf38ba8,
  232: 0xf38ba8,
  233: 0xf38ba8,
  234: 0xf38ba8,
  235: 0xf38ba8,
  236: 0xf38ba8,
  237: 0xf38ba8,
  238: 0xf38ba8,
  239: 0xf38ba8,
  240: 0xf38ba8,
  241: 0xf38ba8,
  242: 0xf38ba8,
  243: 0xf38ba8,
  244: 0xf38ba8,
  250: 0xf38ba8,
  251: 0xf38ba8,
  252: 0xf38ba8,
  253: 0xf38ba8,
  254: 0xf38ba8,
  255: 0xf38ba8,
};

function getActionName(action) {
  if (typeof action === 'object' && action.name) return action.name;
  if (typeof action === 'number') return action.toString();
  return String(action);
}

function getColor(action) {
  if (typeof action === 'object' && action.type !== undefined) {
    return ACTION_COLORS[action.type] ?? LOG_COLOR;
  }
  if (typeof action === 'number') {
    return ACTION_COLORS[action] ?? LOG_COLOR;
  }
  return LOG_COLOR;
}

function safeChannelSend(channel, payload) {
  return channel.send(payload).catch((err) => {
    console.error('[auditLog] Failed to send log:', err.message);
  });
}

module.exports = {
  name: Events.GuildAuditLogEntryCreate,

  async execute(auditLogEntry, guild) {
    try {
      const settings = auditStore.getGuild(guild.id);
      if (!settings || !settings.enabled) return;

      const channel = guild.client.channels.cache.get(settings.channelId);
      if (!channel) {
        const fetched = await guild.client.channels.fetch(settings.channelId).catch(() => null);
        if (!fetched) {
          console.warn(`[auditLog] Channel ${settings.channelId} not found in guild ${guild.id}`);
          return;
        }
        return safeChannelSend(fetched, { embeds: [buildEmbed(auditLogEntry)] });
      }

      return safeChannelSend(channel, { embeds: [buildEmbed(auditLogEntry)] });
    } catch (err) {
      console.error('[auditLog] Error processing audit log:', err);
    }
  },
};

function buildEmbed(auditLogEntry) {
  const action = auditLogEntry.action;
  const executor = auditLogEntry.executor;
  const target = auditLogEntry.target;
  const reason = auditLogEntry.reason;
  const actionName = getActionName(action);
  const color = getColor(action);

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`Audit Log: ${actionName}`)
    .setTimestamp()
    .addFields([
      { name: 'Action', value: actionName, inline: true },
      { name: 'User', value: executor?.tag ?? 'Unknown', inline: true },
    ]);

  if (reason) {
    embed.addFields([{ name: 'Reason', value: reason, inline: false }]);
  }

  if (target) {
    const targetStr = typeof target === 'object' ? (target.tag ?? target.username ?? target.toString()) : target.toString();
    embed.addFields([{ name: 'Target', value: targetStr, inline: false }]);
  }

  return embed;
}
