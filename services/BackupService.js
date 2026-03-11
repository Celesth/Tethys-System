const { ChannelType } = require('discord.js');
const fs   = require('fs');
const path = require('path');
const toml = require('../utils/toml');
const {
  CategoryBackup,
  ChannelBackup,
  ForumBackup,
  ThreadBackup,
  MessageBackup,
} = require('../models/BackupModel');

const BACKUP_DIR  = path.join(__dirname, '..', 'backups');
const MAX_MESSAGES = 500;

if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

// ─────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────

function safeName(str) {
  return String(str).replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/_+/g, '_').slice(0, 80);
}

function buildFolderName(guildName, categoryName) {
  const ts = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
  return `${safeName(guildName)}-${ts}-${safeName(categoryName)}`;
}

function writeToml(filePath, data) {
  fs.writeFileSync(filePath, toml.stringify(data), 'utf8');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─────────────────────────────────────────────────────────────
//  LOGIN LOGGER
// ─────────────────────────────────────────────────────────────

function logLogin(client) {
  const tag   = client.user.tag;
  const id    = client.user.id;
  const guilds = client.guilds.cache.size;
  const ts    = new Date().toLocaleString();
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log(`║   Logged in as : ${tag.padEnd(22)}║`);
  console.log(`║   Bot ID       : ${id.padEnd(22)}║`);
  console.log(`║   Guilds       : ${String(guilds).padEnd(22)}║`);
  console.log(`║   Login time   : ${ts.slice(0,22).padEnd(22)}║`);
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
}

// ─────────────────────────────────────────────────────────────
//  PERMISSIONS
// ─────────────────────────────────────────────────────────────

function serializePermissions(channel) {
  return channel.permissionOverwrites.cache.map(o => ({
    id:    o.id,
    type:  o.type,
    allow: o.allow.bitfield.toString(),
                                                      deny:  o.deny.bitfield.toString(),
  }));
}

// ─────────────────────────────────────────────────────────────
//  MESSAGE CAPTURE
// ─────────────────────────────────────────────────────────────

async function fetchMessages(channel, limit = MAX_MESSAGES) {
  const messages = [];
  try {
    let lastId = null, fetched;
    do {
      const opts = { limit: Math.min(100, limit - messages.length) };
      if (lastId) opts.before = lastId;
      fetched = await channel.messages.fetch(opts);
      for (const [, msg] of fetched) {
        messages.push(new MessageBackup({
          id:        msg.id,
          content:   msg.content,
          author: {
            id:       msg.author.id,
            username: msg.author.username,
            bot:      msg.author.bot,
            avatar:   msg.author.displayAvatarURL(),
          },
          createdAt:   msg.createdTimestamp,
          editedAt:    msg.editedTimestamp,
          pinned:      msg.pinned,
          attachments: msg.attachments.map(a => ({
            id: a.id, name: a.name, url: a.url, size: a.size, contentType: a.contentType,
          })),
          // Extract link previews directly from Discord's embed data — no proxy needed
          // Discord auto-fetches OG tags and stores them in msg.embeds
          linkPreviews: msg.embeds
          .filter(e => e.url) // only link embeds (not custom rich embeds)
        .map(e => ({
          url:   e.url   ?? '',
          title: e.title ?? '',
          desc:  e.description ?? '',
          image: e.thumbnail?.url ?? e.image?.url ?? '',
          site:  e.provider?.name ?? (() => { try { return new URL(e.url).hostname; } catch { return ''; } })(),
        })),
        referenceId: msg.reference?.messageId || null,
        }).toJSON());
      }
      if (fetched.size > 0) lastId = fetched.last().id;
    } while (fetched.size === 100 && messages.length < limit);
  } catch (e) {
    console.warn(`  [messages] Failed for #${channel.name ?? channel.id}: ${e.message}`);
  }
  return messages.sort((a, b) => a.createdAt - b.createdAt);
}

// ─────────────────────────────────────────────────────────────
//  THREAD CAPTURE
// ─────────────────────────────────────────────────────────────

async function captureThread(thread) {
  const messages = await fetchMessages(thread);
  return new ThreadBackup({
    id:                  thread.id,
    name:                thread.name,
    type:                thread.type,
    archived:            thread.archived,
    locked:              thread.locked,
    autoArchiveDuration: thread.autoArchiveDuration,
    rateLimitPerUser:    thread.rateLimitPerUser || 0,
    appliedTags:         thread.appliedTags || [],
    messages,
    createdAt:    thread.createdTimestamp,
    parentId:     thread.parentId,
    ownerId:      thread.ownerId,
    messageCount: thread.messageCount,
  }).toJSON();
}

async function fetchAllThreads(channel) {
  const threads = [];
  const seen    = new Set();
  const isForum = channel.type === ChannelType.GuildForum || channel.type === ChannelType.GuildMedia;

  const addThread = async (t) => {
    if (seen.has(t.id)) return;
    seen.add(t.id);
    threads.push(await captureThread(t));
  };

  // 1. Active threads via guild-level fetch
  try {
    const active = await channel.guild.channels.fetchActiveThreads();
    let count = 0;
    for (const [, t] of active.threads) {
      if (t.parentId === channel.id) { await addThread(t); count++; }
    }
    console.log(`  [threads] #${channel.name} — ${count} active`);
  } catch (e) {
    console.warn(`  [threads] Active fetch failed for #${channel.name}: ${e.message}`);
  }

  if (isForum) {
    // Forums: use raw REST — discord.js fetchArchived is unreliable for forums
    try {
      let before = null, hasMore = true, page = 0;
      while (hasMore) {
        const query = new URLSearchParams({ limit: '100' });
        if (before) query.set('before', before);
        const res = await channel.client.rest.get(
          `/channels/${channel.id}/threads/archived/public?${query.toString()}`
        );
        const threadList = res.threads ?? [];
        page++;
        console.log(`  [threads] #${channel.name} — archived page ${page}: ${threadList.length} posts (hasMore: ${res.has_more})`);
        for (const raw of threadList) {
          if (seen.has(raw.id)) continue;
          seen.add(raw.id);
          try {
            const threadChannel = await channel.client.channels.fetch(raw.id);
            threads.push(await captureThread(threadChannel));
          } catch (e) {
            console.warn(`  [threads] Could not fetch thread ${raw.id} (${raw.name}): ${e.message}`);
          }
          await sleep(200);
        }
        hasMore = res.has_more ?? false;
        before  = threadList.length > 0 ? threadList[threadList.length - 1].id : null;
        if (!before || !hasMore) break;
        await sleep(500);
      }
    } catch (e) {
      console.warn(`  [threads] Forum archived fetch failed for #${channel.name}: ${e.message}`);
    }
  } else {
    // Text channels
    try {
      let before = null, hasMore = true, page = 0;
      while (hasMore) {
        const res = await channel.threads.fetchArchived({ before, limit: 100, type: 'public' });
        const count = res.threads.size;
        for (const [, t] of res.threads) await addThread(t);
        hasMore = res.hasMore;
        before  = count > 0 ? res.threads.last().id : null;
        page++;
        console.log(`  [threads] #${channel.name} — archived page ${page}: ${count} (hasMore: ${hasMore})`);
        if (!before || !hasMore) break;
        await sleep(300);
      }
    } catch (e) {
      console.warn(`  [threads] Archived fetch failed for #${channel.name}: ${e.message}`);
    }
    try {
      let before = null, hasMore = true;
      while (hasMore) {
        const res = await channel.threads.fetchArchived({ before, limit: 100, type: 'private' });
        for (const [, t] of res.threads) await addThread(t);
        hasMore = res.hasMore;
        before  = res.threads.size > 0 ? res.threads.last().id : null;
        if (!before) break;
        await sleep(300);
      }
    } catch { /* no MANAGE_THREADS */ }
  }

  console.log(`  [threads] #${channel.name} → TOTAL: ${threads.length}`);
  return threads;
}

// ─────────────────────────────────────────────────────────────
//  WRITE FORUM → folder with one TOML per thread
// ─────────────────────────────────────────────────────────────

async function captureAndWriteForum(forum, categoryFolder) {
  const threads = await fetchAllThreads(forum);

  const forumFolderName = `forum-${safeName(forum.name)}`;
  const forumFolder     = path.join(categoryFolder, forumFolderName);
  fs.mkdirSync(forumFolder, { recursive: true });

  // _forum.toml — forum metadata
  writeToml(path.join(forumFolder, '_forum.toml'), {
    id:               forum.id,
    name:             forum.name,
    topic:            forum.topic ?? '',
    nsfw:             forum.nsfw,
    position:         forum.rawPosition,
    threadCount:      threads.length,
    backedUpAt:       new Date().toISOString(),
            availableTags:    forum.availableTags.map(t => t.name),
  });

  // One TOML file per thread/post
  const usedNames = new Set();
  for (const thread of threads) {
    let baseName = safeName(thread.name);
    // Deduplicate filenames
    let fileName = `${baseName}.toml`;
    let counter  = 1;
    while (usedNames.has(fileName)) {
      fileName = `${baseName}_${counter++}.toml`;
    }
    usedNames.add(fileName);

    const threadData = {
      id:                  thread.id,
      name:                thread.name,
      archived:            thread.archived,
      locked:              thread.locked,
      createdAt:           thread.createdAt ? new Date(thread.createdAt).toISOString() : '',
      autoArchiveDuration: thread.autoArchiveDuration,
      messageCount:        thread.messages.length,
      appliedTags:         thread.appliedTags,
      messages:            thread.messages.map(m => ({
        id:           m.id,
        author:       m.author?.username ?? 'Unknown',
        content:      m.content ?? '',
        createdAt:    m.createdAt ? new Date(m.createdAt).toISOString() : '',
                                                     pinned:       m.pinned,
                                                     attachments:  (m.attachments ?? []).map(a => a.url).join(', '),
                                                     thumbnail:    (m.linkPreviews ?? []).find(p => p.image)?.image ?? '',
                                                     linkPreviews: (m.linkPreviews ?? []).map(p => ({
                                                       url:   p.url,
                                                       title: p.title,
                                                       image: p.image,
                                                       site:  p.site,
                                                       desc:  p.desc,
                                                     })),
      })),
    };

    writeToml(path.join(forumFolder, fileName), threadData);
  }

  console.log(`  [forum] ✅ ${forum.name} → ${threads.length} threads saved to ${forumFolderName}/`);

  return {
    folderName:   forumFolderName,
    threadCount:  threads.length,
    messageCount: threads.reduce((s, t) => s + (t.messages?.length || 0), 0),
  };
}

// ─────────────────────────────────────────────────────────────
//  WRITE TEXT CHANNEL → folder with messages.toml
// ─────────────────────────────────────────────────────────────

async function captureAndWriteChannel(ch, categoryFolder) {
  const messages = await fetchMessages(ch);
  const threads  = await fetchAllThreads(ch);

  const chFolderName = `channel-${safeName(ch.name)}`;
  const chFolder     = path.join(categoryFolder, chFolderName);
  fs.mkdirSync(chFolder, { recursive: true });

  // _channel.toml — channel metadata
  writeToml(path.join(chFolder, '_channel.toml'), {
    id:       ch.id,
    name:     ch.name,
    type:     ch.type,
    topic:    ch.topic ?? '',
    nsfw:     ch.nsfw,
    position: ch.rawPosition,
  });

  // messages.toml
  if (messages.length) {
    writeToml(path.join(chFolder, 'messages.toml'), {
      messages: messages.map(m => ({
        id:           m.id,
        author:       m.author?.username ?? 'Unknown',
        content:      m.content ?? '',
        createdAt:    m.createdAt ? new Date(m.createdAt).toISOString() : '',
                                   pinned:       m.pinned,
                                   attachments:  (m.attachments ?? []).map(a => a.url).join(', '),
                                   thumbnail:    (m.linkPreviews ?? []).find(p => p.image)?.image ?? '',
                                   linkPreviews: (m.linkPreviews ?? []).map(p => ({
                                     url:   p.url,
                                     title: p.title,
                                     image: p.image,
                                     site:  p.site,
                                     desc:  p.desc,
                                   })),
      })),
    });
  }

  // One TOML per thread
  const usedNames = new Set();
  for (const thread of threads) {
    let baseName = safeName(thread.name);
    let fileName = `thread-${baseName}.toml`;
    let counter  = 1;
    while (usedNames.has(fileName)) fileName = `thread-${baseName}_${counter++}.toml`;
    usedNames.add(fileName);

    writeToml(path.join(chFolder, fileName), {
      id:        thread.id,
      name:      thread.name,
      archived:  thread.archived,
      createdAt: thread.createdAt ? new Date(thread.createdAt).toISOString() : '',
              messages:  thread.messages.map(m => ({
                author:       m.author?.username ?? 'Unknown',
                content:      m.content ?? '',
                createdAt:    m.createdAt ? new Date(m.createdAt).toISOString() : '',
                                                   attachments:  (m.attachments ?? []).map(a => a.url).join(', '),
                                                   thumbnail:    (m.linkPreviews ?? []).find(p => p.image)?.image ?? '',
                                                   linkPreviews: (m.linkPreviews ?? []).map(p => ({
                                                     url:   p.url,
                                                     title: p.title,
                                                     image: p.image,
                                                     site:  p.site,
                                                     desc:  p.desc,
                                                   })),
              })),
    });
  }

  console.log(`  [channel] ✅ ${ch.name} → ${messages.length} messages, ${threads.length} threads`);
  return { folderName: chFolderName, messageCount: messages.length, threadCount: threads.length };
}

// ─────────────────────────────────────────────────────────────
//  MAIN: createCategoryBackup
// ─────────────────────────────────────────────────────────────

async function createCategoryBackup(guild, categoryId) {
  const category = guild.channels.cache.get(categoryId);
  if (!category || category.type !== ChannelType.GuildCategory) {
    throw new Error(`Category ${categoryId} not found`);
  }

  const folderName   = buildFolderName(guild.name, category.name);
  const folderPath   = path.join(BACKUP_DIR, folderName);
  fs.mkdirSync(folderPath, { recursive: true });

  console.log(`\n📁 Backing up category: ${category.name}`);

  const children = guild.channels.cache
  .filter(c => c.parentId === category.id)
  .sort((a, b) => a.rawPosition - b.rawPosition);

  const subFolders = [];
  let totalThreads = 0, totalMessages = 0, totalForums = 0, totalChannels = 0;

  for (const [, ch] of children) {
    switch (ch.type) {
      case ChannelType.GuildForum:
      case ChannelType.GuildMedia: {
        const r = await captureAndWriteForum(ch, folderPath);
        subFolders.push({ type: 'forum', ...r });
        totalForums++;
        totalThreads  += r.threadCount;
        totalMessages += r.messageCount;
        break;
      }
      case ChannelType.GuildText:
      case ChannelType.GuildAnnouncement: {
        const r = await captureAndWriteChannel(ch, folderPath);
        subFolders.push({ type: 'channel', ...r });
        totalChannels++;
        totalMessages += r.messageCount;
        totalThreads  += r.threadCount;
        break;
      }
      case ChannelType.GuildVoice:
      case ChannelType.GuildStageVoice: {
        // Write a minimal TOML just to document voice channels
        const vFolder = path.join(folderPath, `voice-${safeName(ch.name)}`);
        fs.mkdirSync(vFolder, { recursive: true });
        writeToml(path.join(vFolder, '_channel.toml'), {
          id: ch.id, name: ch.name, type: 'voice',
          bitrate: ch.bitrate, userLimit: ch.userLimit,
        });
        subFolders.push({ type: 'voice', folderName: `voice-${safeName(ch.name)}` });
        totalChannels++;
        break;
      }
      default: break;
    }
  }

  // _category.toml
  writeToml(path.join(folderPath, '_category.toml'), {
    id:          category.id,
    name:        category.name,
    guildId:     guild.id,
    guildName:   guild.name,
    backedUpAt:  new Date().toISOString(),
            stats: {
              totalForums,
              totalChannels,
              totalThreads,
              totalMessages,
            },
            contents: subFolders.map(f => `${f.type}: ${f.folderName}`),
  });

  console.log(`\n✅ Category "${category.name}" done → ${folderName}/`);
  console.log(`   Forums: ${totalForums} | Channels: ${totalChannels} | Threads: ${totalThreads} | Messages: ${totalMessages}\n`);

  return { folderName, folderPath, categoryName: category.name, stats: { totalForums, totalChannels, totalThreads, totalMessages } };
}

async function createBackup(guild, options = {}) {
  const { categoryFilter = null } = options;

  const categories = guild.channels.cache
  .filter(c => c.type === ChannelType.GuildCategory)
  .filter(c => {
    if (!categoryFilter) return true;
    return categoryFilter.some(f => c.id === f || c.name.toLowerCase() === f.toLowerCase());
  })
  .sort((a, b) => a.rawPosition - b.rawPosition);

  const results = [];
  for (const [, cat] of categories) {
    results.push(await createCategoryBackup(guild, cat.id));
  }
  return results;
}

// ─────────────────────────────────────────────────────────────
//  LISTING & MANAGEMENT
// ─────────────────────────────────────────────────────────────

function listBackups(guildId) {
  const entries = [];
  if (!fs.existsSync(BACKUP_DIR)) return entries;
  for (const folder of fs.readdirSync(BACKUP_DIR)) {
    const metaPath = path.join(BACKUP_DIR, folder, '_category.toml');
    if (!fs.existsSync(metaPath)) continue;
    try {
      // Parse minimal fields manually (no toml parser — just regex)
      const raw       = fs.readFileSync(metaPath, 'utf8');
      const guildIdM  = raw.match(/^guildId\s*=\s*"([^"]+)"/m);
      const nameM     = raw.match(/^name\s*=\s*"([^"]+)"/m);
      const guildNameM= raw.match(/^guildName\s*=\s*"([^"]+)"/m);
      const dateM     = raw.match(/^backedUpAt\s*=\s*"([^"]+)"/m);
      if (guildIdM?.[1] !== guildId) continue;
      entries.push({
        folder,
        name:       nameM?.[1]      ?? folder,
        guildName:  guildNameM?.[1] ?? '',
        backedUpAt: dateM?.[1]      ? new Date(dateM[1]).getTime() : 0,
                   rawMeta:    raw,
      });
    } catch { /* skip corrupt */ }
  }
  return entries.sort((a, b) => b.backedUpAt - a.backedUpAt);
}

function deleteBackup(folder) {
  const p = path.join(BACKUP_DIR, folder);
  if (!fs.existsSync(p)) return false;
  fs.rmSync(p, { recursive: true, force: true });
  return true;
}

module.exports = {
  createBackup,
  createCategoryBackup,
  listBackups,
  deleteBackup,
  logLogin,
};
