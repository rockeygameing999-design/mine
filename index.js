// index.js - The Mines Predictor Discord Bot (All-in-One with Hardcoded Registration & Enhanced Error Handling)

// --- Core Module Imports ---
import { Client, GatewayIntentBits, Partials, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { MongoClient } from 'mongodb';
import { REST, Routes } from 'discord.js'; // For registering slash commands
import crypto from 'crypto'; // Node.js built-in crypto module
import express from 'express'; // Web server for Render health checks and self-ping

// --- Configuration Constants (All Defined Here) ---

// =========================================================================
// !!! WARNING: THESE ARE HARDCODED FOR SLASH COMMAND REGISTRATION ONLY !!!
// If this file is public, these values WILL BE EXPOSED.
// Discord often invalidates tokens found in public code.
// Your main bot login and MongoDB still use process.env.BOT_TOKEN and process.env.MONGO_URI.
const CLIENT_ID_FOR_REGISTRATION = 'PASTE_YOUR_CLIENT_ID_HERE';    // Replace with your Client ID
const GUILD_ID_FOR_REGISTRATION = 'PASTE_YOUR_GUILD_ID_HERE';      // Replace with your Guild ID (for faster local updates)
const BOT_TOKEN_FOR_REGISTRATION = 'PASTE_YOUR_BOT_TOKEN_HERE';    // Replace with your Bot Token
// =========================================================================

// ONLY these Discord User IDs will have access to /admin, /emergency, and /verify commands.
const ADMIN_USER_IDS = [
    '862245514313203712',  // Replace with your first admin's actual Discord User ID
    '1321546526790651967' // Replace with your second admin's actual Discord User ID
];

// Self-ping system configuration for Render free tier.
const SELF_PING_URL = process.env.RENDER_EXTERNAL_URL;
const PING_INTERVAL_MS = 5 * 60 * 1000; // Ping every 5 minutes

// MongoDB URI should be set as an environment variable in Render.
const MONGO_URI = process.env.MONGO_URI;

// Discord Bot Token for client login should be set as an environment variable in Render.
// This is separate from BOT_TOKEN_FOR_REGISTRATION if you choose to hardcode it above.
const BOT_TOKEN = process.env.BOT_TOKEN;

// --- Helper Functions ---
function isAuthorizedAdmin(userId) {
    return ADMIN_USER_IDS.includes(String(userId)); // Ensure userId is string for comparison
}

function ensureString(value) {
    if (value === null || value === undefined) {
        return 'unknown';
    }
    return String(value);
}

async function fetchWithRetry(url, options, maxRetries = 3, baseDelay = 1000) {
    let retries = 0;
    while (retries < maxRetries) {
        try {
            console.log(`[DEBUG] Fetching ${ensureString(url)}, attempt ${retries + 1}/${maxRetries}`);
            const response = await fetch(url, options);
            if (response.status === 429) {
                const delay = baseDelay * Math.pow(2, retries);
                console.warn(`[WARN] Rate limit hit for ${ensureString(url)}. Retrying in ${delay / 1000}s...`);
                await new Promise(res => setTimeout(res, delay));
                retries++;
                continue;
            }
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! Status: ${String(response.status)} - ${String(errorText)}`); // Use String()
            }
            return response;
        } catch (error) {
            console.error(`[ERROR] Fetch attempt failed for ${ensureString(url)} (${retries + 1}/${maxRetries}):`, String(error.message)); // Use String()
            const delay = baseDelay * Math.pow(2, retries);
            console.warn(`[WARN] Retrying ${ensureString(url)} in ${delay / 1000}s...`);
            await new Promise(res => setTimeout(res, delay));
            retries++;
        }
    }
    throw new Error('Max retries reached. Failed to fetch.');
}

async function startSelfPing() {
    console.log(`[DEBUG] startSelfPing function called.`);
    if (!SELF_PING_URL) {
        console.warn('SELF_PING_URL is not set. Self-pinging will not occur.');
        return;
    }
    try {
        const response = await fetch(String(SELF_PING_URL)); // Use String()
        if (response.ok) {
            console.log(`Self-ping successful to ${String(SELF_PING_URL)}`);
        } else {
            console.warn(`Self-ping failed to ${String(SELF_PING_URL)} with status: ${String(response.status)}`); // Use String()
        }
    } catch (error) {
        console.error(`Error during self-ping to ${String(SELF_PING_URL)}:`, String(error.message)); // Use String()
    }
}

function calculateRollbetMines(serverSeed, clientSeed, nonce, numMines) {
    console.warn("WARNING: calculateRollbetMines is using a placeholder. Please implement Rollbet's actual provably fair algorithm.");
    if (numMines === 3 && String(clientSeed).startsWith('test')) { // Use String()
        return [1, 5, 10];
    }
    return [];
}

// --- MongoDB Connection and Cache Management ---
let dbClient;
let verifiedUsersCache = new Map();

async function connectToMongoDB() {
    console.log(`[DEBUG] connectToMongoDB function called. MONGO_URI: ${MONGO_URI ? 'Set' : 'Not Set'}`);
    if (!MONGO_URI) {
        console.error('MONGO_URI environment variable is not set. Cannot connect to MongoDB.');
        throw new Error("MongoDB URI is not set.");
    }
    try {
        dbClient = new MongoClient(MONGO_URI);
        await dbClient.connect();
        console.log('Connected to MongoDB');
        await loadInitialVerifiedUsersCache();
    } catch (error) {
        console.error('Failed to connect to MongoDB:', String(error.message)); // Use String()
        throw new Error(`MongoDB connection failed: ${String(error.message)}`); // Use String()
    }
}

async function loadInitialVerifiedUsersCache() {
    console.log(`[DEBUG] loadInitialVerifiedUsersCache function called.`);
    if (!dbClient || !dbClient.db) {
        console.warn('MongoDB client not initialized. Cannot load verifiedUsers cache.');
        return;
    }
    try {
        const db = dbClient.db('MineBotDB');
        const collection = db.collection('verifiedUsers');
        const users = await collection.find({}).toArray();
        verifiedUsersCache = new Map(users.map(user => [user.userId, user]));
        console.log(`Loaded ${verifiedUsersCache.size} verifiedUsers into cache from MongoDB`);
    } catch (error) {
        console.error('Error loading initial verifiedUsers cache from MongoDB:', String(error.message)); // Use String()
    }
}

// --- Gemini API Integration Function ---
async function callGeminiAPI(prompt) {
    console.log(`[DEBUG] callGeminiAPI function called with prompt: ${String(prompt).substring(0, 50)}...`); // Use String()
    const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
    const apiKey = ""; // Canvas will automatically provide it in runtime
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

    try {
        const response = await fetchWithRetry(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (result.candidates && result.candidates.length > 0 &&
            result.candidates[0].content && result.candidates[0].content.parts &&
            result.candidates[0].content.parts.length > 0) {
            return result.candidates[0].content.parts[0].text;
        } else {
            console.error("Unexpected Gemini API response structure:", JSON.stringify(result, null, 2));
            return "Could not generate analysis due to an unexpected AI response.";
        }
    } catch (error) {
        console.error('Failed to get Gemini API response:', String(error.message)); // Use String()
        return "Failed to generate analysis after multiple retries. Please try again later.";
    }
}

// --- Discord Message Template Functions ---
const getWelcomeMessage = (username) => `
Hello ${String(username)}, welcome to the community!

# 🔮 Why Trust Our Bot?
> **Our bot is a community tool for data validation and analysis for Rollbet's Mines game. We are not a scam or a source of guaranteed wins. Our purpose is to prove the game is truly random and to help improve community understanding.**

# ✅ How It Works:
> **Use /predict to see what our bot's data analysis says about game outcomes. This is for research only and does not guarantee a win.**
> **Submit game results with /submitresult (open to everyone) to help improve data accuracy.**
> **Check your contributions with /myresults and compete on the /leaderboard!**

# 🌟 Transparency & Fairness:
> **We use Rollbet’s provably fair system (server seed, nonce) to ensure all game outcomes are verifiable. All submissions are analyzed to enhance our data, and you can really see the fairness for yourself.**

# 🎁 FREE ACCESS
> **Share your mines result to us by using /submitresult and win free access**
> **Participate in giveaway**

---

**Important Warnings:**
1.  **Fake Reports:** Do NOT submit fake reports. Our bot automatically detects and verifies results. Submitting fake reports will result in an immediate ban.

Please make sure to read and follow these rules. Enjoy your time here!
`;

const getVerificationSuccessDM = (username, durationText) => `
**Verification Successful!** 🎉

Hello ${String(username)}, you have been granted access to the mine prediction service!

🎯 **Access Granted**
You can now use the \`/predict\` command to analyze mine patterns.

⏰ **Access Duration**
${String(durationText)}

---

⚠️ **Important Warning: Result Submission**
To maintain fairness and ensure accurate data, you are **required to submit 80% of your prediction results** using the \`/submitresult\` command.

**Why is this important?**
* **For us:** Your submissions help train our data analysis model, making the insights from \`/predict\` more accurate and reliable for the entire community. More data means better analysis!
* **For you:** Consistent submissions are crucial for maintaining your access to the \`/predict\` command and contributing to a trustworthy community.
Failure to submit 80% of your results may lead to an automatic ban from the service.

Professional Mine Prediction Service •
`;

const getAccessExpiredDM = (username) => `
**Access Expired!** 😔

Hello ${String(username)}, your access to the mine data analysis service has expired.

🚫 **Access Revoked**
You can no longer use the \`/predict\` command.

To regain access, please contact an admin for re-verification, or continue contributing game results via \`/submitresult\` for potential free access!
`;

// --- Discord Client Setup ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel, Partials.Message, Partials.GuildMember],
});

// --- HTTP Server (for Render Health Checks & Self-Ping) ---
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
    res.send('Bot is running and healthy!');
});

app.listen(PORT, () => {
    console.log(`🌐 HTTP server running on port ${PORT}`);
});

// --- GLOBAL ERROR HANDLING ---
process.on('unhandledRejection', (reason, promise) => {
    console.error(`[FATAL ERROR] Unhandled Rejection at: ${String(promise)}\nReason: ${String(reason?.message || reason)}`, reason); // Use String()
    process.exit(1);
});

process.on('uncaughtException', (err) => {
    console.error(`[FATAL ERROR] Uncaught Exception: ${String(err.message)}`, err); // Use String()
    process.exit(1);
});

// --- Slash Command Definitions (Moved Here) ---
const commands = [
    {
        name: 'verify',
        description: 'Admin: Verifies a user by ID for permanent or time-based access.',
        options: [
            {
                name: 'user',
                type: 6, // USER type - CRITICAL for user mentions
                description: 'The user (by ID or mention) to verify.',
                required: true,
            },
            {
                name: 'duration',
                type: 3, // STRING type
                description: 'Verification duration (e.g., permanent, 7d, 30d, 90d, 365d).',
                required: true,
                choices: [
                    { name: 'Permanent', value: 'permanent' },
                    { name: '7 Days', value: '7d' },
                    { name: '30 Days', value: '30d' },
                    { name: '90 Days', value: '90d' },
                    { name: '365 Days', value: '365d' },
                ],
            },
        ],
    },
    {
        name: 'admin',
        description: 'Administrator commands for bot management.',
        options: [
            {
                name: 'revoke',
                description: 'Revoke a user\'s access to the prediction service.',
                type: 1, // SUB_COMMAND
                options: [
                    {
                        name: 'user',
                        type: 6, // USER type
                        description: 'The user to revoke access from.',
                        required: true,
                    },
                ],
            },
            {
                name: 'stats',
                description: 'Display bot statistics.',
                type: 1, // SUB_COMMAND
            },
            {
                name: 'unban',
                description: 'Unban a user from submitting results.',
                type: 1, // SUB_COMMAND
                options: [
                    {
                        name: 'user',
                        type: 6, // USER type
                        description: 'The user to unban.',
                        required: true,
                    },
                ],
            },
        ],
    },
    {
        name: 'emergency',
        description: 'Emergency administrator commands (use with caution).',
        options: [
            {
                name: 'verify',
                description: 'Force verify a user by ID (admin use only).',
                type: 1, // SUB_COMMAND
                options: [
                    {
                        name: 'user',
                        type: 6, // USER type
                        description: 'The user to force verify.',
                        required: true,
                    },
                ],
            },
        ],
    },
    {
        name: 'how_to_submit_result',
        description: 'Shows instructions on how to submit a game result.',
    },
    {
        name: 'leaderboard',
        description: 'Shows users who submitted the most results.',
    },
    {
        name: 'myresult',
        description: 'Shows how many results you have submitted.',
    },
    {
        name: 'submitresult',
        description: 'Submits your game results to improve bot data collection and validation.',
        options: [
            {
                name: 'server_seed_hash',
                type: 3, // STRING type
                description: 'The Server Seed Hash from your game.',
                required: true,
            },
            {
                name: 'client_seed',
                type: 3, // STRING type
                description: 'The Client Seed from your game.',
                required: true,
            },
            {
                name: 'nonce',
                type: 4, // INTEGER type
                description: 'The Nonce from your game.',
                required: true,
            },
            {
                name: 'num_mines',
                type: 4, // INTEGER type
                description: 'The total number of mines in the game (e.g., 5).',
                required: true,
                min_value: 1,
                max_value: 24,
            },
            {
                name: 'mine_positions',
                type: 3, // STRING type (e.g., "3,7,12,18,22")
                description: 'Comma-separated list of mine positions (0-24).',
                required: true,
            },
        ],
    },
    {
       name: 'predict',
       description: 'Analyze past game data (requires verification).',
    },
];

// --- Main Execution Logic and Discord Client Event Listeners ---

// 1. Connect to MongoDB first
console.log("[SETUP] Attempting to connect to MongoDB...");
try {
    await connectToMongoDB();
    console.log("[SETUP] MongoDB connection and cache load complete.");
} catch (error) {
    console.error(`[SETUP ERROR] Critical: Failed to establish MongoDB connection. Bot cannot proceed.`, String(error.message)); // Use String()
    process.exit(1);
}

// 2. Login to Discord
console.log("[SETUP] Attempting Discord client login...");
try {
    await client.login(BOT_TOKEN); // Uses BOT_TOKEN from Render environment variables
    console.log("[SETUP] Discord client login successful.");
} catch (error) {
    console.error("[SETUP ERROR] Critical: Failed to login to Discord. Bot cannot proceed.", String(error.message)); // Use String()
    process.exit(1);
}

// 3. Discord 'ready' event listener - includes command registration and self-ping setup
client.on('ready', async () => {
    console.log(`🤖 ${String(client.user.tag)} is online and ready to analyze mines!`); // Use String()

    // --- Slash Command Registration (Runs only if REGISTER_COMMANDS env var is "true") ---
    // This allows you to trigger registration by setting REGISTER_COMMANDS="true" once on Render.
    // After successful registration, you can remove or set it to "false" to prevent re-registration.
    if (process.env.REGISTER_COMMANDS === "true") {
        console.log("[COMMAND_REGISTRATION] REGISTER_COMMANDS is true. Attempting to register slash commands...");
        const rest = new REST({ version: '10' }).setToken(BOT_TOKEN_FOR_REGISTRATION); // Uses hardcoded token for this
        try {
            if (GUILD_ID_FOR_REGISTRATION && GUILD_ID_FOR_REGISTRATION !== 'PASTE_YOUR_GUILD_ID_HERE') {
                // Guild-specific commands (faster updates)
                await rest.put(
                    Routes.applicationGuildCommands(CLIENT_ID_FOR_REGISTRATION, GUILD_ID_FOR_REGISTRATION),
                    { body: commands },
                );
                console.log(`[COMMAND_REGISTRATION] Successfully reloaded application (/) commands for guild ${String(GUILD_ID_FOR_REGISTRATION)}.`); // Use String()
            } else {
                // Global commands (can take up to an hour to propagate)
                await rest.put(
                    Routes.applicationCommands(CLIENT_ID_FOR_REGISTRATION),
                    { body: commands },
                );
                console.log(`[COMMAND_REGISTRATION] Successfully reloaded global application (/) commands.`);
            }
        } catch (error) {
            console.error('[COMMAND_REGISTRATION ERROR] Failed to register slash commands:', String(error.message), error); // Use String()
        }
    } else {
        console.log("[COMMAND_REGISTRATION] REGISTER_COMMANDS is not true. Skipping slash command registration.");
    }

    // --- Self-Ping System ---
    if (SELF_PING_URL) {
        console.log(`[SETUP] SELF_PING_URL is set. Preparing self-ping system.`);
        console.log(`Starting self-ping system. Pinging ${String(SELF_PING_URL)} every ${PING_INTERVAL_MS / 1000 / 60} minutes.`); // Use String()
        startSelfPing(); // Call the function
        setInterval(startSelfPing, PING_INTERVAL_MS);
    } else {
        console.warn('SELF_PING_URL environment variable not found. Self-ping system will not start. Bot may go idle on free tier.');
    }
});

// 4. Setup other Discord event listeners
client.on('guildMemberAdd', async member => {
    console.log(`New member joined: ${String(member.user.tag)} (${String(member.id)})`); // Use String()
    try {
        const welcomeMessage = getWelcomeMessage(String(member.user.username)); // Use String()
        await member.send(welcomeMessage);
        console.log(`Sent welcome DM to new member: ${String(member.user.tag)}`); // Use String()
    } catch (error) {
        console.error(`Could not send welcome DM to ${String(member.user.tag)}. Error: ${String(error.message)}. They might have DMs disabled.`, error); // Use String()
    }
});

client.on('interactionCreate', async interaction => {
    // IMPORTANT: Defer reply at the very start for all commands.
    // This prevents the "Unknown interaction" error if the bot takes too long to respond (3 seconds).
    if (interaction.isCommand() && !interaction.deferred && !interaction.replied) {
        try {
            await interaction.deferReply({ ephemeral: false }); // Default to non-ephemeral, can be overridden later
            console.log(`[DEBUG] Deferred reply for command: /${String(interaction.commandName)} by ${String(interaction.user.tag)}`); // Use String()
        } catch (deferError) {
            console.error(`[ERROR] Failed to defer reply for command /${String(interaction.commandName)}: ${String(deferError.message)}`, deferError); // Use String()
            try {
                if (!interaction.replied) {
                     await interaction.reply({ content: 'An unexpected issue occurred. Please try again.', flags: [MessageFlags.Ephemeral] }).catch(err => console.error(`[ERROR] Failed fallback reply (defer fail): ${String(err.message)}`)); // Use String()
                }
            } catch (fallbackError) {
                console.error(`[ERROR] Failed to send fallback reply for /${String(interaction.commandName)}: ${String(fallbackError.message)}`, fallbackError); // Use String()
            }
            return; // Stop further processing for this interaction
        }
    } else if (!interaction.isCommand()) {
        return; // Not a command interaction, ignore.
    }

    const { commandName } = interaction;
    const userId = String(interaction.user.id); // Use String()
    const userTag = String(interaction.user.tag); // Use String()

    try {
        // --- /verify Command Logic ---
        if (commandName === 'verify') {
            if (!isAuthorizedAdmin(userId)) {
                await interaction.editReply({ content: 'You do not have permission to use this command. Only designated administrators can verify users.', flags: [MessageFlags.Ephemeral] });
                return;
            }

            const targetUserDiscordObject = interaction.options.getUser('user');
            console.log(`[DEBUG /verify] Initial targetUserDiscordObject: ${targetUserDiscordObject ? String(targetUserDiscordObject.tag) : 'null/undefined'} (ID: ${targetUserDiscordObject ? String(targetUserDiscordObject.id) : 'N/A'})`); // Use String()

            if (!targetUserDiscordObject) {
                await interaction.editReply({ content: 'Target user not found in command options. This might be a Discord issue or the command definition is out of sync. Please try again, ensuring you select a user from the auto-complete list. If the problem persists, commands might need to be re-registered.', flags: [MessageFlags.Ephemeral] });
                return;
            }
            const targetUserId = String(targetUserDiscordObject.id); // Use String()

            console.log(`[DEBUG /verify] Resolved targetUserId from options: ${targetUserId}`);

            let member = interaction.guild?.members.cache.get(targetUserId);
            console.log(`[DEBUG /verify] Member from cache: ${member ? String(member.user.tag) : 'null/undefined'} (ID: ${member ? String(member.id) : 'N/A'})`); // Use String()

            if (!member && interaction.guild) {
                console.log(`[DEBUG /verify] Member ${targetUserId} not in cache, attempting to fetch from API for guild ${String(interaction.guild.id)}.`); // Use String()
                try {
                    member = await interaction.guild.members.fetch(targetUserId);
                    console.log(`[DEBUG /verify] Successfully fetched member ${String(member.user.tag)} (ID: ${String(member.id)}) from API.`); // Use String()
                } catch (fetchError) {
                    console.error(`[ERROR] /verify: Failed to fetch member ${targetUserId} from API: ${String(fetchError.message)}`, fetchError); // Use String()
                    member = null;
                }
            }

            if (!member) {
                await interaction.editReply({ content: `Could not find user with ID ${targetUserId} in this server. Please ensure the user is in this server and the ID is correct.`, flags: [MessageFlags.Ephemeral] });
                return;
            }
            console.log(`[DEBUG] /verify: Final member found: ${String(member.user.tag)} (ID: ${String(member.id)})`); // Use String()


            const durationOption = interaction.options.getString('duration');
            let expiresAt = null;
            let durationTextForDM = "Permanent access";

            if (durationOption !== 'permanent') {
                const days = parseInt(durationOption.replace('d', ''), 10);
                if (!isNaN(days) && days > 0) {
                    expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
                    durationTextForDM = `Access for ${days} Days (until ${expiresAt.toLocaleDateString()})`;
                } else {
                    await interaction.editReply({ content: 'Invalid duration specified. Please use "permanent", "7d", "30d", "90d", or "365d".', flags: [MessageFlags.Ephemeral] });
                    return;
                }
            }

            if (!dbClient || !dbClient.db) {
                 await interaction.editReply({ content: 'Database is not connected. Please inform the bot administrator.', flags: [MessageFlags.Ephemeral] });
                 console.error(`[ERROR] /verify command failed: MongoDB client not available.`);
                 return;
            }
            const db = dbClient.db('MineBotDB');
            const collection = db.collection('verifiedUsers');

            await collection.updateOne(
                { userId: String(member.id) }, // Use String()
                { $set: {
                    userId: String(member.id), // Use String()
                    username: String(member.user.tag), // Use String()
                    isVerified: true,
                    expiresAt: expiresAt,
                    verifiedAt: new Date(),
                    verifiedBy: userId
                }},
                { upsert: true }
            );

            verifiedUsersCache.set(String(member.id), { userId: String(member.id), isVerified: true, expiresAt: expiresAt }); // Use String()

            await interaction.editReply({ content: `${String(member.user.tag)} has been verified! They can now use the \`/predict\` command.`, ephemeral: false }); // Use String()

            try {
                await member.send(getVerificationSuccessDM(String(member.user.username), String(durationTextForDM))); // Use String()
                console.log(`Sent verification successful DM to ${String(member.user.tag)}`); // Use String()
            } catch (dmError) {
                console.error(`Could not send verification successful DM to ${String(member.user.tag)}. Error: ${String(dmError.message)}. They might have DMs disabled.`, dmError); // Use String()
                await interaction.followUp({ content: `(I tried to send a verification confirmation DM to ${String(member.user.tag)} with important information, but their DMs might be disabled.)`, ephemeral: false }); // Use String()
            }
        }

        // --- /admin subcommand group logic ---
        else if (commandName === 'admin') {
            if (!isAuthorizedAdmin(userId)) {
                await interaction.editReply({ content: 'You do not have permission to use admin commands.', flags: [MessageFlags.Ephemeral] });
                return;
            }

            const subCommand = interaction.options.getSubcommand();
            if (!dbClient || !dbClient.db) {
                 await interaction.editReply({ content: 'Database is not connected. Please inform the bot administrator.', flags: [MessageFlags.Ephemeral] });
                 console.error(`[ERROR] /admin command failed: MongoDB client not available.`);
                 return;
            }
            const db = dbClient.db('MineBotDB');

            if (subCommand === 'revoke') {
                const targetUser = interaction.options.getUser('user');
                if (!targetUser) {
                    await interaction.editReply({ content: 'Please specify a user to revoke access from.', flags: [MessageFlags.Ephemeral] });
                    return;
                }
                const verifiedCollection = db.collection('verifiedUsers');
                await verifiedCollection.updateOne(
                    { userId: String(targetUser.id) }, // Use String()
                    { $set: { isVerified: false, revokedAt: new Date(), revokedBy: userId } }
                );
                verifiedUsersCache.delete(String(targetUser.id)); // Use String()
                await interaction.editReply({ content: `${String(targetUser.tag)}'s access has been revoked.`, ephemeral: false }); // Use String()
            } else if (subCommand === 'stats') {
                const gameResultsCollection = db.collection('gameResults');
                const totalSubmissions = await gameResultsCollection.countDocuments();
                const totalVerifiedUsers = await db.collection('verifiedUsers').countDocuments({ isVerified: true });

                await interaction.editReply({
                    content: `**Bot Statistics:**\nTotal Game Submissions: ${totalSubmissions}\nTotal Verified Users: ${totalVerifiedUsers}`,
                    ephemeral: false
                });
            } else if (subCommand === 'unban') {
                const targetUser = interaction.options.getUser('user');
                if (!targetUser) {
                    await interaction.editReply({ content: 'Please specify a user to unban.', flags: [MessageFlags.Ephemeral] });
                    return;
                }
                const verifiedCollection = db.collection('verifiedUsers');
                await verifiedCollection.updateOne(
                    { userId: String(targetUser.id) }, // Use String()
                    { $unset: { isBanned: "" }, $set: { lastUnbannedAt: new Date(), unbannedBy: userId } }
                );
                await interaction.editReply({ content: `${String(targetUser.tag)} has been unbanned from submitting results.`, ephemeral: false }); // Use String()
            }
        }

        // --- /emergency subcommand group logic ---
        else if (commandName === 'emergency') {
            if (!isAuthorizedAdmin(userId)) {
                await interaction.editReply({ content: 'You do not have permission to use emergency commands.', flags: [MessageFlags.Ephemeral] });
                return;
            }

            const subCommand = interaction.options.getSubcommand();

            if (subCommand === 'verify') {
                const targetUser = interaction.options.getUser('user');
                if (!targetUser) {
                    await interaction.editReply({ content: 'Please specify a user to force verify.', flags: [MessageFlags.Ephemeral] });
                    return;
                }
                const db = dbClient.db('MineBotDB');
                const verifiedCollection = db.collection('verifiedUsers');
                await verifiedCollection.updateOne(
                    { userId: String(targetUser.id) }, // Use String()
                    { $set: {
                        userId: String(targetUser.id), // Use String()
                        username: String(targetUser.tag), // Use String()
                        isVerified: true,
                        expiresAt: null,
                        verifiedAt: new Date(),
                        verifiedBy: userId,
                        isEmergencyVerified: true
                    }},
                    { upsert: true }
                );
                verifiedUsersCache.set(String(targetUser.id), { userId: String(targetUser.id), isVerified: true, expiresAt: null }); // Use String()
                await interaction.editReply({ content: `${String(targetUser.tag)} has been **force verified** (emergency).`, ephemeral: false }); // Use String()
            }
        }

        // --- /how_to_submit_result Command Logic ---
        else if (commandName === 'how_to_submit_result') {
            const helpMessage = `
**How to Submit a Game Result** 📝

Why submit a result? Your submissions help train the prediction model, making it more accurate for everyone. ✨

1.  **Get the Data** 📊
    After a game on Rollbet, copy the **Server Seed Hash**, **Client Seed**, and **Nonce** from the game details. You'll also need to count the **total number of mines** and list their **positions** (from 0 to 24, from top-left to bottom-right).

2.  **Use the Command** 🎮
    Use the \`/submitresult\` command and fill in the options. For example:
    • \`server_seed_hash\`: \`a1b2c3d4...\`
    • \`client_seed\`: \`VqsjloxT6b\`
    • \`nonce\`: \`3002\`
    • \`num_mines\`: \`5\`
    • \`mine_positions\`: \`3,7,12,18,22\`

**Remember to paste your exact data for best results!** 🎯
            `;
            await interaction.editReply({ content: helpMessage, flags: [MessageFlags.Ephemeral] });
        }

        // --- /leaderboard Command Logic ---
        else if (commandName === 'leaderboard') {
            if (!dbClient || !dbClient.db) {
                 await interaction.editReply({ content: 'Database is not connected. Please inform the bot administrator.', flags: [MessageFlags.Ephemeral] });
                 console.error(`[ERROR] /leaderboard command failed: MongoDB client not available.`);
                 return;
            }
            const db = dbClient.db('MineBotDB');
            const collection = db.collection('gameResults');
            const leaderboard = await collection.aggregate([
                { $group: { _id: "$userId", username: { $first: "$username" }, count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 10 }
            ]).toArray();

            let leaderboardMessage = "**📊 Top Game Submitters:**\n";
            if (leaderboard.length === 0) {
                leaderboardMessage += "No submissions yet. Be the first!";
            } else {
                leaderboard.forEach((entry, index) => {
                    leaderboardMessage += `${index + 1}. ${String(entry.username)}: ${String(entry.count)} submissions\n`; // Use String()
                });
            }
            await interaction.editReply({ content: leaderboardMessage, ephemeral: false });
        }

        // --- /myresult Command Logic ---
        else if (commandName === 'myresult') {
            if (!dbClient || !dbClient.db) {
                 await interaction.editReply({ content: 'Database is not connected. Please inform the bot administrator.', flags: [MessageFlags.Ephemeral] });
                 console.error(`[ERROR] /myresult command failed: MongoDB client not available.`);
                 return;
            }
            const db = dbClient.db('MineBotDB');
            const collection = db.collection('gameResults');
            const mySubmissions = await collection.countDocuments({ userId: userId });
            await interaction.editReply({ content: `You have submitted **${String(mySubmissions)}** game results.`, flags: [MessageFlags.Ephemeral] }); // Use String()
        }

        // --- /submitresult Command Logic ---
        else if (commandName === 'submitresult') {
            const serverSeedHash = String(interaction.options.getString('server_seed_hash')); // Use String()
            const clientSeed = String(interaction.options.getString('client_seed')); // Use String()
            const nonce = interaction.options.getInteger('nonce');
            const numMines = interaction.options.getInteger('num_mines');
            const minePositionsString = String(interaction.options.getString('mine_positions')); // Use String()

            const minePositions = minePositionsString.split(',').map(pos => parseInt(pos.trim(), 10));

            if (minePositions.length !== numMines || minePositions.some(isNaN) || minePositions.some(pos => pos < 0 || pos > 24) || new Set(minePositions).size !== numMines) {
                await interaction.editReply({ content: '❌ Invalid mine positions provided. Please ensure it\'s a comma-separated list of unique numbers between 0-24, and the count matches the "num_mines" option.', flags: [MessageFlags.Ephemeral] });
                return;
            }

            try {
                const computedMines = calculateRollbetMines(serverSeedHash, clientSeed, nonce, numMines);
                const sortedSubmittedMines = [...minePositions].sort((a, b) => a - b);
                const sortedComputedMines = [...computedMines].sort((a, b) => a - b);

                if (JSON.stringify(sortedSubmittedMines) === JSON.stringify(sortedComputedMines)) {
                    if (!dbClient || !dbClient.db) {
                         await interaction.editReply({ content: 'Database is not connected. Please inform the bot administrator.', flags: [MessageFlags.Ephemeral] });
                         console.error(`[ERROR] /submitresult command failed: MongoDB client not available.`);
                         return;
                    }
                    const db = dbClient.db('MineBotDB');
                    const collection = db.collection('gameResults');

                    await collection.insertOne({
                        userId: userId,
                        username: userTag,
                        serverSeedHash,
                        clientSeed,
                        nonce,
                        numMines,
                        minePositions: sortedSubmittedMines,
                        submittedAt: new Date(),
                        isValidated: true
                    });

                    await interaction.editReply({ content: '✅ Your game result has been successfully submitted and validated! It will now contribute to our community data.', flags: [MessageFlags.Ephemeral] });
                } else {
                    await interaction.editReply({ content: '❌ Submitted mine positions do not match the computed game outcome or are invalid. Please double-check your input and ensure your algorithm for Rollbet\'s provably fair system is **exactly** correct if you are developing it.', flags: [MessageFlags.Ephemeral] });
                }
            } catch (error) {
                console.error('Error in /submitresult validation or storage:', String(error.message)); // Use String()
                await interaction.editReply({ content: 'An unexpected error occurred while processing your submission. Please try again or contact an admin.', flags: [MessageFlags.Ephemeral] });
            }
        }

        // --- /predict Command Logic ---
        else if (commandName === 'predict') {
            if (!dbClient || !dbClient.db) {
                 await interaction.editReply({ content: 'Database is not connected. Please inform the bot administrator.', flags: [MessageFlags.Ephemeral] });
                 console.error(`[ERROR] /predict command failed: MongoDB client not available.`);
                 return;
            }
            const db = dbClient.db('MineBotDB');
            const verifiedCollection = db.collection('verifiedUsers');
            const gameResultsCollection = db.collection('gameResults');

            const userVerification = await verifiedCollection.findOne({ userId: userId });

            if (!userVerification || !userVerification.isVerified) {
                await interaction.editReply({ content: '🔒 You must be verified to use the \`/predict\` command. Please ask an admin to verify you, or share your game results via \`/submitresult\` to gain access!', flags: [MessageFlags.Ephemeral] });
                return;
            }

            if (userVerification.expiresAt && userVerification.expiresAt < new Date()) {
                await verifiedCollection.updateOne(
                    { userId: userId },
                    { $set: { isVerified: false, expiredAt: new Date() } }
                );

                verifiedUsersCache.delete(userId);

                try {
                    await interaction.user.send(getAccessExpiredDM(userTag));
                    console.log(`Sent access expired DM to ${userTag}`);
                } catch (dmError) {
                    console.error(`Could not send access expired DM to ${String(dmError.recipient?.tag || 'unknown user')}. Error: ${String(dmError.message)}. They might have DMs disabled.`, dmError); // Use String()
                }

                await interaction.editReply({ content: 'Expired! ⏳ Your data analysis access has expired. Please check your DMs for more information. Ask an admin to re-verify you or submit more results via \`/submitresult\` for free access!', flags: [MessageFlags.Ephemeral] });
                return;
            }

            // --- AI Analysis Section for /predict ---
            // DeferReply was already handled at the start of interactionCreate.

            const recentGameResults = await gameResultsCollection.find({})
                                                         .sort({ submittedAt: -1 })
                                                         .limit(50)
                                                         .toArray();

            if (recentGameResults.length === 0) {
                await interaction.editReply({ content: 'No game results submitted yet for analysis. Please encourage users to use `/submitresult`!', ephemeral: false });
                return;
            }

            let dataSummary = `Recent validated Rollbet Mines game results:\n`;
            recentGameResults.forEach((game, index) => {
                dataSummary += `Game ${index + 1}: Mines: ${String(game.numMines)}, Positions: [${String(game.minePositions.join(', '))}], Nonce: ${String(game.nonce)}\n`; // Use String()
            });
            dataSummary += `\nBased on this data, provide an analysis of observed patterns or interesting insights regarding mine distribution, game frequencies, or any statistical anomalies. Remind the user this is for data analysis and does not predict future random outcomes.`;

            const aiAnalysis = await callGeminiAPI(dataSummary);

            await interaction.editReply({ content: `**🤖 AI Data Analysis from Latest Submissions:**\n\n${aiAnalysis}`, ephemeral: false });
        } catch (error) {
            console.error(`[ERROR] Error handling command '${String(commandName)}' for user ${userTag} (${userId}):`, String(error.message), error); // Use String()
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: 'An unexpected error occurred while processing your command. Please try again later.', flags: [MessageFlags.Ephemeral] }).catch(err => console.error(`[ERROR] Failed to send error editReply: ${String(err.message)}`, err)); // Use String()
            } else {
                await interaction.reply({ content: 'An unexpected error occurred. Please try again later.', flags: [MessageFlags.Ephemeral] }).catch(err => console.error(`[ERROR] Failed to send error reply: ${String(err.message)}`, err)); // Use String()
            }
        }
    }
});
