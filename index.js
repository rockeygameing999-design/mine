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
    return ADMIN_USER_IDS.includes(ensureString(userId));
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
                throw new Error(`HTTP error! Status: ${ensureString(response.status)} - ${ensureString(errorText)}`);
            }
            return response;
        } catch (error) {
            console.error(`[ERROR] Fetch attempt failed for ${ensureString(url)} (${retries + 1}/${maxRetries}):`, ensureString(error.message));
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
        const response = await fetch(SELF_PING_URL);
        if (response.ok) {
            console.log(`Self-ping successful to ${ensureString(SELF_PING_URL)}`);
        } else {
            console.warn(`Self-ping failed to ${ensureString(SELF_PING_URL)} with status: ${ensureString(response.status)}`);
        }
    } catch (error) {
        console.error(`Error during self-ping to ${ensureString(SELF_PING_URL)}:`, ensureString(error.message));
    }
}

function calculateRollbetMines(serverSeed, clientSeed, nonce, numMines) {
    console.warn("WARNING: calculateRollbetMines is using a placeholder. Please implement Rollbet's actual provably fair algorithm.");
    if (numMines === 3 && ensureString(clientSeed).startsWith('test')) {
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
        console.error('Failed to connect to MongoDB:', ensureString(error.message));
        throw new Error(`MongoDB connection failed: ${ensureString(error.message)}`);
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
        console.error('Error loading initial verifiedUsers cache from MongoDB:', ensureString(error.message));
    }
}

// --- Gemini API Integration Function ---
async function callGeminiAPI(prompt) {
    console.log(`[DEBUG] callGeminiAPI function called with prompt: ${ensureString(prompt).substring(0, 50)}...`);
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
        console.error('Failed to get Gemini API response:', ensureString(error.message));
        return "Failed to generate analysis after multiple retries. Please try again later.";
    }
}

// --- Discord Message Template Functions ---
const getWelcomeMessage = (username) => `
Hello ${ensureString(username)}, welcome to the community!

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

Hello ${ensureString(username)}, you have been granted access to the mine prediction service!

🎯 **Access Granted**
You can now use the \`/predict\` command to analyze mine patterns.

⏰ **Access Duration**
${ensureString(durationText)}

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

Hello ${ensureString(username)}, your access to the mine data analysis service has expired.

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
    console.error(`[FATAL ERROR] Unhandled Rejection at: ${ensureString(promise)}\nReason: ${ensureString(reason?.message || reason)}`, reason);
    process.exit(1);
});

process.on('uncaughtException', (err) => {
    console.error(`[FATAL ERROR] Uncaught Exception: ${ensureString(err.message)}`, err);
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

// --- Discord Client Event Listeners and Main Execution Logic ---
(async () => {
    // 1. Connect to MongoDB first
    console.log("[SETUP] Attempting to connect to MongoDB...");
    try {
        await connectToMongoDB();
        console.log("[SETUP] MongoDB connection and cache load complete.");
    } catch (error) {
        console.error(`[SETUP ERROR] Critical: Failed to establish MongoDB connection. Bot cannot proceed.`, ensureString(error.message));
        process.exit(1);
    }

    // 2. Login to Discord
    console.log("[SETUP] Attempting Discord client login...");
    try {
        await client.login(BOT_TOKEN); // Uses BOT_TOKEN from Render environment variables
        console.log("[SETUP] Discord client login successful.");
    } catch (error) {
        console.error("[SETUP ERROR] Critical: Failed to login to Discord. Bot cannot proceed.", ensureString(error.message));
        process.exit(1);
    }

    // 3. Discord 'ready' event listener - includes command registration
    client.on('ready', async () => {
        console.log(`🤖 ${ensureString(client.user.tag)} is online and ready to analyze mines!`);

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
                    console.log(`[COMMAND_REGISTRATION] Successfully reloaded application (/) commands for guild ${ensureString(GUILD_ID_FOR_REGISTRATION)}.`);
                } else {
                    // Global commands (can take up to an hour to propagate)
                    await rest.put(
                        Routes.applicationCommands(CLIENT_ID_FOR_REGISTRATION),
                        { body: commands },
                    );
                    console.log(`[COMMAND_REGISTRATION] Successfully reloaded global application (/) commands.`);
                }
            } catch (error) {
                console.error('[COMMAND_REGISTRATION ERROR] Failed to register slash commands:', ensureString(error.message), error);
            }
        } else {
            console.log("[COMMAND_REGISTRATION] REGISTER_COMMANDS is not true. Skipping slash command registration.");
        }


        if (SELF_PING_URL) {
            console.log(`[SETUP] SELF_PING_URL is set. Preparing self-ping system.`);
            console.log(`Starting self-ping system. Pinging ${ensureString(SELF_PING_URL)} every ${PING_INTERVAL_MS / 1000 / 60} minutes.`);
            startSelfPing();
            setInterval(startSelfPing, PING_INTERVAL_MS);
        } else {
            console.warn('SELF_PING_URL environment variable not found. Self-ping system will not start. Bot may go idle on free tier.');
        }
    });

    // 4. Setup other Discord event listeners
    client.on('guildMemberAdd', async member => {
        console.log(`New member joined: ${ensureString(member.user.tag)} (${ensureString(member.id)})`);
        try {
            const welcomeMessage = getWelcomeMessage(member.user.username);
            await member.send(welcomeMessage);
            console.log(`Sent welcome DM to new member: ${ensureString(member.user.tag)}`);
        } catch (error) {
            console.error(`Could not send welcome DM to ${ensureString(member.user.tag)}. Error: ${ensureString(error.message)}. They might have DMs disabled.`, error);
        }
    });

    client.on('interactionCreate', async interaction => {
        // Defensive check: Defer reply early for commands that might take time.
        // This avoids the "Interaction failed" error if the bot takes too long to respond.
        if (interaction.isCommand() && !interaction.deferred && !interaction.replied) {
            try {
                await interaction.deferReply({ ephemeral: false }); // Default to non-ephemeral, can be overridden later
                console.log(`[DEBUG] Deferred reply for command: /${ensureString(interaction.commandName)} by ${ensureString(interaction.user.tag)}`);
            } catch (deferError) {
                console.error(`[ERROR] Failed to defer reply for command /${ensureString(interaction.commandName)}: ${ensureString(deferError.message)}`, deferError);
                // Fallback: Try to send a simple ephemeral reply if defer fails
                try {
                    if (!interaction.replied) { // Only reply if not already replied
                         await interaction.reply({ content: 'An unexpected issue occurred. Please try again.', flags: [MessageFlags.Ephemeral] }).catch(err => console.error(`[ERROR] Failed fallback reply (defer fail): ${ensureString(err.message)}`));
                    }
                } catch (fallbackError) {
                    console.error(`[ERROR] Failed to send fallback reply for /${ensureString(interaction.commandName)}: ${ensureString(fallbackError.message)}`, fallbackError);
                }
                return; // Stop further processing for this interaction
            }
        } else if (!interaction.isCommand()) {
            return; // Not a command interaction, ignore.
        }

        const { commandName } = interaction;
        const userId = ensureString(interaction.user.id);
        const userTag = ensureString(interaction.user.tag);

        try {
            // --- /verify Command Logic ---
            if (commandName === 'verify') {
                if (!isAuthorizedAdmin(userId)) {
                    await interaction.editReply({ content: 'You do not have permission to use this command. Only designated administrators can verify users.', flags: [MessageFlags.Ephemeral] });
                    return;
                }

                // IMPORTANT FIX: Ensure 'user' option is correctly retrieved.
                // If it's null even with 'required: true', it indicates a command registration mismatch
                // or a Discord client issue. We add a specific check here.
                const targetUserDiscordObject = interaction.options.getUser('user');
                console.log(`[DEBUG /verify] Initial targetUserDiscordObject: ${targetUserDiscordObject ? targetUserDiscordObject.tag : 'null/undefined'} (ID: ${targetUserDiscordObject ? targetUserDiscordObject.id : 'N/A'})`);

                if (!targetUserDiscordObject) {
                    await interaction.editReply({ content: 'Target user not found in command options. This might be a Discord issue or the command definition is out of sync. Please try again, ensuring you select a user from the auto-complete list. If the problem persists, commands might need to be re-registered.', flags: [MessageFlags.Ephemeral] });
                    return;
                }
                const targetUserId = ensureString(targetUserDiscordObject.id);

                console.log(`[DEBUG /verify] Resolved targetUserId from options: ${targetUserId}`);

                // Attempt to fetch the member, first from cache, then via API if not found
                let member = interaction.guild?.members.cache.get(targetUserId);
                console.log(`[DEBUG /verify] Member from cache: ${member ? member.user.tag : 'null/undefined'} (ID: ${member ? member.id : 'N/A'})`);

                // If member not in cache and we are in a guild context, try to fetch it
                if (!member && interaction.guild) {
                    console.log(`[DEBUG /verify] Member ${targetUserId} not in cache, attempting to fetch from API for guild ${ensureString(interaction.guild.id)}.`);
                    try {
                        member = await interaction.guild.members.fetch(targetUserId);
                        console.log(`[DEBUG /verify] Successfully fetched member ${ensureString(member.user.tag)} (ID: ${ensureString(member.id)}) from API.`);
                    } catch (fetchError) {
                        console.error(`[ERROR] /verify: Failed to fetch member ${targetUserId} from API: ${ensureString(fetchError.message)}`, fetchError);
                        member = null; // Set to null if fetching failed
                    }
                }

                if (!member) {
                    await interaction.editReply({ content: `Could not find user with ID ${targetUserId} in this server. Please ensure the user is in this server and the ID is correct.`, flags: [MessageFlags.Ephemeral] });
                    return;
                }
                console.log(`[DEBUG] /verify: Final member found: ${ensureString(member.user.tag)} (ID: ${ensureString(member.id)})`);


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
                    { userId: ensureString(member.id) },
                    { $set: {
                        userId: ensureString(member.id),
                        username: ensureString(member.user.tag),
                        isVerified: true,
                        expiresAt: expiresAt,
                        verifiedAt: new Date(),
                        verifiedBy: userId
                    }},
                    { upsert: true }
                );

                verifiedUsersCache.set(ensureString(member.id), { userId: ensureString(member.id), isVerified: true, expiresAt: expiresAt });

                await interaction.editReply({ content: `${ensureString(member.user.tag)} has been verified! They can now use the \`/predict\` command.`, ephemeral: false });

                try {
                    await member.send(getVerificationSuccessDM(ensureString(member.user.username), ensureString(durationTextForDM)));
                    console.log(`Sent verification successful DM to ${ensureString(member.user.tag)}`);
                } catch (dmError) {
                    console.error(`Could not send verification successful DM to ${ensureString(member.user.tag)}. Error: ${ensureString(dmError.message)}. They might have DMs disabled.`, dmError);
                    await interaction.followUp({ content: `(I tried to send a verification confirmation DM to ${ensureString(member.user.tag)} with important information, but their DMs might be disabled. Error: ${ensureString(dmError.message)})`, ephemeral: false });
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
                        { userId: ensureString(targetUser.id) },
                        { $set: { isVerified: false, revokedAt: new Date(), revokedBy: userId } }
                    );
                    verifiedUsersCache.delete(ensureString(targetUser.id));
                    await interaction.editReply({ content: `${ensureString(targetUser.tag)}'s access has been revoked.`, ephemeral: false });
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
                        { userId: ensureString(targetUser.id) },
                        { $unset: { isBanned: "" }, $set: { lastUnbannedAt: new Date(), unbannedBy: userId } }
                    );
                    await interaction.editReply({ content: `${ensureString(targetUser.tag)} has been unbanned from submitting results.`, ephemeral: false });
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
                        { userId: ensureString(targetUser.id) },
                        { $set: {
                            userId: ensureString(targetUser.id),
                            username: ensureString(targetUser.tag),
                            isVerified: true,
                            expiresAt: null,
                            verifiedAt: new Date(),
                            verifiedBy: userId,
                            isEmergencyVerified: true
                        }},
                        { upsert: true }
                    );
                    verifiedUsersCache.set(ensureString(targetUser.id), { userId: ensureString(targetUser.id), isVerified: true, expiresAt: null });
                    await interaction.editReply({ content: `${ensureString(targetUser.tag)} has been **force verified** (emergency).`, ephemeral: false });
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
                        leaderboardMessage += `${index + 1}. ${ensureString(entry.username)}: ${ensureString(entry.count)} submissions\n`;
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
                await interaction.editReply({ content: `You have submitted **${ensureString(mySubmissions)}** game results.`, flags: [MessageFlags.Ephemeral] });
            }

            // --- /submitresult Command Logic ---
            else if (commandName === 'submitresult') {
                const serverSeedHash = ensureString(interaction.options.getString('server_seed_hash'));
                const clientSeed = ensureString(interaction.options.getString('client_seed'));
                const nonce = interaction.options.getInteger('nonce');
                const numMines = interaction.options.getInteger('num_mines');
                const minePositionsString = ensureString(interaction.options.getString('mine_positions'));

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
                    console.error('Error in /submitresult validation or storage:', ensureString(error.message));
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
                        console.error(`Could not send access expired DM to ${ensureString(dmError.recipient?.tag || 'unknown user')}. Error: ${ensureString(dmError.message)}. They might have DMs disabled.`, dmError);
                    }

                    await interaction.editReply({ content: 'Expired! ⏳ Your data analysis access has expired. Please check your DMs for more information. Ask an admin to re-verify you or submit more results via \`/submitresult\` for free access!', flags: [MessageFlags.Ephemeral] });
                    return;
                }

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
                    dataSummary += `Game ${index + 1}: Mines: ${ensureString(game.numMines)}, Positions: [${ensureString(game.minePositions.join(', '))}], Nonce: ${ensureString(game.nonce)}\n`;
                });
                dataSummary += `\nBased on this data, provide an analysis of observed patterns or interesting insights regarding mine distribution, game frequencies, or any statistical anomalies. Remind the user this is for data analysis and does not predict future random outcomes.`;

                const aiAnalysis = await callGeminiAPI(dataSummary);

                await interaction.editReply({ content: `**🤖 AI Data Analysis from Latest Submissions:**\n\n${aiAnalysis}`, ephemeral: false });
            }
        } catch (error) {
            console.error(`[ERROR] Error handling command '${ensureString(commandName)}' for user ${ensureString(userTag)} (${ensureString(userId)}):`, ensureString(error.message), error);
            // This ensures a reply is always sent, even if an unexpected error occurs after deferring.
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: 'An unexpected error occurred while processing your command. Please try again later.', flags: [MessageFlags.Ephemeral] }).catch(err => console.error(`[ERROR] Failed to send error editReply: ${ensureString(err.message)}`, err));
            } else {
                await interaction.reply({ content: 'An unexpected error occurred. Please try again later.', flags: [MessageFlags.Ephemeral] }).catch(err => console.error(`[ERROR] Failed to send error reply: ${ensureString(err.message)}`, err));
            }
        }
    });

})(); // End of Main Execution Logic IIFE
