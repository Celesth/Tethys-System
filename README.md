# 🗄️ Discord Advanced Backup Bot

A powerful Discord.js v14 bot for backing up and restoring your entire server — including **categories, forums, threads (active + archived), messages, roles, and permissions**.

---

## 📦 Features

| Feature | Details |
|---|---|
| **Category backup** | Captures all channels inside a category |
| **Forum channels** | Backs up all forum posts (active + archived) with messages |
| **Threads** | Active, archived, and private threads inside text channels |
| **Messages** | Up to 100 messages per channel/thread via webhook restore |
| **Permissions** | Role & member permission overwrites per channel |
| **Roles** | All non-managed roles with permissions, colors, hoisting |
| **Partial backup** | Filter by specific category names or IDs |
| **Confirmation prompts** | Button-based confirm/cancel for destructive actions |
| **JSON storage** | Backups saved locally as structured JSON files |

---

## 🚀 Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your DISCORD_TOKEN, CLIENT_ID, and optionally GUILD_ID
```

### 3. Enable required intents
In the [Discord Developer Portal](https://discord.com/developers/applications):
- Go to your app → **Bot** tab
- Enable: `Server Members Intent`, `Message Content Intent`

### 4. Invite the bot
Your bot needs these permissions:
- `Administrator` (recommended) or at minimum:
  - Manage Channels, Manage Roles, Manage Webhooks
  - Read Message History, View Channel
  - Send Messages, Manage Messages

### 5. Deploy slash commands
```bash
npm run deploy
```

### 6. Start the bot
```bash
npm start
```

---

## 🎮 Commands

### `/backup-create`
Create a server backup.

| Option | Description |
|---|---|
| `name` | Custom label for this backup |
| `categories` | Comma-separated category names/IDs to limit scope |
| `messages` | Include message history (default: true) |
| `roles` | Include roles (default: true) |

**Examples:**
```
/backup-create
/backup-create name:Pre-Redesign
/backup-create categories:Support,General messages:false
/backup-create categories:1234567890123456789
```

---

### `/backup-list`
View all backups for this server with stats.

---

### `/backup-info id:<backup_id>`
View detailed info about a specific backup including a full category breakdown.

---

### `/backup-restore id:<backup_id>`
Restore a backup to the current server.

| Option | Description |
|---|---|
| `id` | Backup ID (from `/backup-list`) |
| `clear` | Delete all existing channels/roles first (DANGEROUS) |
| `roles` | Restore roles (default: true) |
| `categories` | Only restore specific categories |

> ⚠️ Uses confirmation button before executing.

---

### `/backup-delete id:<backup_id>`
Permanently delete a backup file.

---

## 📁 Project Structure

```
discord-backup-bot/
├── index.js                   # Bot entry point
├── deploy-commands.js         # Slash command registration
├── package.json
├── .env.example
├── models/
│   └── BackupModel.js         # Data schemas (BackupModel, CategoryBackup,
│                              #   ChannelBackup, ForumBackup, ThreadBackup,
│                              #   MessageBackup, RoleBackup)
├── services/
│   └── BackupService.js       # Core capture & restore logic
├── commands/
│   ├── backup-create.js
│   ├── backup-list.js
│   ├── backup-info.js
│   ├── backup-restore.js
│   └── backup-delete.js
├── events/
│   ├── ready.js
│   └── interactionCreate.js
└── backups/                   # Auto-created, stores JSON backup files
```

---

## 🧩 Backup Data Model

```
BackupModel
├── settings          (guild name, icon, notification settings, etc.)
├── roles[]           (RoleBackup)
├── emojis[]
├── categories[]      (CategoryBackup)
│   ├── channels[]    (ChannelBackup — text, voice, announcements)
│   │   ├── messages[]  (MessageBackup)
│   │   └── threads[]   (ThreadBackup — active + archived)
│   │       └── messages[]
│   └── forums[]      (ForumBackup)
│       └── threads[]   (ThreadBackup — forum posts, active + archived)
│           └── messages[]
└── orphanChannels[]  (channels not in any category)
```

---

## ⚙️ Configuration

Edit `services/BackupService.js` to adjust:
- `MAX_MESSAGES` — messages captured per channel/thread (default: 100)
- Sleep delays between API calls (to avoid rate limits)

---

## 📝 Notes

- Backups are stored in `./backups/` as `{guildId}_{backupId}.json`
- Message restore uses **webhooks** to preserve author names/avatars
- Private thread backup requires the `MANAGE_THREADS` permission
- Restoring to a different server requires the backup's `guildId` to match — for cross-server restore, modify `restoreBackup()` to accept a custom guild ID
