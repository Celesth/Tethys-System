/**
 * Backup Model
 * Focused schema: categories → channels/forums → threads → messages.
 * No emojis, stickers, or guild settings.
 *
 * File layout on disk:
 *   backups/
 *     ServerName-2024-01-15T10-30-00-CategoryName/
 *       _category.json             ← category meta + stats
 *       forum-announcements.json   ← forum + all its threads
 *       channel-welcome.json       ← text channel + threads
 *       ...
 */

class CategoryBackup {
  constructor(data = {}) {
    this.id          = data.id        || null;
    this.name        = data.name      || 'category';
    this.position    = data.position  ?? 0;
    this.permissions = data.permissions || [];
    this.guildId     = data.guildId   || null;
    this.guildName   = data.guildName || null;
    this.backedUpAt  = data.backedUpAt || Date.now();
    // channel/forum names saved as separate files; stored here for reference
    this.channelFiles = data.channelFiles || [];
    this.stats = data.stats || {
      totalChannels: 0,
      totalForums:   0,
      totalThreads:  0,
      totalMessages: 0,
    };
  }
  toJSON() { return { ...this }; }
  static fromJSON(j) { return new CategoryBackup(j); }
}

class ChannelBackup {
  constructor(data = {}) {
    this.id               = data.id   || null;
    this.name             = data.name || 'channel';
    this.type             = data.type ?? 0;
    this.topic            = data.topic || null;
    this.nsfw             = data.nsfw  || false;
    this.rateLimitPerUser = data.rateLimitPerUser || 0;
    this.position         = data.position ?? 0;
    this.permissions      = data.permissions || [];
    this.messages         = data.messages || [];
    this.threads          = data.threads  || [];
    this.bitrate          = data.bitrate   || null;
    this.userLimit        = data.userLimit || null;
    this.parentId         = data.parentId  || null;
  }
  toJSON() { return { ...this }; }
  static fromJSON(j) { return new ChannelBackup(j); }
}

class ForumBackup {
  constructor(data = {}) {
    this.id                 = data.id   || null;
    this.name               = data.name || 'forum';
    this.topic              = data.topic || null;
    this.nsfw               = data.nsfw  || false;
    this.rateLimitPerUser   = data.rateLimitPerUser || 0;
    this.position           = data.position ?? 0;
    this.permissions        = data.permissions || [];
    this.availableTags      = data.availableTags || [];
    this.defaultSortOrder   = data.defaultSortOrder   || null;
    this.defaultForumLayout = data.defaultForumLayout || null;
    this.threads            = data.threads || [];   // ALL posts — active + archived
    this.parentId           = data.parentId || null;
  }
  toJSON() { return { ...this }; }
  static fromJSON(j) { return new ForumBackup(j); }
}

class ThreadBackup {
  constructor(data = {}) {
    this.id                  = data.id   || null;
    this.name                = data.name || 'thread';
    this.type                = data.type ?? 11;
    this.archived            = data.archived || false;
    this.locked              = data.locked   || false;
    this.autoArchiveDuration = data.autoArchiveDuration || 1440;
    this.rateLimitPerUser    = data.rateLimitPerUser || 0;
    this.appliedTags         = data.appliedTags || [];
    this.messages            = data.messages   || [];
    this.createdAt           = data.createdAt  || null;
    this.parentId            = data.parentId   || null;
    this.ownerId             = data.ownerId    || null;
    this.messageCount        = data.messageCount || 0;
  }
  toJSON() { return { ...this }; }
  static fromJSON(j) { return new ThreadBackup(j); }
}

class MessageBackup {
  constructor(data = {}) {
    this.id          = data.id      || null;
    this.content     = data.content || '';
    this.author      = data.author  || { id: null, username: 'Unknown', bot: false, avatar: null };
    this.createdAt   = data.createdAt || null;
    this.editedAt    = data.editedAt  || null;
    this.pinned      = data.pinned    || false;
    this.attachments = data.attachments || [];
    this.embeds      = data.embeds     || [];
    this.referenceId  = data.referenceId  || null;
    this.linkPreviews = data.linkPreviews || []; // [{ url, title, desc, image, site }]
  }
  toJSON() { return { ...this }; }
}

module.exports = {
  CategoryBackup,
  ChannelBackup,
  ForumBackup,
  ThreadBackup,
  MessageBackup,
};
