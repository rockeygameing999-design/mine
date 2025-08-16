import { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import http from "http";
import crypto from "crypto";
import fetch from "node-fetch";

// Self-ping to keep Render free tier active
const RENDER_URL = "https://mine-ka1i.onrender.com";
const PING_INTERVAL = 10 * 60 * 1000; // 10 minutes

function startSelfPing() {
  setInterval(async () => {
    try {
      const response = await fetch(RENDER_URL, { method: "GET", timeout: 5000 });
      if (response.ok) {
        console.log(`Self-ping successful at ${new Date().toISOString()}`);
      } else {
        console.error(`Self-ping failed: ${response.status}`);
      }
    } catch (error) {
      console.error(`Self-ping error: ${error.message}`);
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
  console.log(`🌐 HTTP server running on port ${PORT}`);
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
    this.entropy = this.calculateAdvancedEntropy();
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
    // Example: Increase probability for center cells (hypothetical bias)
    const centerPositions = [6, 7, 8, 11, 12, 13, 16, 17, 18];
    centerPositions.forEach((pos) => (heatMap[pos] += 0.02));
    // Normalize to sum to 1
    const total = heatMap.reduce((sum, val) => sum + val, 0);
    return heatMap.map((val) => val / total);
  }

  updateHeatMap(actualMines) {
    // Adjust heatmap based on actual mine positions
    actualMines.forEach((pos) => {
      this.heatMap[pos] = Math.min(this.heatMap[pos] + 0.01, 0.1); // Increase probability slightly
    });
    // Normalize to sum to 1
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

  verifyAndAnalyze(serverSeed, actualMines) {
    // Generate actual grid using revealed server seed
    const tempGrid = Array(this.height)
      .fill()
      .map(() => Array(this.width).fill(false));
    const rollbetSeed = `rollbet:${serverSeed}:${this.nonce}:${this.safeMines}`;
    const hash = crypto.createHash("sha512").update(rollbetSeed).digest("hex");

    const positions = [];
    let hashIndex = 0;
    while (positions.length < this.mines) {
      const chunk = hash.substr((hashIndex * 16) % (hash.length - 16), 16);
      const value = Number.parseInt(chunk, 16) / 0xffffffffffffffff;
      const pos = Math.floor(value * 25);
      if (!positions.includes(pos)) {
        positions.push(pos);
      }
      hashIndex++;
    }

    positions.forEach((pos) => {
      const x = pos % this.width;
      const y = Math.floor(pos / this.width);
      tempGrid[y][x] = true;
    });

    // Compare predicted vs actual
    let correct = 0;
    const predictedMines = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.grid[y][x] && tempGrid[y][x]) {
          correct++;
        }
        if (this.grid[y][x]) {
          predictedMines.push(y * this.width + x);
        }
      }
    }

    const accuracy = (correct / this.mines) * 100;
    this.updateHeatMap(positions); // Update heatmap based on actual mines

    return {
      accuracy,
      predictedMines,
      actualMines: positions,
      actualGrid: tempGrid,
    };
  }

  getAnalysis() {
    const verification = this.getVerificationData();
    const hashBytes = Buffer.from(verification.hash, "hex");

    let entropy = 0;
    for (let i = 0; i < Math.min(hashBytes.length, 16); i++) {
      entropy += hashBytes[i];
    }

    const entropyScore = (entropy % 100) / 100;
    const clusteringFactor = entropyScore > 0.6 ? "High" : entropyScore > 0.3 ? "Medium" : "Low";
    const riskLevel = this.mines <= 5 ? "Conservative" : this.mines >= 18 ? "Aggressive" : "Balanced";

    return {
      entropyScore: Math.round(entropyScore * 100),
      clusteringFactor,
      riskLevel,
      patternType: this.getPatternType(),
      method: this.method,
      website: this.website,
    };
  }

  getPatternType() {
    return this.mines <= 5 ? "Scatter" : this.mines >= 18 ? "Safe Corridors" : "Diagonal Clusters";
  }

  calculateAdvancedEntropy() {
    const seed1 = crypto.createHash("sha256").update(`${this.serverSeedHash}:${this.nonce}`).digest("hex");
    const seed2 = crypto.createHash("sha512").update(`${this.website}:${seed1}:${this.safeMines}`).digest("hex");
    const seed3 = crypto.createHash("sha1").update(`entropy:${seed2}:${this.nonce}`).digest("hex");

    let entropy = 0;
    for (let i = 0; i < Math.min(seed2.length, 32); i++) {
      entropy += Number.parseInt(seed2[i], 16) * Number.parseInt(seed3[i % seed3.length], 16);
    }
    entropy = (entropy % 1000000) / 1000000;
    return entropy * (this.safeMines / 25);
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
const predictions = new Map(); // Store user predictions
const submissions = new Map(); // Store user submissions
const ADMIN_USER_IDS = ["862245514313203712", "1321546526790651967"];
const verificationCodes = new Map([
  ["MINES2024", { expires: null }],
  ["PREDICT123", { expires: null }],
  ["VERIFIED", { expires: null }],
]);

client.once("ready", () => {
  console.log(`🤖 ${client.user.tag} is online and ready to predict mines!`);

  const commands = [
    new SlashCommandBuilder()
      .setName("redeem")
      .setDescription("Redeem a verification code to access mine prediction service")
      .addStringOption((option) =>
        option.setName("code").setDescription("Enter your verification code").setRequired(true),
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
      .setDescription("Submit game result to analyze prediction accuracy")
      .addStringOption((option) =>
        option.setName("server_seed").setDescription("Revealed server seed (64 character hex string)").setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("mine_positions")
          .setDescription("Comma-separated mine positions (0-24, e.g., 1,5,10)")
          .setRequired(true),
      ),
    new SlashCommandBuilder()
      .setName("myresults")
      .setDescription("View how many game results you have submitted")
      .setDefaultMemberPermissions(0), // Accessible to everyone
    new SlashCommandBuilder()
      .setName("leaderboard")
      .setDescription("View the leaderboard of top result submitters")
      .setDefaultMemberPermissions(0), // Accessible to everyone
    new SlashCommandBuilder()
      .setName("admin")
      .setDescription("Admin panel for managing verification system")
      .addSubcommand((subcommand) =>
        subcommand
          .setName("generate")
          .setDescription("Generate new verification codes")
          .addIntegerOption((option) =>
            option.setName("count").setDescription("Number of codes to generate (1-10)").setRequired(false),
          )
          .addIntegerOption((option) =>
            option
              .setName("duration")
              .setDescription("Code validity duration in hours (leave empty for permanent)")
              .setRequired(false),
          ),
      )
      .addSubcommand((subcommand) => subcommand.setName("list").setDescription("List all active verification codes"))
      .addSubcommand((subcommand) =>
        subcommand
          .setName("remove")
          .setDescription("Remove a verification code")
          .addStringOption((option) => option.setName("code").setDescription("Code to remove").setRequired(true)),
      )
      .addSubcommand((subcommand) => subcommand.setName("stats").setDescription("View verification statistics")),
  ];

  client.application.commands.set(commands);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "predict" || interaction.commandName === "submitresult") {
    await interaction.deferReply();
  }

  const { commandName } = interaction;

  if (commandName === "admin") {
    if (!ADMIN_USER_IDS.includes(interaction.user.id)) {
      const unauthorizedEmbed = new EmbedBuilder()
        .setColor("#E74C3C")
        .setTitle("🚫 Access Denied")
        .setDescription("**You are not authorized to use admin commands**")
        .setTimestamp();

      await interaction.reply({ embeds: [unauthorizedEmbed], flags: [4096] });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "generate") {
      const count = interaction.options.getInteger("count") || 1;
      const duration = interaction.options.getInteger("duration");
      const maxCount = Math.min(count, 10);
      const newCodes = [];

      for (let i = 0; i < maxCount; i++) {
        const code = generateVerificationCode();
        const expires = duration ? Date.now() + duration * 60 * 60 * 1000 : null;
        verificationCodes.set(code, { expires });
        newCodes.push({ code, expires });
      }

      const generateEmbed = new EmbedBuilder()
        .setColor("#27AE60")
        .setTitle("✅ Verification Codes Generated")
        .setDescription("**New verification codes have been created**")
        .addFields({
          name: "🔑 Generated Codes",
          value: newCodes
            .map(({ code, expires }) => {
              const expiryText = expires ? `(expires <t:${Math.floor(expires / 1000)}:R>)` : "(permanent)";
              return `\`${code}\` ${expiryText}`;
            })
            .join("\n"),
          inline: false,
        })
        .addFields({
          name: "📊 Total Active Codes",
          value: `${verificationCodes.size} codes`,
          inline: true,
        })
        .setTimestamp()
        .setFooter({ text: "Admin Panel • Code Generation" });

      await interaction.reply({ embeds: [generateEmbed], flags: [4096] });
    } else if (subcommand === "list") {
      cleanExpiredCodes();
      cleanExpiredUsers();

      const codesList =
        Array.from(verificationCodes.entries())
          .map(([code, data]) => {
            const expiryText = data.expires ? `(expires <t:${Math.floor(data.expires / 1000)}:R>)` : "(permanent)";
            return `\`${code}\` ${expiryText}`;
          })
          .join("\n") || "No codes available";

      const listEmbed = new EmbedBuilder()
        .setColor("#3498DB")
        .setTitle("📋 Active Verification Codes")
        .setDescription("**All currently active verification codes**")
        .addFields({
          name: "🔑 Available Codes",
          value: codesList,
          inline: false,
        })
        .addFields({
          name: "📊 Statistics",
          value: `Total Codes: ${verificationCodes.size}\nVerified Users: ${verifiedUsers.size}`,
          inline: false,
        })
        .setTimestamp()
        .setFooter({ text: "Admin Panel • Code Management" });

      await interaction.reply({ embeds: [listEmbed], flags: [4096] });
    } else if (subcommand === "remove") {
      const codeToRemove = interaction.options.getString("code").toUpperCase();

      if (verificationCodes.has(codeToRemove)) {
        verificationCodes.delete(codeToRemove);

        const removeEmbed = new EmbedBuilder()
          .setColor("#E67E22")
          .setTitle("🗑️ Code Removed")
          .setDescription("**Verification code has been deactivated**")
          .addFields({
            name: "🔑 Removed Code",
            value: `\`${codeToRemove}\``,
            inline: false,
          })
          .addFields({
            name: "📊 Remaining Codes",
            value: `${verificationCodes.size} active codes`,
            inline: true,
          })
          .setTimestamp();

        await interaction.reply({ embeds: [removeEmbed], flags: [4096] });
      } else {
        const notFoundEmbed = new EmbedBuilder()
          .setColor("#E74C3C")
          .setTitle("❌ Code Not Found")
          .setDescription("**The specified verification code does not exist**")
          .setTimestamp();

        await interaction.reply({ embeds: [notFoundEmbed], flags: [4096] });
      }
    } else if (subcommand === "stats") {
      const statsEmbed = new EmbedBuilder()
        .setColor("#9B59B6")
        .setTitle("📊 Verification System Statistics")
        .setDescription("**Current system status and metrics**")
        .addFields(
          {
            name: "🔑 Active Codes",
            value: `${verificationCodes.size} codes`,
            inline: true,
          },
          {
            name: "✅ Verified Users",
            value: `${verifiedUsers.size} users`,
            inline: true,
          },
          {
            name: "📤 Total Submissions",
            value: `${submissions.size} users, ${Array.from(submissions.values()).reduce((sum, data) => sum + data.count, 0)} submissions`,
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

      await interaction.reply({ embeds: [statsEmbed], flags: [4096] });
    }

    return;
  }

  if (commandName === "redeem") {
    const code = interaction.options.getString("code").toUpperCase();

    cleanExpiredCodes();
    cleanExpiredUsers();

    if (verificationCodes.has(code)) {
      const codeData = verificationCodes.get(code);
      const userExpiration = codeData.expires;

      verifiedUsers.set(interaction.user.id, { expires: userExpiration });

      const successEmbed = new EmbedBuilder()
        .setColor("#27AE60")
        .setTitle("✅ Code Redeemed Successfully")
        .setDescription("**You have successfully redeemed your verification code!**")
        .addFields({
          name: "🎯 Access Granted",
          value: "You can now use the `/predict` command to analyze mine patterns.",
          inline: false,
        })
        .addFields({
          name: "⏰ Access Duration",
          value: userExpiration ? `Expires <t:${Math.floor(userExpiration / 1000)}:R>` : "Permanent access",
          inline: false,
        })
        .setTimestamp()
        .setFooter({ text: "Professional Mine Prediction Service" });

      await interaction.reply({ embeds: [successEmbed], flags: [4096] });
    } else {
      const errorEmbed = new EmbedBuilder()
        .setColor("#E74C3C")
        .setTitle("❌ Invalid Verification Code")
        .setDescription("**The code you entered is invalid or has expired**")
        .addFields({
          name: "🔑 Access Denied",
          value: "Please contact the administrator to obtain a valid verification code.",
          inline: false,
        })
        .setTimestamp();

      await interaction.reply({ embeds: [errorEmbed], flags: [4096] });
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
          .setDescription("**You must redeem a verification code to use the mine prediction service**")
          .addFields({
            name: "🎯 Get Access",
            value: "Use `/redeem <code>` command with a valid verification code to access predictions.",
            inline: false,
          })
          .addFields({
            name: "📞 Contact Admin",
            value: "Contact the server administrator to obtain your verification code.",
            inline: false,
          })
          .setTimestamp()
          .setFooter({ text: "Professional Mine Prediction Service • Verification Required" });

        await interaction.editReply({ embeds: [verificationRequiredEmbed] });
        return;
      }

      if (userData.expires && Date.now() > userData.expires) {
        verifiedUsers.delete(interaction.user.id);

        const expiredEmbed = new EmbedBuilder()
          .setColor("#E74C3C")
          .setTitle("⏰ Access Expired")
          .setDescription("**Your verification code has expired**")
          .addFields({
            name: "🔄 Renew Access",
            value: "Please redeem a new verification code to continue using the prediction service.",
            inline: false,
          })
          .setTimestamp();

        await interaction.editReply({ embeds: [expiredEmbed] });
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

      // Store prediction
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
      console.error("Predict command error:", error);

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
        console.error("Failed to send error response:", replyError);
      }
    }
    return;
  }

  if (commandName === "submitresult") {
    try {
      const serverSeed = interaction.options.getString("server_seed");
      const minePositions = interaction.options.getString("mine_positions");

      // Validate inputs
      const validation = validateResultInputs(serverSeed, minePositions);
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
              "**Server Seed:** 64 character hex string (0-9, a-f)\n**Mine Positions:** Comma-separated integers (0-24, e.g., 1,5,10)",
            inline: false,
          })
          .setTimestamp();

        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }

      const userPrediction = predictions.get(interaction.user.id);
      if (!userPrediction) {
        const noPredictionEmbed = new EmbedBuilder()
          .setColor("#F39C12")
          .setTitle("⚠️ No Prediction Found")
          .setDescription("**You haven't made a prediction yet**")
          .addFields({
            name: "🎯 Next Steps",
            value: "Use the `/predict` command to make a prediction, then submit results with `/submitresult`.",
            inline: false,
          })
          .setTimestamp();

        await interaction.editReply({ embeds: [noPredictionEmbed] });
        return;
      }

      const predictor = new MinePredictor(
        5,
        5,
        userPrediction.safeMines,
        userPrediction.serverSeedHash,
        userPrediction.nonce,
      );
      const analysisResult = predictor.verifyAndAnalyze(serverSeed, validation.minePositions);

      // Update submissions
      const userSubmissions = submissions.get(interaction.user.id) || { count: 0, lastSubmission: 0 };
      userSubmissions.count += 1;
      userSubmissions.lastSubmission = Date.now();
      submissions.set(interaction.user.id, userSubmissions);

      const resultEmbed = new EmbedBuilder()
        .setColor("#3498DB")
        .setTitle("📊 Game Result Analysis")
        .setDescription("**Your submitted game result has been analyzed**")
        .addFields({
          name: "🎯 Predicted Mines",
          value: `\`${analysisResult.predictedMines.join(", ")}\``,
          inline: true,
        })
        .addFields({
          name: "💣 Actual Mines",
          value: `\`${analysisResult.actualMines.join(", ")}\``,
          inline: true,
        })
        .addFields({
          name: "📈 Prediction Accuracy",
          value: `${analysisResult.accuracy.toFixed(2)}%`,
          inline: true,
        })
        .addFields({
          name: "📍 Predicted Grid",
          value: `\`\`\`\n${predictor.getGridDisplay(userPrediction.grid)}\`\`\``,
          inline: false,
        })
        .addFields({
          name: "📍 Actual Grid",
          value: `\`\`\`\n${predictor.getGridDisplay(analysisResult.actualGrid)}\`\`\``,
          inline: false,
        })
        .setTimestamp()
        .setFooter({ text: "Professional Mine Prediction Service • Result Analysis" });

      await interaction.editReply({ embeds: [resultEmbed] });
    } catch (error) {
      console.error("Submitresult command error:", error);

      const errorEmbed = new EmbedBuilder()
        .setColor("#E74C3C")
        .setTitle("❌ Submission Error")
        .setDescription("**An error occurred while processing your submission**")
        .addFields({
          name: "🔧 Troubleshooting",
          value: "Please check your input parameters and try again. If the issue persists, contact an administrator.",
          inline: false,
        })
        .setTimestamp();

      try {
        await interaction.editReply({ embeds: [errorEmbed] });
      } catch (replyError) {
        console.error("Failed to send error response:", replyError);
      }
    }
    return;
  }

  if (commandName === "myresults") {
    try {
      const userSubmissions = submissions.get(interaction.user.id);
      const count = userSubmissions ? userSubmissions.count : 0;

      const embed = new EmbedBuilder()
        .setColor("#27AE60")
        .setTitle("📤 Your Submission Stats")
        .setDescription("**Your contribution to improving predictions**")
        .addFields({
          name: "🔢 Total Results Submitted",
          value: `${count} submission${count === 1 ? "" : "s"}`,
          inline: false,
        })
        .addFields({
          name: "🎯 How to Contribute",
          value: "Use `/submitresult` to submit game results and help improve prediction accuracy!",
          inline: false,
        })
        .setTimestamp()
        .setFooter({ text: "Professional Mine Prediction Service" });

      await interaction.reply({ embeds: [embed], flags: [4096] });
    } catch (error) {
      console.error("Myresults command error:", error);

      const errorEmbed = new EmbedBuilder()
        .setColor("#E74C3C")
        .setTitle("❌ Error")
        .setDescription("**An error occurred while fetching your submission stats**")
        .addFields({
          name: "🔧 Troubleshooting",
          value: "Please try again later or contact an administrator.",
          inline: false,
        })
        .setTimestamp();

      await interaction.reply({ embeds: [errorEmbed], flags: [4096] });
    }
    return;
  }

  if (commandName === "leaderboard") {
    try {
      const leaderboard = Array.from(submissions.entries())
        .sort((a, b) => b[1].count - a[1].count || b[1].lastSubmission - a[1].lastSubmission)
        .slice(0, 10);

      const embed = new EmbedBuilder()
        .setColor("#FFD700")
        .setTitle("🏆 Submission Leaderboard")
        .setDescription("**Top contributors by number of game results submitted**")
        .addFields({
          name: "👑 Top Submitters",
          value:
            leaderboard.length > 0
              ? leaderboard
                  .map(([userId, data], index) => `${index + 1}. <@${userId}>: ${data.count} submission${data.count === 1 ? "" : "s"}`)
                  .join("\n")
              : "No submissions yet",
          inline: false,
        })
        .setTimestamp()
        .setFooter({ text: "Professional Mine Prediction Service • Leaderboard" });

      await interaction.reply({ embeds: [embed], flags: [4096] });
    } catch (error) {
      console.error("Leaderboard command error:", error);

      const errorEmbed = new EmbedBuilder()
        .setColor("#E74C3C")
        .setTitle("❌ Error")
        .setDescription("**An error occurred while fetching the leaderboard**")
        .addFields({
          name: "🔧 Troubleshooting",
          value: "Please try again later or contact an administrator.",
          inline: false,
        })
        .setTimestamp();

      await interaction.reply({ embeds: [errorEmbed], flags: [4096] });
    }
    return;
  }
});

client.on("error", (error) => {
  console.error("Discord client error:", error);
});

client.on("warn", (warning) => {
  console.warn("Discord client warning:", warning);
});

function validateInputs(serverSeedHash, safeMines, nonce) {
  const errors = [];

  if (!serverSeedHash) {
    errors.push("• Server seed hash is required");
  } else if (typeof serverSeedHash !== "string") {
    errors.push("• Server seed hash must be a string");
  } else if (serverSeedHash.length !== 64) {
    errors.push(`• Server seed hash must be exactly 64 characters (got ${serverSeedHash.length})`);
  } else if (!/^[0-9a-fA-F]{64}$/.test(serverSeedHash)) {
    errors.push("• Server seed hash must contain only hexadecimal characters (0-9, a-f)");
  }

  if (safeMines === null || safeMines === undefined) {
    errors.push("• Safe mines count is required");
  } else if (!Number.isInteger(safeMines)) {
    errors.push("• Safe mines must be an integer");
  } else if (safeMines < 1) {
    errors.push("• Safe mines must be at least 1");
  } else if (safeMines > 24) {
    errors.push("• Safe mines cannot exceed 24 (maximum safe tiles)");
  }

  if (nonce === null || nonce === undefined) {
    errors.push("• Nonce is required");
  } else if (!Number.isInteger(nonce)) {
    errors.push("• Nonce must be an integer");
  } else if (nonce < 1) {
    errors.push("• Nonce must be a positive integer (minimum 1)");
  } else if (nonce > 999999999) {
    errors.push("• Nonce must be less than 1 billion");
  }

  if (errors.length === 0) {
    if (/^0+$/.test(serverSeedHash)) {
      errors.push("• Server seed hash appears invalid (all zeros)");
    }
    if (/^(.)\1+$/.test(serverSeedHash)) {
      errors.push("• Server seed hash appears invalid (repeating pattern)");
    }
  }

  return {
    isValid: errors.length === 0,
    errors: errors,
  };
}

function validateResultInputs(serverSeed, minePositions) {
  const errors = [];

  if (!serverSeed) {
    errors.push("• Server seed is required");
  } else if (typeof serverSeed !== "string") {
    errors.push("• Server seed must be a string");
  } else if (serverSeed.length !== 64) {
    errors.push(`• Server seed must be exactly 64 characters (got ${serverSeed.length})`);
  } else if (!/^[0-9a-fA-F]{64}$/.test(serverSeed)) {
    errors.push("• Server seed must contain only hexadecimal characters (0-9, a-f)");
  }

  const positions = minePositions
    .split(",")
    .map((p) => parseInt(p.trim()))
    .filter((p) => !isNaN(p));
  if (positions.length === 0) {
    errors.push("• Mine positions must contain at least one valid integer");
  } else if (positions.some((p) => p < 0 || p > 24)) {
    errors.push("• Mine positions must be integers between 0 and 24");
  } else if (new Set(positions).size !== positions.length) {
    errors.push("• Mine positions must not contain duplicates");
  }

  return {
    isValid: errors.length === 0,
    errors,
    minePositions: positions,
  };
}

function generateVerificationCode() {
  const prefixes = ["MINE", "PRED", "VERIFY", "ACCESS", "CODE"];
  const numbers = Math.floor(Math.random() * 9999)
    .toString()
    .padStart(4, "0");
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  return `${prefix}${numbers}`;
}

function cleanExpiredCodes() {
  const now = Date.now();
  for (const [code, data] of verificationCodes.entries()) {
    if (data.expires && now > data.expires) {
      verificationCodes.delete(code);
    }
  }
}

function cleanExpiredUsers() {
  const now = Date.now();
  for (const [userId, userData] of verifiedUsers.entries()) {
    if (userData.expires && now > userData.expires) {
      verifiedUsers.delete(userId);
    }
  }
}

const token = process.env.DISCORD_BOT_TOKEN;

if (!token) {
  console.error("❌ Please set your DISCORD_BOT_TOKEN environment variable!");
  console.log("📝 Get your token from: https://discord.com/developers/applications");
  process.exit(1);
}

client.login(token);
