import { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import http from "http";
import crypto from "crypto";
import fetch from "node-fetch";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

// MongoDB setup
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017";
const mongoClient = new MongoClient(MONGO_URI);
let db;

// Self-ping to keep Render free tier active
const RENDER_URL = process.env.RENDER_URL;
const PING_INTERVAL = 14 * 60 * 1000; // 14 minutes to avoid Render's 15-minute inactivity limit

if (RENDER_URL) {
  setInterval(async () => {
    try {
      await fetch(RENDER_URL);
      console.log(`[${new Date().toISOString()}] Self-ping successful.`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Self-ping error: ${error.message}`);
    }
  }, PING_INTERVAL);
} else {
  console.warn("RENDER_URL environment variable is not set. Self-ping will not work.");
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      status: "Bot is running!",
      bot: client.user?.tag || "Connecting...",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    }),
  );
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] 🌐 HTTP server running on port ${PORT}`);
});

class MinePredictor {
  constructor(
    width = 5,
    height = 5,
    safeMines = 1,
    serverSeedHash = null,
    nonce = null,
    website = "rollbet",
    method = "advanced",
  ) {
    this.width = width;
    this.height = height;
    this.safeMines = safeMines;
    this.mines = 25 - safeMines;
    this.serverSeedHash = serverSeedHash || this.generateServerSeedHash();
    this.nonce = nonce || Math.floor(Math.random() * 1000000);
    this.website = website;
    this.method = method;
    this.grid = [];
    this.heatMap = this.generateHeatMap();
    this.generatePredictionGrid();
  }

  generateServerSeedHash() {
    const serverSeed = crypto.randomBytes(32).toString("hex");
    return crypto.createHash("sha256").update(serverSeed).digest("hex");
  }

  generatePredictionGrid() {
    this.generateRollbetGrid();
  }

  generateHeatMap() {
    const heatMap = new Array(25).fill(0.04);
    const centerPositions = [6, 7, 8, 11, 12, 13, 16, 17, 18];
    centerPositions.forEach((pos) => (heatMap[pos] += 0.02));
    const total = heatMap.reduce((sum, val) => sum + val, 0);
    return heatMap.map((val) => val / total);
  }

  updateHeatMap(actualMines) {
    actualMines.forEach((pos) => {
      this.heatMap[pos] = Math.min(this.heatMap[pos] + 0.01, 0.1);
    });
    const total = this.heatMap.reduce((sum, val) => sum + val, 0);
    this.heatMap = this.heatMap.map((val) => val / total);
  }

  generateRollbetGrid(serverSeed = this.serverSeedHash) {
    const rollbetSeed = `rollbet:${serverSeed}:${this.nonce}:${this.safeMines}`;
    const hash = crypto.createHash("sha512").update(rollbetSeed).digest("hex");

    this.grid = Array(this.height)
      .fill()
      .map(() => Array(this.width).fill(false));

    const positions = [];
    let hashIndex = 0;
    while (positions.length < this.mines) {
      const chunk = hash.substr((hashIndex * 16) % (hash.length - 16), 16);
      const value = Number.parseInt(chunk, 16) / 0xffffffffffffffff;
      let cumulative = 0;
      for (let i = 0; i < 25; i++) {
        cumulative += this.heatMap[i];
        if (value <= cumulative && !positions.includes(i)) {
          positions.push(i);
          break;
        }
      }
      hashIndex++;
    }

    positions.forEach((pos) => {
      const x = pos % this.width;
      const y = Math.floor(pos / this.width);
      this.grid[y][x] = true;
    });
  }

  verifySubmission(clientSeed, nonce, numMines, minePositions, serverSeedHash) {
    const rollbetSeed = `${serverSeedHash}:${clientSeed}:${nonce}:${numMines}`;
    const hash = crypto.createHash("sha512").update(rollbetSeed).digest("hex");

    const tempGrid = Array(this.height)
      .fill()
      .map(() => Array(this.width).fill(false));
    const positions = [];
    let hashIndex = 0;
    while (positions.length < numMines) {
      const chunk = hash.substr((hashIndex * 16) % (hash.length - 16), 16);
      const value = Number.parseInt(chunk, 16) / 0xffffffffffffffff;
      const pos = Math.floor(value * 25);
      if (!positions.includes(pos)) {
        positions.push(pos);
      }
      hashIndex++;
    }

    const isValid =
      minePositions.length === numMines &&
      minePositions.every((pos) => positions.includes(pos)) &&
      minePositions.every((pos) => pos >= 0 && pos < 25) &&
      new Set(minePositions).size === minePositions.length;

    if (isValid) {
      positions.forEach((pos) => {
        const x = pos % this.width;
        const y = Math.floor(pos / this.width);
        tempGrid[y][x] = true;
      });
      this.updateHeatMap(minePositions);
    }

    return {
      isValid,
      actualMines: positions,
      actualGrid: tempGrid,
      error: isValid ? null : "Submitted mine positions do not match the computed game outcome or are invalid",
    };
  }

  getGridDisplay(grid = this.grid) {
    const emojis = {
      mine: "💣",
      safe: "🟩",
      number: ["⬛", "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣"],
    };

    let display = "";
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (grid[y][x]) {
          display += emojis.mine;
        } else {
          const adjacentMines = this.countAdjacentMines(x, y, grid);
          if (adjacentMines > 0) {
            display += emojis.number[adjacentMines];
          } else {
            display += emojis.safe;
          }
        }
      }
      display += "\n";
    }
    return display;
  }

  countAdjacentMines(x, y, grid = this.grid) {
    let count = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
          if (grid[ny][nx]) count++;
        }
      }
    }
    return count;
  }

  getAnalysis() {
    return {
      patternType: "Heatmap-based",
      method: this.method,
      riskLevel: this.mines <= 5 ? "Low" : this.mines <= 15 ? "Medium" : "High",
      entropyScore: Math.floor(Math.random() * 20) + 80,
    };
  }

  getVerificationData() {
    return {
      serverSeedHash: this.serverSeedHash,
      nonce: this.nonce,
      safeMines: this.safeMines,
      website: this.website,
      hash: crypto.createHash("sha256").update(`${this.website}:${this.serverSeedHash}:${this.nonce}`).digest("hex"),
    };
  }
}

const verifiedUsers = new Map();
const predictions = new Map();
const submissions = new Map();
const usedServerSeeds = new Map();
const bannedUsers = new Map();
const ADMIN_USER_IDS = ["862245514313203712", "1321546526790651967"];

async function saveVerifiedUsers() {
  try {
    const collection = db.collection("verifiedUsers");
    const users = Array.from(verifiedUsers.entries()).map(([userId, data]) => ({ userId, ...data }));
    await collection.deleteMany({});
    if (users.length > 0) {
      await collection.insertMany(users);
    }
    console.log(`[${new Date().toISOString()}] Saved ${users.length} verifiedUsers to MongoDB`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Failed to save verifiedUsers: ${error.message}`);
  }
}

async function loadVerifiedUsers() {
  try {
    const collection = db.collection("verifiedUsers");
    const users = await collection.find({}).toArray();
    verifiedUsers.clear();
    users.forEach(({ userId, expires }) => verifiedUsers.set(userId, { expires }));
    console.log(`[${new Date().toISOString()}] Loaded ${verifiedUsers.size} verifiedUsers from MongoDB`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Failed to load verifiedUsers: ${error.message}`);
    ADMIN_USER_IDS.forEach((userId) => verifiedUsers.set(userId, { expires: null }));
    await saveVerifiedUsers();
  }
}

function validateResultInputs(serverSeedHash, clientSeed, nonce, numMines, minePositions) {
  const errors = [];
  if (!/^[0-9a-fA-F]{64}$/.test(serverSeedHash)) {
    errors.push("Server seed hash must be a 64-character hex string (0-9, a-f).");
  }
  if (!clientSeed || clientSeed.length < 1) {
    errors.push("Client seed must be a non-empty string.");
  }
  if (!Number.isInteger(nonce) || nonce < 0) {
    errors.push("Nonce must be a non-negative integer.");
  }
  if (!Number.isInteger(numMines) || numMines < 1 || numMines > 24) {
    errors.push("Number of mines must be an integer between 1 and 24.");
  }
  if (!minePositions || minePositions.length === 0) {
    errors.push(`Mine positions must contain exactly ${numMines} unique integers between 0 and 24.`);
  } else {
    const parsedPositions = minePositions.split(",").map((pos) => parseInt(pos.trim()));
    if (parsedPositions.some((pos) => isNaN(pos) || pos < 0 || pos > 24)) {
      errors.push("All mine positions must be integers between 0 and 24.");
    }
    if (parsedPositions.length !== numMines) {
      errors.push(`Mine positions must contain exactly ${numMines} integers.`);
    }
    if (new Set(parsedPositions).size !== parsedPositions.length) {
      errors.push("Mine positions must be unique.");
    }
  }
  return {
    isValid: errors.length === 0,
    errors,
    parsedPositions: minePositions ? minePositions.split(",").map((pos) => parseInt(pos.trim())) : [],
  };
}

function checkSpamAndRepetition(userId, minePositions) {
  const userSubmissions = submissions.get(userId) || { count: 0, lastSubmission: 0, timestamps: [], positions: [] };
  const now = Date.now();
  userSubmissions.timestamps = userSubmissions.timestamps.filter((ts) => now - ts < 20000);
  userSubmissions.timestamps.push(now);
  const sortedPositions = minePositions.sort((a, b) => a - b).join(",");
  userSubmissions.positions.push(sortedPositions);
  userSubmissions.positions = userSubmissions.positions.slice(-4);
  if (userSubmissions.timestamps.length >= 5) {
    return { isValid: false, reason: "Submitting too many results in a short time (5+ in 20 seconds)." };
  }
  const positionCounts = {};
  userSubmissions.positions.forEach((pos) => {
    positionCounts[pos] = (positionCounts[pos] || 0) + 1;
    if (positionCounts[pos] > 3) {
      return { isValid: false, reason: "Submitting the same mine positions more than three times." };
    }
  });
  submissions.set(userId, userSubmissions);
  return { isValid: true };
}

function cleanExpiredUsers() {
  const now = Date.now();
  let changed = false;
  for (const [userId, data] of verifiedUsers.entries()) {
    if (data.expires && now > data.expires) {
      console.log(`[${new Date().toISOString()}] Removing expired user access: ${userId}`);
      verifiedUsers.delete(userId);
      changed = true;
    }
  }
  if (changed) {
    saveVerifiedUsers();
  }
}

function validateInputs(serverSeedHash, safeMines, nonce) {
  const errors = [];
  if (!/^[0-9a-fA-F]{64}$/.test(serverSeedHash)) {
    errors.push("Server seed hash must be a 64-character hex string (0-9, a-f).");
  }
  if (!Number.isInteger(safeMines) || safeMines < 1 || safeMines > 24) {
    errors.push("Number of safe mines must be an integer between 1 and 24.");
  }
  if (!Number.isInteger(nonce) || nonce < 0) {
    errors.push("Nonce must be a non-negative integer.");
  }
  return {
    isValid: errors.length === 0,
    errors,
  };
}

client.once("ready", async () => {
  try {
    await mongoClient.connect();
    db = mongoClient.db("mines");
    console.log(`[${new Date().toISOString()}] Connected to MongoDB`);
    await loadVerifiedUsers();
    console.log(`[${new Date().toISOString()}] 🤖 ${client.user.tag} is online and ready to predict mines!`);

    const commands = [
      new SlashCommandBuilder()
        .setName("verify")
        .setDescription("Admin command to grant a user access to mine prediction service")
        .addStringOption((option) =>
          option.setName("user_id").setDescription("User ID to grant access to").setRequired(true),
        )
        .addIntegerOption((option) =>
          option
            .setName("duration")
            .setDescription("Access duration in hours (leave empty for permanent)")
            .setRequired(false),
        ),
      new SlashCommandBuilder()
        .setName("bulk-verify")
        .setDescription("Admin command to verify multiple users")
        .addStringOption((option) =>
          option
            .setName("user_ids")
            .setDescription("Comma-separated user IDs to grant access to")
            .setRequired(true),
        )
        .addIntegerOption((option) =>
          option
            .setName("duration")
            .setDescription("Access duration in hours (leave empty for permanent)")
            .setRequired(false),
        ),
      new SlashCommandBuilder()
        .setName("emergency-verify")
        .setDescription("Emergency admin command to force verify a user")
        .addStringOption((option) =>
          option.setName("user_id").setDescription("User ID to grant access to").setRequired(true),
        ),
      new SlashCommandBuilder()
        .setName("predict")
        .setDescription("Predict mine locations using your provably fair seeds")
        .addStringOption((option) =>
          option
            .setName("server_seed_hash")
            .setDescription("Server seed hash (64 character hex string)")
            .setRequired(true),
        )
        .addIntegerOption((option) =>
          option.setName("safe_mines").setDescription("Number of safe mines (1-24)").setRequired(true),
        )
        .addIntegerOption((option) => option.setName("nonce").setDescription("Nonce value (integer)").setRequired(true)),
      new SlashCommandBuilder()
        .setName("submitresult")
        .setDescription("Submit game result to improve prediction accuracy")
        .addStringOption((option) =>
          option.setName("server_seed_hash").setDescription("Hashed server seed (64 character hex string)").setRequired(true),
        )
        .addStringOption((option) =>
          option.setName("client_seed").setDescription("Active client seed (e.g., VqsjloxT6b)").setRequired(true),
        )
        .addIntegerOption((option) =>
          option.setName("nonce").setDescription("Amount of bets with per seed (e.g., 3002)").setRequired(true),
        )
        .addIntegerOption((option) =>
          option.setName("num_mines").setDescription("Number of mines in the game (1-24)").setRequired(true),
        )
        .addStringOption((option) =>
          option.setName("mine_positions").setDescription("Comma-separated mine positions (e.g., 3,7,12,18,22)").setRequired(true),
        ),
      new SlashCommandBuilder()
        .setName("howtosubmitresult")
        .setDescription("Learn how to submit game results and why it matters")
        .setDefaultMemberPermissions(0),
      new SlashCommandBuilder()
        .setName("myresults")
        .setDescription("View how many game results you have submitted")
        .setDefaultMemberPermissions(0),
      new SlashCommandBuilder()
        .setName("leaderboard")
        .setDescription("View the leaderboard of top result submitters")
        .setDefaultMemberPermissions(0),
      new SlashCommandBuilder()
        .setName("admin")
        .setDescription("Admin panel for managing verification system")
        .addSubcommand((subcommand) => subcommand.setName("stats").setDescription("View verification statistics"))
        .addSubcommand((subcommand) =>
          subcommand
            .setName("unban")
            .setDescription("Unban a user from submitting results")
            .addStringOption((option) => option.setName("user_id").setDescription("User ID to unban").setRequired(true)),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("revoke")
            .setDescription("Revoke a user's access to the prediction service")
            .addStringOption((option) => option.setName("user_id").setDescription("User ID to revoke access").setRequired(true)),
        ),
    ];

    await client.application.commands.set(commands);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Bot startup error: ${error.message}`);
    process.exit(1);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "predict" || interaction.commandName === "submitresult") {
    try {
      await interaction.deferReply();
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Failed to defer reply: ${error.message}`);
      return;
    }
  }

  const { commandName } = interaction;

  if (commandName === "verify" || commandName === "emergency-verify" || commandName === "bulk-verify") {
    if (!ADMIN_USER_IDS.includes(interaction.user.id)) {
      const unauthorizedEmbed = new EmbedBuilder()
        .setColor("#E74C3C")
        .setTitle("🚫 Access Denied")
        .setDescription("**You are not authorized to use this command**")
        .setTimestamp();
      await interaction.reply({ embeds: [unauthorizedEmbed], ephemeral: true });
      return;
    }

    try {
      if (commandName === "verify" || commandName === "emergency-verify") {
        const userId = interaction.options.getString("user_id");
        const duration = commandName === "verify" ? interaction.options.getInteger("duration") : null;
        const expires = duration ? Date.now() + duration * 60 * 60 * 1000 : null;

        if (!/^\d{17,19}$/.test(userId)) {
          const invalidEmbed = new EmbedBuilder()
            .setColor("#E74C3C")
            .setTitle("❌ Invalid User ID")
            .setDescription("**The provided user ID is invalid**")
            .addFields({
              name: "🔧 Troubleshooting",
              value: "Ensure the user ID is a valid Discord user ID (17-19 digits).",
              inline: false,
            })
            .setTimestamp();
          await interaction.reply({ embeds: [invalidEmbed], ephemeral: true });
          return;
        }

        verifiedUsers.set(userId, { expires });
        await saveVerifiedUsers();

        const successEmbed = new EmbedBuilder()
          .setColor("#27AE60")
          .setTitle("✅ User Verified")
          .setDescription(`**Access granted to <@${userId}>**`)
          .addFields({
            name: "🎯 Access Granted",
            value: "The user can now use the `/predict` command to analyze mine patterns.",
            inline: false,
          })
          .addFields({
            name: "⏰ Access Duration",
            value: expires ? `Expires <t:${Math.floor(expires / 1000)}:R>` : "Permanent access",
            inline: false,
          })
          .setTimestamp()
          .setFooter({ text: "Admin Panel • User Verification" });

        await interaction.reply({ embeds: [successEmbed], ephemeral: true });

        try {
          const user = await client.users.fetch(userId);
          const userEmbed = new EmbedBuilder()
            .setColor("#27AE60")
            .setTitle("✅ Verification Successful")
            .setDescription("**You have been granted access to the mine prediction service!**")
            .addFields({
              name: "🎯 Access Granted",
              value: "You can now use the `/predict` command to analyze mine patterns.",
              inline: false,
            })
            .addFields({
              name: "⏰ Access Duration",
              value: expires ? `Expires <t:${Math.floor(expires / 1000)}:R>` : "Permanent access",
              inline: false,
            })
            .setTimestamp()
            .setFooter({ text: "Professional Mine Prediction Service" });
          await user.send({ embeds: [userEmbed] });
        } catch (error) {
          await interaction.followUp({
            content: `Access granted, but could not notify <@${userId}> (DMs may be closed or user not found).`,
            ephemeral: true,
          });
        }
      } else if (commandName === "bulk-verify") {
        const userIdsString = interaction.options.getString("user_ids");
        const duration = interaction.options.getInteger("duration");
        const expires = duration ? Date.now() + duration * 60 * 60 * 1000 : null;
        const userIds = userIdsString.split(",").map((id) => id.trim()).filter((id) => /^\d{17,19}$/.test(id));

        if (userIds.length === 0) {
          const invalidEmbed = new EmbedBuilder()
            .setColor("#E74C3C")
            .setTitle("❌ Invalid User IDs")
            .setDescription("**No valid user IDs provided**")
            .addFields({
              name: "🔧 Troubleshooting",
              value: "Provide comma-separated valid Discord user IDs (17-19 digits).",
              inline: false,
            })
            .setTimestamp();
          await interaction.reply({ embeds: [invalidEmbed], ephemeral: true });
          return;
        }

        userIds.forEach((userId) => verifiedUsers.set(userId, { expires }));
        await saveVerifiedUsers();

        const successEmbed = new EmbedBuilder()
          .setColor("#27AE60")
          .setTitle("✅ Users Verified")
          .setDescription(`**Access granted to ${userIds.length} users**`)
          .addFields({
            name: "🎯 Users",
            value: userIds.map((id) => `<@${id}>`).join(", "),
            inline: false,
          })
          .addFields({
            name: "⏰ Access Duration",
            value: expires ? `Expires <t:${Math.floor(expires / 1000)}:R>` : "Permanent access",
            inline: false,
          })
          .setTimestamp()
          .setFooter({ text: "Admin Panel • Bulk Verification" });

        await interaction.reply({ embeds: [successEmbed], ephemeral: true });

        for (const userId of userIds) {
          try {
            const user = await client.users.fetch(userId);
            const userEmbed = new EmbedBuilder()
              .setColor("#27AE60")
              .setTitle("✅ Verification Successful")
              .setDescription("**You have been granted access to the mine prediction service!**")
              .addFields({
                name: "🎯 Access Granted",
                value: "You can now use the `/predict` command to analyze mine patterns.",
                inline: false,
              })
              .addFields({
                name: "⏰ Access Duration",
                value: expires ? `Expires <t:${Math.floor(expires / 1000)}:R>` : "Permanent access",
                inline: false,
              })
              .setTimestamp()
              .setFooter({ text: "Professional Mine Prediction Service" });
            await user.send({ embeds: [userEmbed] });
          } catch (error) {
            await interaction.followUp({
              content: `Access granted, but could not notify <@${userId}> (DMs may be closed or user not found).`,
              ephemeral: true,
            });
          }
        }
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ${commandName} error: ${error.message}`);
      const errorEmbed = new EmbedBuilder()
        .setColor("#E74C3C")
        .setTitle("❌ Verification Error")
        .setDescription("**An error occurred while processing the verification**")
        .addFields({
          name: "🔧 Troubleshooting",
          value: "Please try again or contact support if the issue persists.",
          inline: false,
        })
        .setTimestamp();
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
    return;
  }

  if (commandName === "admin") {
    if (!ADMIN_USER_IDS.includes(interaction.user.id)) {
      const unauthorizedEmbed = new EmbedBuilder()
        .setColor("#E74C3C")
        .setTitle("🚫 Access Denied")
        .setDescription("**You are not authorized to use admin commands**")
        .setTimestamp();
      await interaction.reply({ embeds: [unauthorizedEmbed], ephemeral: true });
      return;
    }

    try {
      const subcommand = interaction.options.getSubcommand();
      if (subcommand === "stats") {
        cleanExpiredUsers();
        const verifiedUsersList =
          verifiedUsers.size > 0
            ? Array.from(verifiedUsers.entries())
              .map(([userId, data]) => {
                const expiryText = data.expires ? `(expires <t:${Math.floor(data.expires / 1000)}:R>)` : "(permanent)";
                return `<@${userId}> ${expiryText}`;
              })
              .join("\n")
            : "No verified users";

        const statsEmbed = new EmbedBuilder()
          .setColor("#9B59B6")
          .setTitle("📊 Verification System Statistics")
          .setDescription("**Current system status and metrics**")
          .addFields(
            {
              name: "✅ Verified Users",
              value: `${verifiedUsers.size} users\n${verifiedUsersList}`,
              inline: false,
            },
            {
              name: "📤 Total Submissions",
              value: `${submissions.size} users, ${Array.from(submissions.values()).reduce((sum, data) => sum + data.count, 0)} submissions`,
              inline: true,
            },
            {
              name: "🚫 Banned Users",
              value: `${bannedUsers.size} users`,
              inline: true,
            },
            {
              name: "🤖 Bot Status",
              value: "Online & Active",
              inline: true,
            },
            {
              name: "⏱️ System Uptime",
              value: `${Math.floor(process.uptime() / 60)} minutes`,
              inline: false,
            },
          )
          .setTimestamp()
          .setFooter({ text: "Admin Panel • System Statistics" });

        await interaction.reply({ embeds: [statsEmbed], ephemeral: true });
      } else if (subcommand === "unban") {
        const userId = interaction.options.getString("user_id");
        if (bannedUsers.has(userId)) {
          bannedUsers.delete(userId);
          await interaction.reply({ content: `User <@${userId}> has been unbanned.`, ephemeral: true });
        } else {
          await interaction.reply({ content: `User <@${userId}> is not banned.`, ephemeral: true });
        }
      } else if (subcommand === "revoke") {
        const userId = interaction.options.getString("user_id");
        if (verifiedUsers.has(userId)) {
          verifiedUsers.delete(userId);
          await saveVerifiedUsers();
          await interaction.reply({ content: `Access revoked for <@${userId}>.`, ephemeral: true });
        } else {
          await interaction.reply({ content: `<@${userId}> does not have access.`, ephemeral: true });
        }
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Admin command error: ${error.message}`);
      const errorEmbed = new EmbedBuilder()
        .setColor("#E74C3C")
        .setTitle("❌ Admin Command Error")
        .setDescription("**An error occurred while processing the admin command**")
        .addFields({
          name: "🔧 Troubleshooting",
          value: "Please try again or contact support if the issue persists.",
          inline: false,
        })
        .setTimestamp();
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
    return;
  }

  if (commandName === "predict") {
    try {
      cleanExpiredUsers();
      const userData = verifiedUsers.get(interaction.user.id);
      if (!userData) {
        const verificationRequiredEmbed = new EmbedBuilder()
          .setColor("#F39C12")
          .setTitle("🔒 Verification Required")
          .setDescription("**You must be verified by an admin to use the mine prediction service**")
          .addFields({
            name: "🎯 Get Access",
            value: "Contact an admin to be verified using the `/verify` command with your user ID.",
            inline: false,
          })
          .addFields({
            name: "📞 Contact Admin",
            value: "Reach out in the support channel or DM an admin with your user ID.",
            inline: false,
          })
          .setTimestamp()
          .setFooter({ text: "Professional Mine Prediction Service • Verification Required" });
        await interaction.editReply({ embeds: [verificationRequiredEmbed] });
        return;
      }

      const serverSeedHash = interaction.options.getString("server_seed_hash");
      const safeMines = interaction.options.getInteger("safe_mines");
      const nonce = interaction.options.getInteger("nonce");

      const validation = validateInputs(serverSeedHash, safeMines, nonce);
      if (!validation.isValid) {
        const errorEmbed = new EmbedBuilder()
          .setColor("#E74C3C")
          .setTitle("❌ Invalid Analysis Parameters")
          .setDescription("**Input validation failed - please check your parameters**")
          .addFields({
            name: "❗ Validation Errors",
            value: validation.errors.join("\n"),
            inline: false,
          })
          .addFields({
            name: "✅ Required Format",
            value:
              "**Server Seed Hash:** 64 character hex string (0-9, a-f)\n**Safe Mines:** Integer between 1-24\n**Nonce:** Positive integer (1-999999999)",
            inline: false,
          })
          .addFields({
            name: "📝 Example",
            value: "Server Hash: `a1b2c3d4e5f6...` (64 chars)\nSafe Mines: `5`\nNonce: `12345`",
            inline: false,
          })
          .setTimestamp();
        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }

      const predictor = new MinePredictor(5, 5, safeMines, serverSeedHash, nonce);
      const verification = predictor.getVerificationData();
      const analysis = predictor.getAnalysis();

      predictions.set(interaction.user.id, {
        serverSeedHash,
        safeMines,
        nonce,
        grid: predictor.grid,
        timestamp: Date.now(),
      });

      const embed = new EmbedBuilder()
        .setColor("#2C3E50")
        .setTitle("🔮 Advanced Mine Pattern Predictions")
        .setDescription(`**${analysis.method.charAt(0).toUpperCase() + analysis.method.slice(1)} Analysis for Rollbet**`)
        .addFields(
          {
            name: "🎯 Prediction Method",
            value: `Algorithm: ${analysis.patternType}\nMethod: ${analysis.method.charAt(0).toUpperCase() + analysis.method.slice(1)}\nWebsite: Rollbet`,
            inline: true,
          },
          {
            name: "📊 Analysis Data",
            value: `Grid: 5×5\nSafe Mines: ${safeMines}\nDangerous Mines: ${predictor.mines}\nRisk Level: ${analysis.riskLevel}`,
            inline: true,
          },
          {
            name: "🔑 Seed Information",
            value: `Server Hash: \`${serverSeedHash.substring(0, 8)}...\`\nNonce: ${nonce}\nEntropy: ${analysis.entropyScore}%`,
            inline: true,
          },
          {
            name: "🎯 Predicted Mine Locations",
            value: `\`\`\`\n${predictor.getGridDisplay()}\`\`\``,
            inline: false,
          },
          {
            name: "🔍 Verification Signature",
            value: `\`${verification.hash}\``,
            inline: false,
          },
        )
        .setFooter({
          text: `Professional Mine Prediction Service • ${analysis.method.charAt(0).toUpperCase() + analysis.method.slice(1)} Algorithm v5.3`,
        });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Prediction error: ${error.message}`);
      const errorEmbed = new EmbedBuilder()
        .setColor("#E74C3C")
        .setTitle("❌ Prediction Error")
        .setDescription("**An unexpected error occurred while processing your request**")
        .addFields({
          name: "🔧 Troubleshooting",
          value: "Please ensure all parameters are correct and try again. If the issue persists, contact an admin.",
          inline: false,
        })
        .setTimestamp();
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  if (commandName === "submitresult") {
    try {
      cleanExpiredUsers();
      const userData = verifiedUsers.get(interaction.user.id);
      if (!userData) {
        const verificationRequiredEmbed = new EmbedBuilder()
          .setColor("#F39C12")
          .setTitle("🔒 Verification Required")
          .setDescription("**You must be verified by an admin to use this feature**")
          .setTimestamp();
        await interaction.editReply({ embeds: [verificationRequiredEmbed] });
        return;
      }

      if (bannedUsers.has(interaction.user.id)) {
        const banEmbed = new EmbedBuilder()
          .setColor("#E74C3C")
          .setTitle("🚫 Access Denied")
          .setDescription("**You are temporarily banned from submitting results due to abuse**")
          .setTimestamp();
        await interaction.editReply({ embeds: [banEmbed] });
        return;
      }

      const serverSeedHash = interaction.options.getString("server_seed_hash");
      const clientSeed = interaction.options.getString("client_seed");
      const nonce = interaction.options.getInteger("nonce");
      const numMines = interaction.options.getInteger("num_mines");
      const minePositionsString = interaction.options.getString("mine_positions");

      const validation = validateResultInputs(serverSeedHash, clientSeed, nonce, numMines, minePositionsString);
      if (!validation.isValid) {
        const errorEmbed = new EmbedBuilder()
          .setColor("#E74C3C")
          .setTitle("❌ Invalid Result Submission")
          .setDescription("**Input validation failed - please check your parameters**")
          .addFields({
            name: "❗ Validation Errors",
            value: validation.errors.join("\n"),
            inline: false,
          })
          .setTimestamp();
        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }

      const { parsedPositions } = validation;
      const spamCheck = checkSpamAndRepetition(interaction.user.id, parsedPositions);
      if (!spamCheck.isValid) {
        const spamEmbed = new EmbedBuilder()
          .setColor("#E74C3C")
          .setTitle("⚠️ Rate Limit Exceeded")
          .setDescription(`**${spamCheck.reason}** Please wait a moment before trying again.`)
          .setTimestamp();
        await interaction.editReply({ embeds: [spamEmbed] });
        if (submissions.get(interaction.user.id).timestamps.length >= 10) {
          bannedUsers.add(interaction.user.id);
          console.warn(`[${new Date().toISOString()}] User <@${interaction.user.id}> banned for spamming.`);
        }
        return;
      }

      const predictor = new MinePredictor(5, 5, numMines);
      const verification = predictor.verifySubmission(clientSeed, nonce, numMines, parsedPositions, serverSeedHash);

      if (verification.isValid) {
        const submissionsCollection = db.collection("submissions");
        await submissionsCollection.insertOne({
          userId: interaction.user.id,
          serverSeedHash,
          clientSeed,
          nonce,
          numMines,
          minePositions: parsedPositions,
          timestamp: new Date(),
        });

        const successEmbed = new EmbedBuilder()
          .setColor("#27AE60")
          .setTitle("✅ Result Submitted Successfully")
          .setDescription("**Thank you for submitting your game result!**")
          .addFields({
            name: "📊 Submission Details",
            value: `**Mines:** ${numMines}\n**Nonce:** ${nonce}\n**Positions:** ${parsedPositions.join(", ")}`,
            inline: false,
          })
          .addFields({
            name: "✨ What Happens Next?",
            value:
              "This data helps the prediction model learn and improve its accuracy. You are contributing to a better service for everyone!",
            inline: false,
          })
          .setTimestamp();
        await interaction.editReply({ embeds: [successEmbed] });
      } else {
        const errorEmbed = new EmbedBuilder()
          .setColor("#E74C3C")
          .setTitle("❌ Submission Failed")
          .setDescription(`**${verification.error}**`)
          .setTimestamp();
        await interaction.editReply({ embeds: [errorEmbed] });
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Submit result error: ${error.message}`);
      const errorEmbed = new EmbedBuilder()
        .setColor("#E74C3C")
        .setTitle("❌ Submission Error")
        .setDescription("**An unexpected error occurred while processing your submission**")
        .addFields({
          name: "🔧 Troubleshooting",
          value: "Please ensure all parameters are correct and try again. If the issue persists, contact an admin.",
          inline: false,
        })
        .setTimestamp();
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  if (commandName === "myresults") {
    try {
      const submissionsCollection = db.collection("submissions");
      const userSubmissions = await submissionsCollection.countDocuments({ userId: interaction.user.id });
      const embed = new EmbedBuilder()
        .setColor("#3498DB")
        .setTitle("📊 Your Submission Stats")
        .setDescription(`You have submitted **${userSubmissions}** game results.`)
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Myresults command error: ${error.message}`);
      await interaction.reply({ content: "An error occurred while fetching your submission stats.", ephemeral: true });
    }
  }

  if (commandName === "leaderboard") {
    try {
      const submissionsCollection = db.collection("submissions");
      const leaderboard = await submissionsCollection.aggregate([
        { $group: { _id: "$userId", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]).toArray();

      const leaderboardText = leaderboard.length > 0
        ? leaderboard.map((entry, index) => `${index + 1}. <@${entry._id}> - ${entry.count} submissions`).join("\n")
        : "No one has submitted results yet.";

      const embed = new EmbedBuilder()
        .setColor("#F1C40F")
        .setTitle("🏆 Top Result Submitters Leaderboard")
        .setDescription(leaderboardText)
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Leaderboard command error: ${error.message}`);
      await interaction.reply({ content: "An error occurred while fetching the leaderboard.", ephemeral: true });
    }
  }

  if (commandName === "howtosubmitresult") {
    const howToEmbed = new EmbedBuilder()
      .setColor("#3498DB")
      .setTitle("💡 How to Submit a Game Result")
      .setDescription("**Why submit a result?** Your submissions help train the prediction model, making it more accurate for everyone.")
      .addFields(
        {
          name: "1. Get the Data",
          value:
            "After a game on Rollbet, copy the **Server Seed Hash**, **Client Seed**, and **Nonce** from the game details. You'll also need to count the total number of mines and list their positions (from 0 to 24, from top-left to bottom-right).",
          inline: false,
        },
        {
          name: "2. Use the Command",
          value:
            "Use the `/submitresult` command and fill in the options. For example:\n" +
            "• `server_seed_hash`: `a1b2c3d4...`\n" +
            "• `client_seed`: `VqsjloxT6b`\n" +
            "• `nonce`: `3002`\n" +
            "• `num_mines`: `5`\n" +
            "• `mine_positions`: `3,7,12,18,22`",
          inline: false,
        },
      )
      .setTimestamp();
    await interaction.reply({ embeds: [howToEmbed], ephemeral: true });
  }
});

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
  console.error("DISCORD_TOKEN environment variable not set. Bot cannot start.");
  process.exit(1);
}
client.login(TOKEN);
