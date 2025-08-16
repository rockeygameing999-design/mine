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

class MinePredictor {
  constructor(width = 5, height = 5, safeMines = 1, serverSeedHash = null, nonce = null, website = "rollbet") {
    this.width = width
    this.height = height
    this.safeMines = safeMines
    this.mines = 25 - safeMines
    this.serverSeedHash = serverSeedHash || this.generateServerSeedHash()
    this.nonce = nonce || Math.floor(Math.random() * 1000000)
    this.website = website
    this.grid = []
    this.generatePredictionGrid()
  }

  generateServerSeedHash() {
    const serverSeed = crypto.randomBytes(32).toString("hex")
    return crypto.createHash("sha256").update(serverSeed).digest("hex")
  }

  generatePredictionGrid() {
    if (this.website === "rollbet") {
      this.generateRollbetGrid()
    } else {
      this.generateGenericGrid()
    }
  }

  generateRollbetGrid() {
    const combinedSeed = `rollbet:${this.serverSeedHash}:${this.nonce}:${this.safeMines}`
    const primaryHash = crypto.createHash("sha512").update(combinedSeed).digest("hex")
    const rollbetSecondary = crypto.createHash("sha256").update(`${combinedSeed}:rollbet:entropy`).digest("hex")

    this.grid = Array(this.height)
      .fill()
      .map(() => Array(this.width).fill(false))

    const totalCells = this.width * this.height
    const minePositions = new Set()

    let hashIndex = 0
    let iteration = 0
    const maxIterations = 1000

    while (minePositions.size < this.mines && iteration < maxIterations) {
      if (hashIndex + 16 > primaryHash.length) {
        const rollbetSeed = `rollbet:${combinedSeed}:iter:${iteration}`
        const newHash = crypto.createHash("sha512").update(rollbetSeed).digest("hex")
        hashIndex = 0
        iteration++
        continue
      }

      const hexChunk = primaryHash.substr(hashIndex, 16)
      const value = BigInt("0x" + hexChunk)
      const position = Number(value % BigInt(totalCells))

      if (!minePositions.has(position)) {
        minePositions.add(position)
      }

      hashIndex += 16
      iteration++
    }

    const rollbetPositions = this.applyRollbetPatterns(Array.from(minePositions), rollbetSecondary)

    rollbetPositions.forEach((position) => {
      const x = position % this.width
      const y = Math.floor(position / this.width)
      this.grid[y][x] = true
    })
  }

  generateGenericGrid() {
    const combinedSeed = `${this.serverSeedHash}:${this.nonce}:${this.safeMines}`
    const primaryHash = crypto.createHash("sha512").update(combinedSeed).digest("hex")
    const secondaryHash = crypto.createHash("sha256").update(`${combinedSeed}:secondary`).digest("hex")

    this.grid = Array(this.height)
      .fill()
      .map(() => Array(this.width).fill(false))

    const totalCells = this.width * this.height
    const minePositions = new Set()

    let hashIndex = 0
    let iteration = 0
    const maxIterations = 1000

    while (minePositions.size < this.mines && iteration < maxIterations) {
      if (hashIndex + 8 > primaryHash.length) {
        const iterationSeed = `${combinedSeed}:iter:${iteration}`
        const newHash = crypto.createHash("sha512").update(iterationSeed).digest("hex")
        hashIndex = 0
        iteration++
        continue
      }

      const hexChunk = primaryHash.substr(hashIndex, 8)
      const value = Number.parseInt(hexChunk, 16)
      const position = this.biasReduction(value, totalCells, iteration)

      if (!minePositions.has(position)) {
        minePositions.add(position)
      }

      hashIndex += 8
      iteration++
    }

    const finalPositions = this.applyGamblingPatterns(Array.from(minePositions), secondaryHash)

    finalPositions.forEach((position) => {
      const x = position % this.width
      const y = Math.floor(position / this.width)
      this.grid[y][x] = true
    })
  }

  applyRollbetPatterns(positions, hash) {
    if (positions.length < this.mines) {
      const missing = this.mines - positions.length
      const usedPositions = new Set(positions)

      for (let i = 0; i < missing; i++) {
        const hashIndex = (i * 16) % (hash.length - 16)
        const hexChunk = hash.substr(hashIndex, 16)
        const value = BigInt("0x" + hexChunk)
        let newPos = Number(value % BigInt(25))

        while (usedPositions.has(newPos)) {
          newPos = (newPos + 1) % 25
        }
        positions.push(newPos)
        usedPositions.add(newPos)
      }
    }

    return this.optimizeRollbetDistribution(positions, hash)
  }

  optimizeRollbetDistribution(positions, hash) {
    const optimized = [...positions]
    const rollbetEntropy = Number(BigInt("0x" + hash.substr(0, 16)) % BigInt(1000000)) / 1000000

    if (this.mines <= 5) {
      return this.rollbetScatterPattern(optimized, rollbetEntropy)
    } else if (this.mines >= 18) {
      return this.rollbetSafeCorridors(optimized, rollbetEntropy)
    } else {
      return this.rollbetDiagonalClustering(optimized, rollbetEntropy)
    }
  }

  rollbetScatterPattern(positions, entropy) {
    const scattered = []
    const edgePositions = [0, 1, 2, 3, 4, 5, 9, 10, 14, 15, 19, 20, 21, 22, 23, 24]

    positions.forEach((pos, index) => {
      if (entropy > 0.6 && edgePositions.includes(pos)) {
        scattered.push(pos)
      } else if (entropy <= 0.4) {
        const centerBias = [6, 7, 8, 11, 12, 13, 16, 17, 18]
        const newPos = centerBias[index % centerBias.length] || pos
        scattered.push(newPos)
      } else {
        scattered.push(pos)
      }
    })

    return scattered.slice(0, this.mines)
  }

  rollbetSafeCorridors(positions, entropy) {
    const corridored = [...positions]
    const safeCorridors = [
      [2, 7, 12, 17, 22],
      [10, 11, 12, 13, 14],
      [0, 6, 12, 18, 24],
    ]

    const selectedCorridor = safeCorridors[Math.floor(entropy * safeCorridors.length)]

    selectedCorridor.forEach((safePos) => {
      const index = corridored.indexOf(safePos)
      if (index !== -1 && entropy > 0.3) {
        let newPos = (safePos + 5) % 25
        while (corridored.includes(newPos) || selectedCorridor.includes(newPos)) {
          newPos = (newPos + 1) % 25
        }
        corridored[index] = newPos
      }
    })

    return corridored
  }

  rollbetDiagonalClustering(positions, entropy) {
    const clustered = [...positions]
    const diagonalSets = [
      [0, 6, 12, 18, 24],
      [4, 8, 12, 16, 20],
      [1, 7, 13, 19],
      [5, 9, 13, 17],
    ]

    if (entropy > 0.5) {
      const selectedDiagonal = diagonalSets[Math.floor(entropy * diagonalSets.length)]
      const clusterCount = Math.min(3, Math.floor(this.mines / 3))

      for (let i = 0; i < clusterCount && i < clustered.length; i++) {
        if (selectedDiagonal.includes(clustered[i])) continue

        const nearestDiagonal = selectedDiagonal.find(
          (pos) =>
            Math.abs((pos % 5) - (clustered[i] % 5)) <= 1 &&
            Math.abs(Math.floor(pos / 5) - Math.floor(clustered[i] / 5)) <= 1,
        )

        if (nearestDiagonal && !clustered.includes(nearestDiagonal)) {
          clustered[i] = nearestDiagonal
        }
      }
    }

    return clustered
  }

  biasReduction(value, range, iteration) {
    const maxValue = Math.floor(0xffffffff / range) * range
    if (value >= maxValue) {
      return (value ^ iteration) % range
    }
    return value % range
  }

  applyGamblingPatterns(positions, secondaryHash) {
    if (positions.length < this.mines) {
      const missing = this.mines - positions.length
      const usedPositions = new Set(positions)

      for (let i = 0; i < missing; i++) {
        const hashIndex = (i * 8) % (secondaryHash.length - 8)
        const hexChunk = secondaryHash.substr(hashIndex, 8)
        const value = Number.parseInt(hexChunk, 16)
        let newPos = value % 25

        while (usedPositions.has(newPos)) {
          newPos = (newPos + 1) % 25
        }
        positions.push(newPos)
        usedPositions.add(newPos)
      }
    }

    return this.optimizeDistribution(positions, secondaryHash)
  }

  optimizeDistribution(positions, hash) {
    const optimized = [...positions]
    const entropyValue = Number.parseInt(hash.substr(0, 8), 16) / 0xffffffff

    if (this.mines <= 3) {
      return this.scatterMines(optimized, entropyValue)
    } else if (this.mines >= 20) {
      return this.createSafeZones(optimized, entropyValue)
    } else {
      return this.balancedClustering(optimized, entropyValue)
    }
  }

  scatterMines(positions, entropy) {
    const scattered = []
    const grid = Array(5)
      .fill()
      .map(() => Array(5).fill(false))

    positions.forEach((pos) => {
      const x = pos % 5
      const y = Math.floor(pos / 5)
      grid[y][x] = true
    })

    for (const pos of positions) {
      const x = pos % 5
      const y = Math.floor(pos / 5)
      const adjacentMines = this.countAdjacentMinesAt(x, y, grid)

      if (adjacentMines <= 1 || entropy > 0.7) {
        scattered.push(pos)
      } else {
        const betterPos = this.findBetterPosition(pos, grid, entropy)
        scattered.push(betterPos)
      }
    }

    return scattered.slice(0, this.mines)
  }

  createSafeZones(positions, entropy) {
    const safeZoned = [...positions]
    const safeZonePositions = [0, 4, 20, 24, 2, 10, 14, 22]

    if (entropy > 0.5) {
      safeZonePositions.forEach((safePos) => {
        const index = safeZoned.indexOf(safePos)
        if (index !== -1 && Math.random() > 0.3) {
          let newPos = (safePos + 7) % 25
          while (safeZoned.includes(newPos)) {
            newPos = (newPos + 1) % 25
          }
          safeZoned[index] = newPos
        }
      })
    }

    return safeZoned
  }

  balancedClustering(positions, entropy) {
    const clustered = [...positions]
    const clusterProbability = 0.4 + entropy * 0.3

    if (entropy < clusterProbability && this.mines >= 5) {
      const numClusters = Math.min(2, Math.floor(this.mines / 4))

      for (let cluster = 0; cluster < numClusters; cluster++) {
        const baseIndex = cluster * 3
        if (baseIndex < clustered.length) {
          const basePos = clustered[baseIndex]
          const baseX = basePos % 5
          const baseY = Math.floor(basePos / 5)

          for (let i = 1; i < 3 && baseIndex + i < clustered.length; i++) {
            const adjacentPos = this.findAdjacentPosition(baseX, baseY, clustered)
            if (adjacentPos !== -1) {
              clustered[baseIndex + i] = adjacentPos
            }
          }
        }
      }
    }

    return clustered
  }

  countAdjacentMinesAt(x, y, grid) {
    let count = 0
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue
        const nx = x + dx
        const ny = y + dy
        if (nx >= 0 && nx < 5 && ny >= 0 && ny < 5 && grid[ny][nx]) {
          count++
        }
      }
    }
    return count
  }

  findBetterPosition(originalPos, grid, entropy) {
    const candidates = []
    for (let pos = 0; pos < 25; pos++) {
      const x = pos % 5
      const y = Math.floor(pos / 5)
      if (!grid[y][x]) {
        const adjacentCount = this.countAdjacentMinesAt(x, y, grid)
        candidates.push({ pos, adjacentCount })
      }
    }

    candidates.sort((a, b) => a.adjacentCount - b.adjacentCount)
    const topCandidates = candidates.slice(0, Math.max(1, Math.floor(candidates.length * 0.3)))
    const selectedIndex = Math.floor(entropy * topCandidates.length)
    return topCandidates[selectedIndex]?.pos || originalPos
  }

  findAdjacentPosition(x, y, usedPositions) {
    const adjacent = []
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue
        const nx = x + dx
        const ny = y + dy
        if (nx >= 0 && nx < 5 && ny >= 0 && ny < 5) {
          const pos = ny * 5 + nx
          if (!usedPositions.includes(pos)) {
            adjacent.push(pos)
          }
        }
      }
    }
    return adjacent.length > 0 ? adjacent[0] : -1
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
      nonce: this.nonce,
      safeMines: this.safeMines,
      website: this.website,
      hash: crypto.createHash("sha256").update(`${this.website}:${this.serverSeedHash}:${this.nonce}`).digest("hex"),
    }
  }

  getRollbetAnalysis() {
    const verification = this.getVerificationData()
    const hashBytes = Buffer.from(verification.hash, "hex")

    let entropy = 0
    for (let i = 0; i < Math.min(hashBytes.length, 16); i++) {
      entropy += hashBytes[i]
    }

    const entropyScore = (entropy % 100) / 100
    const clusteringFactor = entropyScore > 0.6 ? "High" : entropyScore > 0.3 ? "Medium" : "Low"
    const riskLevel = this.mines <= 5 ? "Conservative" : this.mines >= 18 ? "Aggressive" : "Balanced"

    return {
      entropyScore: Math.round(entropyScore * 100),
      clusteringFactor,
      riskLevel,
      patternType: this.mines <= 5 ? "Scatter" : this.mines >= 18 ? "Safe Corridors" : "Diagonal Clusters",
    }
  }
}

const verifiedUsers = new Map()
const ADMIN_USER_IDS = ["862245514313203712", "1321546526790651967"]
const verificationCodes = new Map([
  ["MINES2024", { expires: null }],
  ["PREDICT123", { expires: null }],
  ["VERIFIED", { expires: null }],
])

client.once("ready", () => {
  console.log(`🤖 ${client.user.tag} is online and ready to predict mines!`)

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
          .setName("website")
          .setDescription("Select the gambling website")
          .setRequired(true)
          .addChoices({ name: "Rollbet", value: "rollbet" }),
      )
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
  ]

  client.application.commands.set(commands)
})

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return

  const { commandName } = interaction

  if (commandName === "admin") {
    if (!ADMIN_USER_IDS.includes(interaction.user.id)) {
      const unauthorizedEmbed = new EmbedBuilder()
        .setColor("#E74C3C")
        .setTitle("🚫 Access Denied")
        .setDescription("**You are not authorized to use admin commands**")
        .setTimestamp()

      await interaction.reply({ embeds: [unauthorizedEmbed], ephemeral: true })
      return
    }

    const subcommand = interaction.options.getSubcommand()

    if (subcommand === "generate") {
      const count = interaction.options.getInteger("count") || 1
      const duration = interaction.options.getInteger("duration")
      const maxCount = Math.min(count, 10)
      const newCodes = []

      for (let i = 0; i < maxCount; i++) {
        const code = generateVerificationCode()
        const expires = duration ? Date.now() + duration * 60 * 60 * 1000 : null
        verificationCodes.set(code, { expires })
        newCodes.push({ code, expires })
      }

      const generateEmbed = new EmbedBuilder()
        .setColor("#27AE60")
        .setTitle("✅ Verification Codes Generated")
        .setDescription("**New verification codes have been created**")
        .addFields({
          name: "🔑 Generated Codes",
          value: newCodes
            .map(({ code, expires }) => {
              const expiryText = expires ? `(expires <t:${Math.floor(expires / 1000)}:R>)` : "(permanent)"
              return `\`${code}\` ${expiryText}`
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
        .setFooter({ text: "Admin Panel • Code Generation" })

      await interaction.reply({ embeds: [generateEmbed], ephemeral: true })
    } else if (subcommand === "list") {
      cleanExpiredCodes()
      cleanExpiredUsers()

      const codesList =
        Array.from(verificationCodes.entries())
          .map(([code, data]) => {
            const expiryText = data.expires ? `(expires <t:${Math.floor(data.expires / 1000)}:R>)` : "(permanent)"
            return `\`${code}\` ${expiryText}`
          })
          .join("\n") || "No codes available"

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
        .setFooter({ text: "Admin Panel • Code Management" })

      await interaction.reply({ embeds: [listEmbed], ephemeral: true })
    } else if (subcommand === "remove") {
      const codeToRemove = interaction.options.getString("code").toUpperCase()

      if (verificationCodes.has(codeToRemove)) {
        verificationCodes.delete(codeToRemove)

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
          .setTimestamp()

        await interaction.reply({ embeds: [removeEmbed], ephemeral: true })
      } else {
        const notFoundEmbed = new EmbedBuilder()
          .setColor("#E74C3C")
          .setTitle("❌ Code Not Found")
          .setDescription("**The specified verification code does not exist**")
          .setTimestamp()

        await interaction.reply({ embeds: [notFoundEmbed], ephemeral: true })
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
        .setFooter({ text: "Admin Panel • System Statistics" })

      await interaction.reply({ embeds: [statsEmbed], ephemeral: true })
    }

    return
  }

  if (commandName === "redeem") {
    const code = interaction.options.getString("code").toUpperCase()

    cleanExpiredCodes()
    cleanExpiredUsers()

    if (verificationCodes.has(code)) {
      const codeData = verificationCodes.get(code)
      const userExpiration = codeData.expires

      verifiedUsers.set(interaction.user.id, { expires: userExpiration })

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
        .setFooter({ text: "Professional Mine Prediction Service" })

      await interaction.reply({ embeds: [successEmbed], ephemeral: true })
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
        .setTimestamp()

      await interaction.reply({ embeds: [errorEmbed], ephemeral: true })
    }
    return
  }

  if (commandName === "predict") {
    try {
      await interaction.deferReply()

      cleanExpiredUsers()

      const userData = verifiedUsers.get(interaction.user.id)
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
          .setFooter({ text: "Professional Mine Prediction Service • Verification Required" })

        await interaction.editReply({ embeds: [verificationRequiredEmbed] })
        return
      }

      if (userData.expires && Date.now() > userData.expires) {
        verifiedUsers.delete(interaction.user.id)

        const expiredEmbed = new EmbedBuilder()
          .setColor("#E74C3C")
          .setTitle("⏰ Access Expired")
          .setDescription("**Your verification code has expired**")
          .addFields({
            name: "🔄 Renew Access",
            value: "Please redeem a new verification code to continue using the prediction service.",
            inline: false,
          })
          .setTimestamp()

        await interaction.editReply({ embeds: [expiredEmbed] })
        return
      }

      const website = interaction.options.getString("website")
      const serverSeedHash = interaction.options.getString("server_seed_hash")
      const safeMines = interaction.options.getInteger("safe_mines")
      const nonce = interaction.options.getInteger("nonce")

      const validation = validateInputs(serverSeedHash, safeMines, nonce)
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
          .setTimestamp()

        await interaction.editReply({ embeds: [errorEmbed] })
        return
      }

      const predictor = new MinePredictor(5, 5, safeMines, serverSeedHash, nonce, website)
      const verification = predictor.getVerificationData()

      const embed = new EmbedBuilder()
        .setColor("#2C3E50")
        .setTitle("🔮 Advanced Mine Pattern Prediction")
        .setDescription(
          `**Algorithmic Analysis for ${website.charAt(0).toUpperCase() + website.slice(1)} Mine Field Patterns**`,
        )

      if (website === "rollbet") {
        const rollbetAnalysis = predictor.getRollbetAnalysis()

        embed.addFields(
          {
            name: "🎰 Rollbet Analysis",
            value: `Pattern: ${rollbetAnalysis.patternType}\nClustering: ${rollbetAnalysis.clusteringFactor}\nRisk Level: ${rollbetAnalysis.riskLevel}\nEntropy Score: ${rollbetAnalysis.entropyScore}%`,
            inline: true,
          },
          {
            name: "📊 Prediction Data",
            value: `Target Grid: 5×5\nSafe Mines: ${safeMines}\nDangerous Mines: ${predictor.mines}`,
            inline: true,
          },
          {
            name: "🔑 Rollbet Seeds",
            value: `Server Hash: \`${serverSeedHash.substring(0, 8)}...\`\nRound: ${nonce}`,
            inline: true,
          },
        )
      } else {
        embed.addFields(
          {
            name: "📊 Prediction Analysis",
            value: `Website: ${website.charAt(0).toUpperCase() + website.slice(1)}\nTarget Grid: 5×5\nSafe Mines: ${safeMines}\nDangerous Mines: ${predictor.mines}`,
            inline: true,
          },
          {
            name: "🔑 Analysis Seeds",
            value: `Server Hash: \`${serverSeedHash.substring(0, 8)}...\`\nRound: ${nonce}`,
            inline: true,
          },
          {
            name: "⏱️ Analyzed",
            value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
            inline: true,
          },
        )
      }

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
        text: `Professional Mine Prediction Service • ${website.charAt(0).toUpperCase() + website.slice(1)} Algorithm v4.2`,
      })

      await interaction.editReply({ embeds: [embed] })
    } catch (error) {
      console.error("Error in predict command:", error)

      try {
        const errorEmbed = new EmbedBuilder()
          .setColor("#E74C3C")
          .setTitle("❌ Prediction Error")
          .setDescription("**An error occurred while processing your prediction**")
          .addFields({
            name: "🔧 Troubleshooting",
            value: "Please check your input parameters and try again. If the issue persists, contact an administrator.",
            inline: false,
          })
          .setTimestamp()

        if (interaction.deferred) {
          await interaction.editReply({ embeds: [errorEmbed] })
        } else {
          await interaction.reply({ embeds: [errorEmbed] })
        }
      } catch (replyError) {
        console.error("Error sending error message:", replyError)
      }
    }
  }
})

client.on("error", console.error)

const token = process.env.DISCORD_BOT_TOKEN

if (!token) {
  console.error("❌ Please set your DISCORD_BOT_TOKEN environment variable!")
  console.log("📝 Get your token from: https://discord.com/developers/applications")
  process.exit(1)
}

client.login(token)

function validateInputs(serverSeedHash, safeMines, nonce) {
  const errors = []

  if (!serverSeedHash) {
    errors.push("• Server seed hash is required")
  } else if (typeof serverSeedHash !== "string") {
    errors.push("• Server seed hash must be a string")
  } else if (serverSeedHash.length !== 64) {
    errors.push(`• Server seed hash must be exactly 64 characters (got ${serverSeedHash.length})`)
  } else if (!/^[0-9a-fA-F]{64}$/.test(serverSeedHash)) {
    errors.push("• Server seed hash must contain only hexadecimal characters (0-9, a-f)")
  }

  if (safeMines === null || safeMines === undefined) {
    errors.push("• Safe mines count is required")
  } else if (!Number.isInteger(safeMines)) {
    errors.push("• Safe mines must be an integer")
  } else if (safeMines < 1) {
    errors.push("• Safe mines must be at least 1")
  } else if (safeMines > 24) {
    errors.push("• Safe mines cannot exceed 24 (maximum safe tiles)")
  }

  if (nonce === null || nonce === undefined) {
    errors.push("• Nonce is required")
  } else if (!Number.isInteger(nonce)) {
    errors.push("• Nonce must be an integer")
  } else if (nonce < 1) {
    errors.push("• Nonce must be a positive integer (minimum 1)")
  } else if (nonce > 999999999) {
    errors.push("• Nonce must be less than 1 billion")
  }

  if (errors.length === 0) {
    if (/^0+$/.test(serverSeedHash)) {
      errors.push("• Server seed hash appears invalid (all zeros)")
    }
    if (/^(.)\1+$/.test(serverSeedHash)) {
      errors.push("• Server seed hash appears invalid (repeating pattern)")
    }
  }

  return {
    isValid: errors.length === 0,
    errors: errors,
  }
}

function generateVerificationCode() {
  const prefixes = ["MINE", "PRED", "VERIFY", "ACCESS", "CODE"]
  const numbers = Math.floor(Math.random() * 9999)
    .toString()
    .padStart(4, "0")
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)]
  return `${prefix}${numbers}`
}

function cleanExpiredCodes() {
  const now = Date.now()
  for (const [code, data] of verificationCodes.entries()) {
    if (data.expires && now > data.expires) {
      verificationCodes.delete(code)
    }
  }
}

function cleanExpiredUsers() {
  const now = Date.now()
  for (const [userId, userData] of verifiedUsers.entries()) {
    if (userData.expires && now > userData.expires) {
      verifiedUsers.delete(userId)
    }
  }
}
