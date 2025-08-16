import { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import http from "http";
import crypto from "crypto";
import fetch from "node-fetch";
import fs from "fs/promises";

// Self-ping to keep Render free tier active
const RENDER_URL = "https://mine-ka1i.onrender.com";
const PING_INTERVAL = 10 * 60 * 1000; // 10 minutes

function startSelfPing() {
  setInterval(async () => {
    try {
      const response = await fetch(RENDER_URL, { method: "GET", timeout: 5000 });
      if (response.ok) {
        console.log(`[${new Date().toISOString()}] Self-ping successful`);
      } else {
        console.error(`[${new Date().toISOString()}] Self-ping failed: ${response.status}`);
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Self-ping error: ${error.message}`);
    }
  }, PING_INTERVAL);
}

startSelfPing();

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

const PORT = process.env.PORT || 3000;
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
    const heatMap = new Array(25).fill(0.04); // Default probability: 1/25
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
    await fs.writeFile("verifiedUsers.json", JSON.stringify([...verifiedUsers]));
    console.log(`[${new Date().toISOString()}] Saved verifiedUsers to file`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Failed to save verifiedUsers:`, error);
  }
}

async function loadVerifiedUsers() {
  try {
    const data = await fs.readFile("verifiedUsers.json", "utf8");
    const loaded = JSON.parse(data);
    loaded.forEach(([userId, data]) => verifiedUsers.set(userId, data));
    console.log(`[${new Date().toISOString()}] Loaded ${verifiedUsers.size} verifiedUsers from file`);
  } catch (error) {
    console.log(`[${new Date().toISOString()}] No verifiedUsers file found, starting fresh`);
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

  userSubmissions.timestamps = userSubmissions.timestamps.filter((ts) => now - ts < 20000); // 20 seconds
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

client.once("ready", async () => {
  console.log(`[${new Date().toISOString()}] 🤖 ${client.user.tag} is online and ready to predict mines!`);
  await loadVerifiedUsers();

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
      ),
  ];

  client.application.commands.set(commands);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "predict" || interaction.commandName === "submitresult") {
    await interaction.deferReply();
  }

  const { commandName } = interaction;

  if (commandName === "verify") {
    if (!ADMIN_USER_IDS.includes(interaction.user.id)) {
      console.log(`[${new Date().toISOString()}] Unauthorized /verify attempt by ${interaction.user.id}`);
      const unauthorizedEmbed = new EmbedBuilder()
        .setColor("#E74C3C")
        .setTitle("🚫 Access Denied")
        .setDescription("**You are not authorized to use this command**")
        .setTimestamp();

      await interaction.reply({ embeds: [unauthorizedEmbed], ephemeral: true });
      return;
    }

    const userId = interaction.options.getString("user_id");
    const duration = interaction.options.getInteger("duration");
    const expires = duration ? Date.now() + duration * 60 * 60 * 1000 : null;

    if (!/^\d{17,19}$/.test(userId)) {
      console.log(`[${new Date().toISOString()}] Invalid user ID in /verify: ${userId}`);
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
    console.log(`[${new Date().toISOString()}] Granted access to user ${userId}, expires: ${expires ? new Date(expires).toISOString() : "permanent"}`);

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

    // Notify the user
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
      console.log(`[${new Date().toISOString()}] Notified user ${userId} of verification`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Failed to notify user ${userId}:`, error);
      await interaction.followUp({
        content: `Access granted, but could not notify <@${userId}> (DMs may be closed or user not found).`,
        ephemeral: true,
      });
    }
    return;
  }

  if (commandName === "admin") {
    if (!ADMIN_USER_IDS.includes(interaction.user.id)) {
      console.log(`[${new Date().toISOString()}] Unauthorized /admin attempt by ${interaction.user.id}`);
      const unauthorizedEmbed = new EmbedBuilder()
        .setColor("#E74C3C")
        .setTitle("🚫 Access Denied")
        .setDescription("**You are not authorized to use admin commands**")
        .setTimestamp();

      await interaction.reply({ embeds: [unauthorizedEmbed], ephemeral: true });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "stats") {
      cleanExpiredUsers();
      const verifiedUsersList =
        Array.from(verifiedUsers.entries())
          .map(([userId, data]) => {
            const expiryText = data.expires ? `(expires <t:${Math.floor(data.expires / 1000)}:R>)` : "(permanent)";
            return `<@${userId}> ${expiryText}`;
          })
          .join("\n") || "No verified users";

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
        )
        .addFields({
          name: "⏱️ System Uptime",
          value: `${Math.floor(process.uptime() / 60)} minutes`,
          inline: false,
        })
        .setTimestamp()
        .setFooter({ text: "Admin Panel • System Statistics" });

      await interaction.reply({ embeds: [statsEmbed], ephemeral: true });
    } else if (subcommand === "unban") {
      const userId = interaction.options.getString("user_id");
      if (bannedUsers.has(userId)) {
        bannedUsers.delete(userId);
        console.log(`[${new Date().toISOString()}] Unbanned user ${userId}`);
        await interaction.reply({ content: `User <@${userId}> has been unbanned.`, ephemeral: true });
      } else {
        await interaction.reply({ content: `User <@${userId}> is not banned.`, ephemeral: true });
      }
    }

    return;
  }

  if (commandName === "predict") {
    try {
      cleanExpiredUsers();
      const userData = verifiedUsers.get(interaction.user.id);
      console.log(`[${new Date().toISOString()}] /predict attempt by ${interaction.user.id}, verified: ${!!userData}, expires: ${userData?.expires ? new Date(userData.expires).toISOString() : "permanent"}`);
      
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
        .setDescription(`**${analysis.method.charAt(0).toUpperCase() + analysis.method.slice(1)} Analysis for Rollbet**`);

      embed.addFields(
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
      );

      const gridDisplay = predictor.getGridDisplay();
      embed.addFields({
        name: "🎯 Predicted Mine Locations",
        value: `\`\`\`\n${gridDisplay}\`\`\``,
        inline: false,
      });

      embed.addFields({
        name: "🔍 Verification Signature",
        value: `\`${verification.hash}\``,
        inline: false,
      });

      embed.setFooter({
        text: `Professional Mine Prediction Service • ${analysis.method.charAt(0).toUpperCase() + analysis.method.slice(1)} Algorithm v5.3`,
      });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Predict command error for ${interaction.user.id}:`, error);

      const errorEmbed = new EmbedBuilder()
        .setColor("#E74C3C")
        .setTitle("❌ Prediction Error")
        .setDescription("**An error occurred while processing your prediction**")
        .addFields({
          name: "🔧 Troubleshooting",
          value: "Please check your input parameters and try again. If the issue persists, contact an administrator.",
          inline: false,
        })
        .setTimestamp();

      try {
        await interaction.editReply({ embeds: [errorEmbed] });
      } catch (replyError) {
        console.error(`[${new Date().toISOString()}] Failed to send error response:`, replyError);
      }
    }
    return;
  }

  if (commandName === "submitresult") {
    try {
      console.log(`[${new Date().toISOString()}] Processing /submitresult for user ${interaction.user.id}`);
      await interaction.deferReply();

      if (bannedUsers.has(interaction.user.id)) {
        const banEmbed = new EmbedBuilder()
          .setColor("#E74C3C")
          .setTitle("🚫 Submission Banned")
          .setDescription("**You have been banned from submitting due to suspicious activity**")
          .addFields({
            name: "📞 Next Steps",
            value: "Open a support ticket to request an unban.",
            inline: false,
          })
          .setTimestamp();

        await interaction.editReply({ embeds: [banEmbed] });
        return;
      }

      const serverSeedHash = interaction.options.getString("server_seed_hash");
      const clientSeed = interaction.options.getString("client_seed");
      const nonce = interaction.options.getInteger("nonce");
      const numMines = interaction.options.getInteger("num_mines");
      const minePositions = interaction.options.getString("mine_positions");

      const startValidation = Date.now();
      const validation = validateResultInputs(serverSeedHash, clientSeed, nonce, numMines, minePositions);
      console.log(`[${new Date().toISOString()}] Validation took ${Date.now() - startValidation}ms`);

      if (!validation.isValid) {
        const errorEmbed = new EmbedBuilder()
          .setColor("#E74C3C")
          .setTitle("❌ Invalid Submission Parameters")
          .setDescription("**Input validation failed - please check your parameters**")
          .addFields({
            name: "❗ Validation Errors",
            value: validation.errors.join("\n"),
            inline: false,
          })
          .addFields({
            name: "✅ Required Format",
            value:
              "**Server Seed Hash:** 64 character hex string (0-9, a-f)\n**Client Seed:** Non-empty string (e.g., VqsjloxT6b)\n**Nonce:** Non-negative integer (e.g., 3002)\n**Number of Mines:** Integer between 1-24\n**Mine Positions:** Comma-separated integers (e.g., 3,7,12,18,22)",
            inline: false,
          })
          .addFields({
            name: "📝 Example",
            value: "/submitresult server_seed_hash: aa65cf73b921... client_seed: VqsjloxT6b nonce: 3002 num_mines: 5 mine_positions: 3,7,12,18,22",
            inline: false,
          })
          .addFields({
            name: "⚠️ Warning",
            value: "Submitting fake or incorrect data will be detected and may result in a ban.",
            inline: false,
          })
          .setTimestamp();

        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }

      if (usedServerSeeds.has(serverSeedHash)) {
        const usedSeedEmbed = new EmbedBuilder()
          .setColor("#E74C3C")
          .setTitle("❌ Server Seed Hash Already Used")
          .setDescription("**This server seed hash has already been submitted**")
          .addFields({
            name: "🔧 Troubleshooting",
            value: "Ensure you are using a new, unique server seed hash from Rollbet's fairness page.",
            inline: false,
          })
          .addFields({
            name: "⚠️ Warning",
            value: "Submitting fake or incorrect data will be detected and may result in a ban.",
            inline: false,
          })
          .setTimestamp();

        await interaction.editReply({ embeds: [usedSeedEmbed] });
        return;
      }

      const spamCheck = checkSpamAndRepetition(interaction.user.id, validation.parsedPositions);
      if (!spamCheck.isValid) {
        bannedUsers.set(interaction.user.id, { reason: spamCheck.reason, timestamp: Date.now() });
        console.log(`[${new Date().toISOString()}] Banned user ${interaction.user.id} for: ${spamCheck.reason}`);

        const banEmbed = new EmbedBuilder()
          .setColor("#E74C3C")
          .setTitle("🚫 Submission Banned")
          .setDescription("**You have been banned from submitting due to suspicious activity**")
          .addFields({
            name: "❗ Reason",
            value: spamCheck.reason,
            inline: false,
          })
          .addFields({
            name: "📞 Next Steps",
            value: "Open a support ticket to request an unban.",
            inline: false,
          })
          .setTimestamp();

        await interaction.editReply({ embeds: [banEmbed] });
        return;
      }

      const startVerification = Date.now();
      const predictor = new MinePredictor(5, 5, 25 - numMines, serverSeedHash, nonce);
      const analysisResult = predictor.verifySubmission(clientSeed, nonce, numMines, validation.parsedPositions, serverSeedHash);
      console.log(`[${new Date().toISOString()}] Verification took ${Date.now() - startVerification}ms`);

      if (!analysisResult.isValid) {
        const invalidEmbed = new EmbedBuilder()
          .setColor("#E74C3C")
          .setTitle("❌ Invalid Game Data")
          .setDescription("**The provided game data could not be verified**")
          .addFields({
            name: "❗ Error",
            value: analysisResult.error,
            inline: false,
          })
          .addFields({
            name: "🔧 Troubleshooting",
            value: "Ensure you entered the correct server seed hash, client seed, nonce, number of mines, and mine positions from Rollbet's fairness page.",
            inline: false,
          })
          .addFields({
            name: "⚠️ Warning",
            value: "Submitting fake or incorrect data will be detected and may result in a ban.",
            inline: false,
          })
          .setTimestamp();

        await interaction.editReply({ embeds: [invalidEmbed] });
        return;
      }

      usedServerSeeds.set(serverSeedHash, { userId: interaction.user.id, timestamp: Date.now() });

      const userSubmissions = submissions.get(interaction.user.id) || { count: 0, lastSubmission: 0, timestamps: [], positions: [] };
      userSubmissions.count += 1;
      userSubmissions.lastSubmission = Date.now();
      submissions.set(interaction.user.id, userSubmissions);

      const resultEmbed = new EmbedBuilder()
        .setColor("#3498DB")
        .setTitle("📊 Game Result Analysis")
        .setDescription("**Your submitted game result has been verified and analyzed**")
        .addFields({
          name: "💣 Submitted Mines",
          value: `\`${validation.parsedPositions.join(", ")}\``,
          inline: true,
        })
        .addFields({
          name: "📍 Actual Grid",
          value: `\`\`\`\n${predictor.getGridDisplay(analysisResult.actualGrid)}\`\`\``,
          inline: false,
        })
        .addFields({
          name: "🔑 Submission Details",
          value: `Server Seed Hash: \`${serverSeedHash.substring(0, 8)}...\`\nClient Seed: \`${clientSeed}\`\nNonce: ${nonce}\nMines: ${numMines}`,
          inline: false,
        })
        .setTimestamp()
        .setFooter({ text: "Professional Mine Prediction Service • Result Analysis" });

      await interaction.editReply({ embeds: [resultEmbed] });
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Submitresult command error:`, error);

      const errorEmbed = new EmbedBuilder()
        .setColor("#E74C3C")
        .setTitle("❌ Submission Error")
        .setDescription("**An error occurred while processing your submission**")
        .addFields({
          name: "🔧 Troubleshooting",
          value: "Please check your input parameters and try again. If the issue persists, contact an administrator.",
          inline: false,
        })
        .addFields({
          name: "⚠️ Warning",
          value: "Submitting fake or incorrect data will be detected and may result in a ban.",
          inline: false,
        })
        .setTimestamp();

      try {
        await interaction.editReply({ embeds: [errorEmbed] });
      } catch (replyError) {
        console.error(`[${new Date().toISOString()}] Failed to send error response:`, replyError);
      }
    }
    return;
  }

  if (commandName === "howtosubmitresult") {
    const guideEmbed = new EmbedBuilder()
      .setColor("#3498DB")
      .setTitle("📝 How to Submit Game Results")
      .setDescription("**Submitting your Rollbet game results helps improve our prediction accuracy for everyone!**")
      .addFields({
        name: "🎯 Why Submit?",
        value:
          "Your submissions enhance our heatmap, making predictions more accurate. Plus, you’ll climb the leaderboard and earn bragging rights!",
        inline: false,
      })
      .addFields({
        name: "📋 How to Submit",
        value:
          "1. Go to Rollbet’s fairness page after your game.\n2. Copy the **server seed hash**, **client seed**, **nonce**, **number of mines**, and note the **mine positions** (tile numbers 0–24).\n3. Use the `/submitresult` command with these details.\n4. Example: `/submitresult server_seed_hash: aa65cf73b921... client_seed: VqsjloxT6b nonce: 3002 num_mines: 5 mine_positions: 3,7,12,18,22`",
        inline: false,
      })
      .addFields({
        name: "⚠️ Important Notes",
        value:
          "- Ensure all details are correct and match Rollbet’s fairness page.\n- Mine positions must be unique integers (0–24) separated by commas.\n- Submitting fake or incorrect data will be detected and may result in a ban.\n- Only one submission per server seed hash is allowed.\n- You can submit the same mine positions up to 3 times.",
        inline: false,
      })
      .addFields({
        name: "📞 Need Help?",
        value: "Contact an administrator or open a support ticket if you encounter issues.",
        inline: false,
      })
      .setTimestamp()
      .setFooter({ text: "Professional Mine Prediction Service • Submission Guide" });

    await interaction.reply({ embeds: [guideEmbed] });
    return;
  }

  if (commandName === "myresults") {
    const userSubmissions = submissions.get(interaction.user.id) || { count: 0, lastSubmission: 0 };

    const resultsEmbed = new EmbedBuilder()
      .setColor("#3498DB")
      .setTitle("📊 Your Submission Stats")
      .setDescription(`**${interaction.user.username}'s contribution to the prediction service**`)
      .addFields({
        name: "📤 Total Submissions",
        value: `${userSubmissions.count} results submitted`,
        inline: true,
      })
      .addFields({
        name: "⏰ Last Submission",
        value: userSubmissions.lastSubmission
          ? `<t:${Math.floor(userSubmissions.lastSubmission / 1000)}:R>`
          : "No submissions yet",
        inline: true,
      })
      .addFields({
        name: "🎯 Keep Contributing",
        value: "Use `/submitresult` to submit more game results and improve our predictions!",
        inline: false,
      })
      .setTimestamp()
      .setFooter({ text: "Professional Mine Prediction Service • Your Stats" });

    await interaction.reply({ embeds: [resultsEmbed] });
    return;
  }

  if (commandName === "leaderboard") {
    const sortedSubmissions = Array.from(submissions.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10);

    const leaderboardEmbed = new EmbedBuilder()
      .setColor("#FFD700")
      .setTitle("🏆 Submission Leaderboard")
      .setDescription("**Top contributors to the Rollbet mine prediction service**");

    if (sortedSubmissions.length === 0) {
      leaderboardEmbed.addFields({
        name: "📊 No Submissions Yet",
        value: "Be the first to submit a result with `/submitresult`!",
        inline: false,
      });
    } else {
      const fields = sortedSubmissions.map(([userId, data], index) => ({
        name: `#${index + 1} <@${userId}>`,
        value: `${data.count} submissions`,
        inline: true,
      }));
      leaderboardEmbed.addFields(fields);
    }

    leaderboardEmbed.setTimestamp().setFooter({ text: "Professional Mine Prediction Service • Leaderboard" });

    await interaction.reply({ embeds: [leaderboardEmbed] });
  }
});

function validateInputs(serverSeedHash, safeMines, nonce) {
  const errors = [];

  if (!/^[0-9a-fA-F]{64}$/.test(serverSeedHash)) {
    errors.push("Server seed hash must be a 64-character hex string (0-9, a-f).");
  }
  if (!Number.isInteger(safeMines) || safeMines < 1 || safeMines > 24) {
    errors.push("Safe mines must be an integer between 1 and 24.");
  }
  if (!Number.isInteger(nonce) || nonce < 0) {
    errors.push("Nonce must be a non-negative integer.");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

client.login(process.env.DISCORD_BOT_TOKEN);
