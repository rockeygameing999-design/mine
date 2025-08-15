import { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder } from "discord.js"

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
})

// Mine predictor class
class MinePredictor {
  constructor(width = 9, height = 9, mines = 10) {
    this.width = width
    this.height = height
    this.mines = mines
    this.grid = []
    this.generatePrediction()
  }

  generatePrediction() {
    // Initialize empty grid
    this.grid = Array(this.height)
      .fill()
      .map(() => Array(this.width).fill(false))

    // Place random mines
    let minesPlaced = 0
    while (minesPlaced < this.mines) {
      const x = Math.floor(Math.random() * this.width)
      const y = Math.floor(Math.random() * this.height)

      if (!this.grid[y][x]) {
        this.grid[y][x] = true
        minesPlaced++
      }
    }
  }

  getGridDisplay() {
    const emojis = {
      mine: "💣",
      safe: "🟩",
      number: ["0️⃣", "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣"],
    }

    let display = ""
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.grid[y][x]) {
          display += emojis.mine
        } else {
          // Calculate adjacent mines for fun
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
}

// Difficulty presets
const difficulties = {
  easy: { width: 9, height: 9, mines: 10 },
  medium: { width: 16, height: 16, mines: 40 },
  hard: { width: 30, height: 16, mines: 99 },
  custom: { width: 8, height: 8, mines: 8 },
}

client.once("ready", () => {
  console.log(`🤖 ${client.user.tag} is online and ready to predict mines!`)

  // Register slash commands
  const commands = [
    new SlashCommandBuilder()
      .setName("predict")
      .setDescription("Predict mine locations on a grid!")
      .addStringOption((option) =>
        option
          .setName("difficulty")
          .setDescription("Choose difficulty level")
          .setRequired(false)
          .addChoices(
            { name: "Easy (9x9, 10 mines)", value: "easy" },
            { name: "Medium (16x16, 40 mines)", value: "medium" },
            { name: "Hard (30x16, 99 mines)", value: "hard" },
            { name: "Fun (8x8, 8 mines)", value: "custom" },
          ),
      ),

    new SlashCommandBuilder().setName("quickmine").setDescription("Quick 5x5 mine prediction for fast fun!"),

    new SlashCommandBuilder().setName("minehelp").setDescription("Learn how to use the mine predictor bot"),
  ]

  // Register commands with Discord
  client.application.commands.set(commands)
})

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return

  const { commandName } = interaction

  if (commandName === "predict") {
    const difficulty = interaction.options.getString("difficulty") || "easy"
    const config = difficulties[difficulty]

    const predictor = new MinePredictor(config.width, config.height, config.mines)

    // For large grids, we'll show coordinates instead of full grid
    const isLargeGrid = config.width * config.height > 144

    const embed = new EmbedBuilder()
      .setColor("#FF6B6B")
      .setTitle("🔮 Mine Prediction Results!")
      .setDescription(`**Difficulty:** ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}`)
      .addFields(
        {
          name: "📊 Grid Info",
          value: `${config.width}x${config.height} grid with ${config.mines} mines`,
          inline: true,
        },
        { name: "🎯 Accuracy", value: `${Math.floor(Math.random() * 15 + 85)}%`, inline: true },
        { name: "🎲 Prediction ID", value: `#${Math.floor(Math.random() * 9999)}`, inline: true },
      )
      .setFooter({ text: "Remember: This is just for fun! 🎮" })
      .setTimestamp()

    if (isLargeGrid) {
      const mineCoords = predictor.getMineCoordinates()
      embed.addFields({
        name: "💣 Predicted Mine Locations",
        value: mineCoords.slice(0, 20).join(", ") + (mineCoords.length > 20 ? "..." : ""),
        inline: false,
      })
    } else {
      const gridDisplay = predictor.getGridDisplay()
      embed.addFields({
        name: "🗺️ Predicted Grid",
        value: `\`\`\`\n${gridDisplay}\`\`\``,
        inline: false,
      })
    }

    await interaction.reply({ embeds: [embed] })
  } else if (commandName === "quickmine") {
    const predictor = new MinePredictor(5, 5, 6)
    const gridDisplay = predictor.getGridDisplay()

    const embed = new EmbedBuilder()
      .setColor("#4ECDC4")
      .setTitle("⚡ Quick Mine Prediction!")
      .setDescription("Here's a fast 5x5 prediction for you!")
      .addFields({
        name: "🗺️ Mini Grid",
        value: `\`\`\`\n${gridDisplay}\`\`\``,
        inline: false,
      })
      .addFields(
        { name: "💣 Mines", value: "6", inline: true },
        { name: "🎯 Confidence", value: `${Math.floor(Math.random() * 20 + 80)}%`, inline: true },
      )
      .setFooter({ text: "Quick and fun! 🚀" })

    await interaction.reply({ embeds: [embed] })
  } else if (commandName === "minehelp") {
    const embed = new EmbedBuilder()
      .setColor("#9B59B6")
      .setTitle("🤖 Mine Predictor Bot Help")
      .setDescription("Welcome to the fun mine predictor! Here's how to use it:")
      .addFields(
        {
          name: "🔮 /predict [difficulty]",
          value:
            "Generate a mine prediction with different difficulty levels:\n• **Easy**: 9x9 grid, 10 mines\n• **Medium**: 16x16 grid, 40 mines\n• **Hard**: 30x16 grid, 99 mines\n• **Fun**: 8x8 grid, 8 mines",
          inline: false,
        },
        {
          name: "⚡ /quickmine",
          value: "Get a quick 5x5 mine prediction for instant fun!",
          inline: false,
        },
        {
          name: "📖 Legend",
          value: "💣 = Predicted mine\n🟩 = Safe spot\n0️⃣-8️⃣ = Number of adjacent mines",
          inline: false,
        },
        {
          name: "⚠️ Important Note",
          value:
            "This bot is purely for entertainment! The predictions are completely random and not based on any real minesweeper game.",
          inline: false,
        },
      )
      .setFooter({ text: "Have fun mining! ⛏️" })

    await interaction.reply({ embeds: [embed] })
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
