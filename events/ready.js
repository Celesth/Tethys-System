const { Events, ActivityType } = require('discord.js');
const { logLogin } = require('../services/BackupService');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    logLogin(client);
    client.user.setActivity('Pre-Alpha', { type: ActivityType.Watching });
  },
};
