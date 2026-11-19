# Falcon Bot

**Invite Tracker + MCFA Account Giver**

A simple Discord.js bot that rewards users with MCFA accounts when they reach **2 invites**.

---

## Features

| Command       | Who can use   | Description                                      |
|---------------|---------------|--------------------------------------------------|
| `/claim`      | Everyone      | Claim 1 MCFA account (costs 2 invites)           |
| `/channel`    | Admin         | Set the only channel where `/claim` is allowed   |
| `/mcfa`       | Admin         | Add an MCFA account to the stock                 |
| `/invites`    | Everyone      | Check invite count of yourself or another user   |
| `/stock`      | Admin         | See how many accounts are left                   |

- Automatic invite tracking (counts joins via invite links)
- Accounts are stored in `data/accounts.json`
- Invite counts stored in `data/invites.json`
- Claim channel setting stored in `data/settings.json`

---

## Setup

### 1. Requirements
- Node.js **18+**
- A Discord bot application from the [Discord Developer Portal](https://discord.com/developers/applications)

### 2. Create the bot
1. Go to Discord Developer Portal → New Application → name it **Falcon**
2. Go to **Bot** tab → Reset Token → copy the token
3. Enable these **Privileged Gateway Intents**:
   - Server Members Intent
   - (Message Content Intent is not required)
4. Go to **OAuth2 → URL Generator**:
   - Scopes: `bot` + `applications.commands`
   - Bot Permissions: `Manage Server` (or at least `Create Instant Invite` + view members), `Send Messages`, `Embed Links`
5. Invite the bot to your server with the generated URL

### 3. Configure the bot
```bash
cd Falcon-Bot
cp config.example.json config.json
```

Edit `config.json`:
```json
{
  "token": "YOUR_BOT_TOKEN",
  "clientId": "YOUR_APPLICATION_CLIENT_ID",
  "guildId": "YOUR_SERVER_ID"
}
```

### 4. Install & run (local)
```bash
npm install
node deploy-commands.js   # registers the slash commands
npm start                 # starts the bot
```

---

## Deploy on Render (from GitHub)

1. Push this whole folder to a **GitHub repository**.
2. Go to [render.com](https://render.com) → **New +** → **Blueprint**
3. Connect your GitHub repo (it will detect `render.yaml`).
4. After the service is created, go to **Environment** and add these secrets:

| Key              | Value                  |
|------------------|------------------------|
| `DISCORD_TOKEN`  | Your bot token         |
| `CLIENT_ID`      | Your Application ID    |
| `GUILD_ID`       | Your Discord Server ID |

5. Click **Manual Deploy** (or it will auto-deploy).

The bot runs as a **Background Worker** (free plan works fine).

> **Important:** After the first deploy, run the slash command deployment once.  
> Easiest way: temporarily change the start command to `node deploy-commands.js && node index.js`, deploy once, then change it back to `node index.js`.

---

## How to use (Admin)

1. Set the claim channel:
   ```
   /channel channel:#claim-here
   ```

2. Add MCFA accounts (the message will be sent to the user when they claim):
   ```
   /mcfa message:Email: example@gmail.com | Password: YourPass123 | Note: Change password after login
   ```

3. Users invite friends → when they reach 2 invites they run `/claim` in the designated channel.

---

## Notes

- Invite counts only increase when someone **joins** through an invite created by that user.
- Leaving and re-joining does **not** give extra invites.
- Accounts are given in FIFO order (first added = first given).
- The account message is sent via DM when possible (falls back to ephemeral reply if DMs are closed).

---

**Falcon Bot** – simple & ready to run.
