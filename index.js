// Required Discord.js, MongoDB, and Express modules
import { Client, GatewayIntentBits, Partials, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { MongoClient } from 'mongodb';
import { REST, Routes } from 'discord.js'; // For registering slash commands
import crypto from 'crypto'; // You will likely need Node.js's built-in 'crypto' module for provably fair calculations.
import express from 'express'; // Import Express for the HTTP server

// --- ADMIN CONFIGURATION ---
// ONLY these Discord User IDs will have access to /admin, /emergency, and /verify commands.
const ADMIN_USER_IDS = [
    '862245514313203712',  // Replace with the first admin's actual Discord User ID
    '1321546526790651967' // Replace with the second admin's actual Discord User ID
];

// Helper function to check if a user is an authorized admin
function isAuthorizedAdmin(userId) {
    return ADMIN_USER_IDS.includes(userId);
}

// --- PROVABLY FAIR ALGORITHM IMPLEMENTATION (CRITICAL: YOU MUST FILL THIS IN ACCURATELY) ---
/**
 * Calculates the provably fair mine positions for a Rollbet game.
 *
 * IMPORTANT: YOU MUST IMPLEMENT THIS FUNCTION ACCURATELY BASED ON ROLLBET'S PUBLICLY DOCUMENTED ALGORITHM.
 * This is the most critical part for '/submitresult' validation.
 *
 * Steps typically involved:
 * 1. Combining the server seed (often unhashed, revealed after game), client seed, and nonce.
 * 2. Applying a cryptographic hash function (e.g., SHA256, HMAC-SHA256) to this combined string.
 * (You'll need `import crypto from 'crypto';` for this).
 * 3. Using the resulting hash to derive a sequence of pseudo-random numbers.
 * 4. Mapping these random numbers to select 'numMines' unique positions on the 0-24 grid.
 *
 * Without Rollbet's exact algorithm, '/submitresult' will always fail validation.
 *
 * @param {string} serverSeed The server seed (usually the unhashed one provided by the casino for verification).
 * @param {string} clientSeed The client seed.
 * @param {number} nonce The game nonce.
 * @param {number} numMines The number of mines for the game.
 * @returns {number[]} An array of mine positions (0-24) sorted in ascending order.
 */
function calculateRollbetMines(serverSeed, clientSeed, nonce, numMines) {
    // --- THIS IS A PLACEHOLDER. REPLACE WITH ROLLBET'S REAL ALGORITHM. ---
    // Example conceptual code (NOT Rollbet's actual logic):
    /*
    const combinedString = `${serverSeed}-${clientSeed}-${nonce}`;
    const hash = crypto.createHash('sha256').update(combinedString).digest('hex');

    // Simplified pseudo-random number generation from hash
    let seedValue = parseInt(hash.substring(0, 16), 16); // Use a portion of the hash as initial seed
    const pseudoRandomNumbers = [];
    for (let i = 0; i < 25; i++) { // Generate enough random numbers for all positions
        seedValue = (seedValue * 9301 + 49297) % 233280; // Simple LCG
        pseudoRandomNumbers.push(seedValue / 233280);
    }

    const availablePositions = Array.from({ length: 25 }, (_, i) => i);
    const minePositions = [];

    // Select unique mines based on pseudo-random numbers
    for (let i = 0; i < numMines; i++) {
        const randomValue = pseudoRandomNumbers[i % pseudoRandomNumbers.length]; // Cycle through generated numbers
        const randomIndex = Math.floor(randomValue * availablePositions.length);
        minePositions.push(availablePositions.splice(randomIndex, 1)[0]);
    }

    return minePositions.sort((a, b) => a - b);
    */

    // --- Current Placeholder Implementation (will likely cause mismatches) ---
    console.warn("WARNING: calculateRollbetMines is using a placeholder. Please implement Rollbet's actual provably fair algorithm.");
    if (numMines === 3 && clientSeed.startsWith('test')) {
        return [1, 5, 10];
    }
    return [];
}


// --- MongoDB Connection Setup ---
const mongoUri = process.env.MONGO_URI;
const clientDB = new MongoClient(mongoUri);

async function connectToMongoDB() {
    try {
        await clientDB.connect();
        console.log('Connected to MongoDB');
    } catch (error) {
        console.error('Failed to connect to MongoDB:', error.message);
        let retries = 0;
        const maxRetries = 5;
        const baseDelay = 1000;

        while (retries < maxRetries) {
            const delay = baseDelay * Math.pow(2, retries);
            console.log(`Retrying MongoDB connection in ${delay / 1000} seconds... (Attempt ${retries + 1})`);
            await new Promise(res => setTimeout(res, delay));
            try {
                await clientDB.connect();
                console.log('Reconnected to MongoDB');
                return;
            } catch (retryError) {
                console.error(`Retry failed: ${retryError.message}`);
                retries++;
            }
        }
        console.error('Max retries reached. Could not connect to MongoDB.');
        process.exit(1);
    }
}

let verifiedUsersCache = new Map();

async function loadInitialVerifiedUsersCache() {
    try {
        const db = clientDB.db('MineBotDB'); // <--- REPLACE THIS WITH YOUR ACTUAL DATABASE NAME!
        const collection = db.collection('verifiedUsers');
        const users = await collection.find({}).toArray();
        verifiedUsersCache = new Map(users.map(user => [user.userId, user]));
        console.log(`Loaded ${verifiedUsersCache.size} verifiedUsers into cache from MongoDB`);
    } catch (error) {
        console.error('Error loading initial verifiedUsers cache from MongoDB:', error.message);
    }
}

// --- Gemini API Call Function ---
async function callGeminiAPI(prompt) {
    let chatHistory = [];
    chatHistory.push({ role: "user", parts: [{ text: prompt }] });
    const payload = { contents: chatHistory };
    const apiKey = ""; // Canvas will automatically provide it in runtime
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

    let retries = 0;
    const maxRetries = 3;
    const baseDelay = 1000;

    while (retries < maxRetries) {
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.status === 429) {
                const delay = baseDelay * Math.pow(2, retries);
                console.warn(`Gemini API rate limit hit. Retrying in ${delay / 1000} seconds...`);
                await new Promise(res => setTimeout(res, delay));
                retries++;
                continue;
            }

            if (!response.ok) {
                throw new Error(`Gemini API HTTP error! Status: ${response.status}`);
            }

            const result = await response.json();
            if (result.candidates && result.candidates.length > 0 &&
                result.candidates[0].content && result.candidates[0].content.parts &&
                result.candidates[0].content.parts.length > 0) {
                return result.candidates[0].content.parts[0].text;
            } else {
                console.error("Unexpected Gemini API response structure:", result);
                return "Could not generate analysis due to an unexpected AI response.";
            }
        } catch (error) {
            console.error('Error calling Gemini API:', error.message);
            const delay = baseDelay * Math.pow(2, retries);
            console.warn(`Error calling Gemini API. Retrying in ${delay / 1000} seconds...`);
            await new Promise(res => setTimeout(res, delay));
            retries++;
        }
    }
    return "Failed to generate analysis after multiple retries. Please try again later.";
}

// Ensure you have the necessary intents for DMs and Guild Members
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

// --- HTTP SERVER SETUP (REQUIRED for Render Web Service health check) ---
// If you intend to run this as a "Web Service" on Render (e.g., for the free tier),
// you MUST have an HTTP server listening on the port provided by Render.
// If you do NOT want a web server (and prefer a pure background worker),
// you would need to switch to Render's "Background Worker" service type (which is usually a paid feature).
const app = express();
const PORT = process.env.PORT || 10000; // Use Render's provided PORT env var, or fallback

// Basic root endpoint for Render's health check or a simple web dashboard
app.get('/', (req, res) => {
    res.send('Bot is running and healthy!');
});

app.listen(PORT, () => {
    console.log(`🌐 HTTP server running on port ${PORT}`);
});


// --- GLOBAL MESSAGE CONTENT CONSTANTS ---
const welcomeAndWarningMessage = `
Hello {USERNAME}, welcome to the community!

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

const verificationSuccessfulDM = (username, durationText) => `
**Verification Successful!** 🎉

Hello ${username}, you have been granted access to the mine prediction service!

🎯 **Access Granted**
You can now use the \`/predict\` command to analyze mine patterns.

⏰ **Access Duration**
${durationText}

---

⚠️ **Important Warning: Result Submission**
To maintain fairness and ensure accurate data, you are **required to submit 80% of your prediction results** using the \`/submitresult\` command.

**Why is this important?**
* **For us:** Your submissions help train our data analysis model, making the insights from \`/predict\` more accurate and reliable for the entire community. More data means better analysis!
* **For you:** Consistent submissions are crucial for maintaining your access to the \`/predict\` command and contributing to a trustworthy community.
Failure to submit 80% of your results may lead to an automatic ban from the service.

Professional Mine Prediction Service •
`;

const accessExpiredDM = (username) => `
**Access Expired!** 😔

Hello ${username}, your access to the mine data analysis service has expired.

🚫 **Access Revoked**
You can no longer use the \`/predict\` command.

To regain access, please contact an admin for re-verification, or continue contributing game results via \`/submitresult\` for potential free access!
`;


// --- Bot Ready Event ---
client.on('ready', async () => {
    console.log(`🤖 ${client.user.tag} is online and ready to analyze mines!`);
    await connectToMongoDB();
    await loadInitialVerifiedUsersCache();
});

// --- New: Guild Member Add Event (Welcome DM on Server Join) ---
client.on('guildMemberAdd', async member => {
    console.log(`New member joined: ${member.user.tag} (${member.id})`);
    try {
        const personalizedWelcomeMessage = welcomeAndWarningMessage.replace('{USERNAME}', member.user.username);
        await member.send(personalizedWelcomeMessage);
        console.log(`Sent welcome DM to new member: ${member.user.tag}`);
    } catch (error) {
        console.error(`Could not send welcome DM to ${member.user.tag}. They might have DMs disabled.`, error);
    }
});

// --- Interaction Handling (for slash commands) ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const { commandName } = interaction;

    // --- /verify Command Logic (Admin only, verifies by user ID, with duration) ---
    if (commandName === 'verify') {
        if (!isAuthorizedAdmin(interaction.user.id)) {
            await interaction.reply({ content: 'You do not have permission to use this command. Only designated administrators can verify users.', flags: [MessageFlags.Ephemeral] });
            return;
        }

        const targetUser = interaction.options.getUser('user') || interaction.user;
        console.log(`[DEBUG /verify] targetUser: ${targetUser ? targetUser.tag : 'null/undefined'} (ID: ${targetUser ? targetUser.id : 'N/A'})`);

        const durationOption = interaction.options.getString('duration');

        const member = interaction.guild.members.cache.get(targetUser.id);
        console.log(`[DEBUG /verify] member from cache: ${member ? member.user.tag : 'null/undefined'} (ID: ${member ? member.id : 'N/A'})`);

        if (!member) {
            await interaction.reply({ content: 'Could not find that user in this server. Please ensure the ID is correct or the user is in the server.', flags: [MessageFlags.Ephemeral] });
            return;
        }

        let expiresAt = null;
        let durationTextForDM = "Permanent access";

        if (durationOption !== 'permanent') {
            const days = parseInt(durationOption.replace('d', ''), 10);
            if (!isNaN(days) && days > 0) {
                expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
                durationTextForDM = `Access for ${days} Days (until ${expiresAt.toLocaleDateString()})`;
            } else {
                await interaction.reply({ content: 'Invalid duration specified. Please use "permanent", "7d", "30d", "90d", or "365d".', flags: [MessageFlags.Ephemeral] });
                return;
            }
        }

        try {
            const db = clientDB.db('MineBotDB'); // <--- REPLACE THIS WITH YOUR ACTUAL DATABASE NAME!
            const collection = db.collection('verifiedUsers');

            await collection.updateOne(
                { userId: member.id },
                { $set: {
                    userId: member.id,
                    username: member.user.tag,
                    isVerified: true,
                    expiresAt: expiresAt,
                    verifiedAt: new Date(),
                    verifiedBy: interaction.user.id
                }},
                { upsert: true }
            );

            verifiedUsersCache.set(member.id, { userId: member.id, isVerified: true, expiresAt: expiresAt });


            await interaction.reply({ content: `${member.user.tag} has been verified! They can now use the \`/predict\` command.`, ephemeral: false });

            try {
                await member.send(verificationSuccessfulDM(member.user.username, durationTextForDM));
                console.log(`Sent verification successful DM to ${member.user.tag}`);
            } catch (dmError) {
                console.error(`Could not send verification successful DM to ${member.user.tag}. They might have DMs disabled.`, dmError);
                await interaction.followUp({ content: `(I tried to send a verification confirmation DM to ${member.user.tag} with important information, but their DMs might be disabled.)`, ephemeral: false });
            }

        } catch (error) {
            console.error('Error during verification:', error.message);
            await interaction.reply({ content: 'An error occurred during verification. Please try again or contact an admin.', flags: [MessageFlags.Ephemeral] });
        }
    }

    // --- /admin subcommand group logic ---
    if (commandName === 'admin') {
        if (!isAuthorizedAdmin(interaction.user.id)) {
            await interaction.reply({ content: 'You do not have permission to use admin commands.', flags: [MessageFlags.Ephemeral] });
            return;
        }

        const subCommand = interaction.options.getSubcommand();

        if (subCommand === 'revoke') {
            // PASTE YOUR EXISTING LOGIC FOR /ADMIN REVOKE HERE
            await interaction.reply({ content: 'Admin: User access revoked (placeholder).', flags: [MessageFlags.Ephemeral] });
        } else if (subCommand === 'stats') {
            // PASTE YOUR EXISTING LOGIC FOR /ADMIN STATS HERE
            await interaction.reply({ content: 'Admin: Bot stats displayed (placeholder).', ephemeral: false });
        } else if (subCommand === 'unban') {
            // PASTE YOUR EXISTING LOGIC FOR /ADMIN UNBAN HERE
            await interaction.reply({ content: 'Admin: User unbanned from submitting results (placeholder).', flags: [MessageFlags.Ephemeral] });
        }
    }

    // --- /emergency subcommand group logic ---
    if (commandName === 'emergency') {
        if (!isAuthorizedAdmin(interaction.user.id)) {
            await interaction.reply({ content: 'You do not have permission to use emergency commands.', flags: [MessageFlags.Ephemeral] });
            return;
        }

        const subCommand = interaction.options.getSubcommand();

        if (subCommand === 'verify') {
            // PASTE YOUR EXISTING LOGIC FOR /EMERGENCY VERIFY HERE
            await interaction.reply({ content: 'Emergency: User force verified (placeholder).', flags: [MessageFlags.Ephemeral] });
        }
    }

    // --- /how_to_submit_result Command Logic ---
    if (commandName === 'how_to_submit_result') {
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
        await interaction.reply({ content: helpMessage, flags: [MessageFlags.Ephemeral] });
    }

    // --- /leaderboard Command Logic ---
    if (commandName === 'leaderboard') {
        // PASTE YOUR EXISTING LOGIC FOR /LEADERBOARD HERE
        await interaction.reply({ content: 'Leaderboard: Top submitters displayed (placeholder).', ephemeral: false });
    }

    // --- /myresult Command Logic ---
    if (commandName === 'myresult') {
        // PASTE YOUR EXISTING LOGIC FOR /MYRESULT HERE
        await interaction.reply({ content: 'My Results: Your submission count displayed (placeholder).', flags: [MessageFlags.Ephemeral] });
    }

    // --- /submitresult Command Logic ---
    if (commandName === 'submitresult') {
        const serverSeedHash = interaction.options.getString('server_seed_hash');
        const clientSeed = interaction.options.getString('client_seed');
        const nonce = interaction.options.getInteger('nonce');
        const numMines = interaction.options.getInteger('num_mines');
        const minePositionsString = interaction.options.getString('mine_positions');

        const minePositions = minePositionsString.split(',').map(pos => parseInt(pos.trim(), 10));

        if (minePositions.length !== numMines || minePositions.some(isNaN) || minePositions.some(pos => pos < 0 || pos > 24) || new Set(minePositions).size !== numMines) {
            await interaction.reply({ content: '❌ Invalid mine positions provided. Please ensure it\'s a comma-separated list of unique numbers between 0-24, and the count matches the "num_mines" option.', flags: [MessageFlags.Ephemeral] });
            return;
        }

        try {
            const computedMines = calculateRollbetMines(serverSeedHash, clientSeed, nonce, numMines);
            const sortedSubmittedMines = [...minePositions].sort((a, b) => a - b);
            const sortedComputedMines = [...computedMines].sort((a, b) => a - b);

            if (JSON.stringify(sortedSubmittedMines) === JSON.stringify(sortedComputedMines)) {
                const db = clientDB.db('MineBotDB'); // <--- REPLACE THIS WITH YOUR ACTUAL DATABASE NAME!
                const collection = db.collection('gameResults');

                await collection.insertOne({
                    userId: interaction.user.id,
                    username: interaction.user.tag,
                    serverSeedHash,
                    clientSeed,
                    nonce,
                    numMines,
                    minePositions: sortedSubmittedMines,
                    submittedAt: new Date(),
                    isValidated: true
                });

                await interaction.reply({ content: '✅ Your game result has been successfully submitted and validated! It will now contribute to our community data.', flags: [MessageFlags.Ephemeral] });
            } else {
                await interaction.reply({ content: '❌ Submitted mine positions do not match the computed game outcome or are invalid. Please double-check your input and ensure your algorithm for Rollbet\'s provably fair system is **exactly** correct if you are developing it.', flags: [MessageFlags.Ephemeral] });
            }
        } catch (error) {
            console.error('Error in /submitresult validation or storage:', error.message);
            await interaction.reply({ content: 'An unexpected error occurred while processing your submission. Please try again or contact an admin.', flags: [MessageFlags.Ephemeral] });
        }
    }

    // --- /predict Command Logic (now with AI analysis capability) ---
    if (commandName === 'predict') {
        const userId = interaction.user.id;
        const db = clientDB.db('MineBotDB'); // <--- REPLACE THIS WITH YOUR ACTUAL DATABASE NAME!
        const verifiedCollection = db.collection('verifiedUsers');
        const gameResultsCollection = db.collection('gameResults');

        try {
            const userVerification = await verifiedCollection.findOne({ userId: userId });

            if (!userVerification || !userVerification.isVerified) {
                await interaction.reply({ content: '🔒 You must be verified to use the \`/predict\` command. Please ask an admin to verify you, or share your game results via \`/submitresult\` to gain access!', flags: [MessageFlags.Ephemeral] });
                return;
            }

            if (userVerification.expiresAt && userVerification.expiresAt < new Date()) {
                await verifiedCollection.updateOne(
                    { userId: userId },
                    { $set: { isVerified: false, expiredAt: new Date() } }
                );
                verifiedUsersCache.delete(userId);

                try {
                    await interaction.user.send(accessExpiredDM(interaction.user.username));
                    console.log(`Sent access expired DM to ${interaction.user.tag}`);
                } catch (dmError) {
                    console.error(`Could not send access expired DM to ${dmError.recipient?.tag || 'unknown user'}. They might have DMs disabled.`, dmError);
                }

                await interaction.reply({ content: 'Expired! ⏳ Your data analysis access has expired. Please check your DMs for more information. Ask an admin to re-verify you or submit more results via \`/submitresult\` for free access!', flags: [MessageFlags.Ephemeral] });
                return;
            }

            // --- AI Analysis Section for /predict ---
            await interaction.deferReply();

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
                dataSummary += `Game ${index + 1}: Mines: ${game.numMines}, Positions: [${game.minePositions.join(', ')}], Nonce: ${game.nonce}\n`;
            });
            dataSummary += `\nBased on this data, provide an analysis of observed patterns or interesting insights regarding mine distribution, game frequencies, or any statistical anomalies. Remind the user this is for data analysis and does not predict future random outcomes.`;

            const aiAnalysis = await callGeminiAPI(dataSummary);

            await interaction.editReply({ content: `**🤖 AI Data Analysis from Latest Submissions:**\n\n${aiAnalysis}`, ephemeral: false });

        } catch (error) {
            console.error('Error in /predict or AI analysis:', error.message);
            // Ensure this uses editReply because deferReply was called
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: 'An unexpected error occurred while trying to generate AI analysis. Please try again later.', flags: [MessageFlags.Ephemeral] });
            } else {
                // Fallback reply if somehow not deferred/replied (shouldn't happen with deferReply at start)
                await interaction.reply({ content: 'An unexpected error occurred while trying to generate AI analysis. Please try again later.', flags: [MessageFlags.Ephemeral] });
            }
        }
    }
});

// --- Bot Login ---
client.login(process.env.BOT_TOKEN);

// --- Slash Command Registration (Run this section ONCE manually or in a separate deploy script) ---
/*
const commands = [
    {
        name: 'verify',
        description: 'Admin: Verifies a user by ID for permanent or time-based access.',
        options: [
            {
                name: 'user',
                type: 6, // USER type
                description: 'The user (by ID or mention) to verify.',
                required: true, // IMPORTANT: Ensure this is 'true' in your Discord Developer Portal command definition
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

const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');
        // REPLACE 'YOUR_CLIENT_ID' and optionally 'YOUR_GUILD_ID' below!
        await rest.put(
             Routes.applicationCommands('YOUR_CLIENT_ID'), // Global commands
             // Routes.applicationGuildCommands('YOUR_CLIENT_ID', 'YOUR_GUILD_ID'), // Guild-specific commands (faster updates)
             { body: commands },
         );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('Failed to register slash commands:', error.message);
    }
})();
*/
