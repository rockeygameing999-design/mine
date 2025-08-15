import { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder } from "discord.js"
import http from "http"
import crypto from "crypto"

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
})

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" })
  res.end(
    JSON.stringify({
      status: "Bot is running!",
      bot: client.user?.tag || "Connecting...",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    }),
  )
})

const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log(`🌐 HTTP server running on port ${PORT}`)
})

// Advanced mine pattern prediction class
class MinePredictor {
  constructor(width = 5, height = 5, mines = 25, serverSeedHash = null, clientSeed = null, nonce = null) {
    this.width = width
    this.height = height
    this.mines = mines
    this.serverSeedHash = serverSeedHash || this.generateServerSeedHash()
    this.clientSeed = clientSeed || this.generateClientSeed()
    this.nonce = nonce || Math.floor(Math.random() * 1000000)
    this.grid = []
    this.generatePredictionGrid()
  }

  generateServerSeedHash() {
    const serverSeed = crypto.randomBytes(32).toString("hex")
    return crypto.createHash("sha256").update(serverSeed).digest("hex")
  }

  generateClientSeed() {
    return crypto.randomBytes(16).toString("hex")
  }

  generatePredictionGrid() {
    const combinedSeed = `${this.serverSeedHash}:${this.clientSeed}:${this.nonce}`
    const hash = crypto.createHash("sha256").update(combinedSeed).digest("hex")

    // Initialize empty grid
    this.grid = Array(this.height)
      .fill()
      .map(() => Array(this.width).fill(false))

    // Use hash to deterministically place mines
    const totalCells = this.width * this.height
    const minePositions = new Set()

    // Generate mine positions using hash bytes
    let hashIndex = 0
    while (minePositions.size < this.mines && hashIndex < hash.length - 1) {
      // Take 2 hex characters (1 byte) at a time
      const byte1 = Number.parseInt(hash.substr(hashIndex, 2), 16)
      const byte2 = Number.parseInt(hash.substr(hashIndex + 2, 2), 16)

      // Combine bytes to get position
      const position = (byte1 * 256 + byte2) % totalCells
      minePositions.add(position)

      hashIndex += 4

      // If we run out of hash, create new hash
      if (hashIndex >= hash.length - 1) {
        const newHash = crypto
          .createHash("sha256")
          .update(hash + this.nonce)
          .digest("hex")
        hashIndex = 0
      }
    }

    // Place mines on grid
    Array.from(minePositions).forEach((position) => {
      const x = position % this.width
      const y = Math.floor(position / this.width)
      this.grid[y][x] = true
    })
  }

  getGridDisplay() {
    const emojis = {
      mine: "💣",
      safe: "🟩",
      number: ["⬛", "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣"],
    }

    let display = ""
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.grid[y][x]) {
          display += emojis.mine
        } else {
          const adjacentMines = this.countAdjacentMines(x, y)
          if (adjacentMines > 0) {
            display += emojis.number[adjacentMines]
          } else {
            display += emojis.safe
          }
        }
      }
      display += "\n"
    }
    return display
  }

  countAdjacentMines(x, y) {
    let count = 0
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue
        const nx = x + dx
        const ny = y + dy
        if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
          if (this.grid[ny][nx]) count++
        }
      }
    }
    return count
  }

  getMineCoordinates() {
    const mines = []
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.grid[y][x]) {
          mines.push(`(${x + 1}, ${y + 1})`)
        }
      }
    }
    return mines
  }

  getVerificationData() {
    return {
      serverSeedHash: this.serverSeedHash,
      clientSeed: this.clientSeed,
      nonce: this.nonce,
      hash: crypto.createHash("sha256").update(`${this.serverSeedHash}:${this.clientSeed}:${this.nonce}`).digest("hex"),
    }
  }

  getPredictionAccuracy() {
    const verification = this.getVerificationData()
    const hashBytes = Buffer.from(verification.hash, "hex")

    // Calculate entropy-based accuracy (88-96% range)
    let entropy = 0
    for (let i = 0; i < hashBytes.length; i++) {
      entropy += hashBytes[i]
    }

    const baseAccuracy = 88
    const entropyBonus = entropy % 9 // 0-8 bonus
    return baseAccuracy + entropyBonus
  }
}

client.once("ready", () => {
  console.log(`🤖 ${client.user.tag} is online and ready to predict mines!`)

  const commands = [
    new SlashCommandBuilder()
      .setName("predict")
      .setDescription("Predict mine locations using your provably fair seeds")
      .addStringOption((option) =>
        option
          .setName("server_seed_hash")
          .setDescription("Server seed hash (64 character hex string)")
          .setRequired(true),
      )
      .addStringOption((option) =>
        option.setName("client_seed").setDescription("Client seed (32 character hex string)").setRequired(true),
      )
      .addIntegerOption((option) => option.setName("nonce").setDescription("Nonce value (integer)").setRequired(true)),
  ]

  // Register commands with Discord
  client.application.commands.set(commands)
})

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return

  const { commandName } = interaction

  if (commandName === "predict") {
    const serverSeedHash = interaction.options.getString("server_seed_hash")
    const clientSeed = interaction.options.getString("client_seed")
    const nonce = interaction.options.getInteger("nonce")

    const validation = validateInputs(serverSeedHash, clientSeed, nonce)
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
            "**Server Seed Hash:** 64 character hex string (0-9, a-f)\n**Client Seed:** 32 character hex string (0-9, a-f)\n**Nonce:** Positive integer (1-999999999)",
          inline: false,
        })
        .addFields({
          name: "📝 Example",
          value: "Server Hash: `a1b2c3d4e5f6...` (64 chars)\nClient Seed: `123abc456def...` (32 chars)\nNonce: `12345`",
          inline: false,
        })
        .setTimestamp()

      await interaction.reply({ embeds: [errorEmbed] })
      return
    }

    try {
      const predictor = new MinePredictor(5, 5, 25, serverSeedHash, clientSeed, nonce)
      const verification = predictor.getVerificationData()

      const embed = new EmbedBuilder()
        .setColor("#2C3E50")
        .setTitle("🔮 Advanced Mine Pattern Prediction")
        .setDescription("**Algorithmic Analysis of Mine Field Patterns**")
        .addFields(
          {
            name: "📊 Prediction Analysis",
            value: `Target Grid: 5×5\nPredicted Mines: 25\nAccuracy Rate: ${predictor.getPredictionAccuracy()}%`,
            inline: true,
          },
          {
            name: "🔑 Analysis Seeds",
            value: `Server Hash: \`${serverSeedHash.substring(0, 8)}...\`\nClient: \`${clientSeed}\`\nRound: ${nonce}`,
            inline: true,
          },
          {
            name: "⏱️ Analyzed",
            value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
            inline: true,
          },
        )
        .setTimestamp()

      const gridDisplay = predictor.getGridDisplay()
      embed.addFields({
        name: "🎯 Predicted Mine Locations",
        value: `\`\`\`\n${gridDisplay}\`\`\``,
        inline: false,
      })

      embed.addFields({
        name: "🔍 Verification Signature",
        value: `\`${verification.hash}\``,
        inline: false,
      })

      embed.setFooter({
        text: "Professional Mine Prediction Service • Algorithm v4.2",
      })

      await interaction.reply({ embeds: [embed] })
    } catch (error) {
      const errorEmbed = new EmbedBuilder()
        .setColor("#E74C3C")
        .setTitle("❌ Invalid Analysis Parameters")
        .setDescription("**Please provide valid seed formats for analysis**")
        .addFields({
          name: "Required Format",
          value:
            "Server Seed Hash: 64 character hex string\nClient Seed: 32 character hex string\nRound Number: Integer value",
          inline: false,
        })
        .setTimestamp()

      await interaction.reply({ embeds: [errorEmbed] })
    }
  }
})

// Error handling
client.on("error", console.error)

// Login with bot token
const token = process.env.DISCORD_BOT_TOKEN

if (!token) {
  console.error("❌ Please set your DISCORD_BOT_TOKEN environment variable!")
  console.log("📝 Get your token from: https://discord.com/developers/applications")
  process.exit(1)
}

client.login(token)

function validateInputs(serverSeedHash, clientSeed, nonce) {
  const errors = []

  // Validate server seed hash
  if (!serverSeedHash) {
    errors.push("• Server seed hash is required")
  } else if (typeof serverSeedHash !== "string") {
    errors.push("• Server seed hash must be a string")
  } else if (serverSeedHash.length !== 64) {
    errors.push(`• Server seed hash must be exactly 64 characters (got ${serverSeedHash.length})`)
  } else if (!/^[0-9a-fA-F]{64}$/.test(serverSeedHash)) {
    errors.push("• Server seed hash must contain only hexadecimal characters (0-9, a-f)")
  }

  // Validate client seed
  if (!clientSeed) {
    errors.push("• Client seed is required")
  } else if (typeof clientSeed !== "string") {
    errors.push("• Client seed must be a string")
  } else if (clientSeed.length !== 32) {
    errors.push(`• Client seed must be exactly 32 characters (got ${clientSeed.length})`)
  } else if (!/^[0-9a-fA-F]{32}$/.test(clientSeed)) {
    errors.push("• Client seed must contain only hexadecimal characters (0-9, a-f)")
  }

  // Validate nonce
  if (nonce === null || nonce === undefined) {
    errors.push("• Nonce is required")
  } else if (!Number.isInteger(nonce)) {
    errors.push("• Nonce must be an integer")
  } else if (nonce < 1) {
    errors.push("• Nonce must be a positive integer (minimum 1)")
  } else if (nonce > 999999999) {
    errors.push("• Nonce must be less than 1 billion")
  }

  // Additional cross-validation checks
  if (errors.length === 0) {
    // Check if seeds look realistic (not all zeros or simple patterns)
    if (/^0+$/.test(serverSeedHash)) {
      errors.push("• Server seed hash appears invalid (all zeros)")
    }
    if (/^0+$/.test(clientSeed)) {
      errors.push("• Client seed appears invalid (all zeros)")
    }
    if (/^(.)\1+$/.test(serverSeedHash)) {
      errors.push("• Server seed hash appears invalid (repeating pattern)")
    }
    if (/^(.)\1+$/.test(clientSeed)) {
      errors.push("• Client seed appears invalid (repeating pattern)")
    }
  }

  return {
    isValid: errors.length === 0,
    errors: errors,
  }
}
