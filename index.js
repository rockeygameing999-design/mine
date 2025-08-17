// Required Discord.js and MongoDB modules
const { Client, GatewayIntentBits, Partials, PermissionFlagsBits } = require('discord.js');
const { MongoClient } = require('mongodb');
const { REST, Routes } = require('discord.js'); // For registering slash commands
// You might need a crypto library if your provably fair function uses SHA256 or similar
// const crypto = require('crypto'); // Uncomment if needed for provably fair calculation

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
 * YOU MUST IMPLEMENT THIS FUNCTION ACCURATELY BASED ON ROLLBET'S PUBLICLY DOCUMENTED ALGORITHM.
 * Without this, /submitresult validation will always fail.
 *
 * @param {string} serverSeedHash The server seed hash.
 * @param {string} clientSeed The client seed.
 * @param {number} nonce The game nonce.
 * @param {number} numMines The number of mines for the game.
 * @returns {number[]} An array of mine positions (0-24) sorted in ascending order.
 */
function calculateRollbetMines(serverSeedHash, clientSeed, nonce, numMines) {
    // This is a placeholder. You need to replace this with Rollbet's actual algorithm.
    // Example structure (conceptual, not actual Rollbet logic):
    /*
    const combinedSeed = `${serverSeedHash}-${clientSeed}-${nonce}`;
    const hash = crypto.createHash('sha256').update(combinedSeed).digest('hex');

    const minePositions = [];
    const availablePositions = Array.from({ length: 25 }, (_, i) => i); // 0 to 24

    // This part is highly specific to the algorithm. It usually involves deriving
    // random numbers from the hash and selecting unique positions.
    for (let i = 0; i < numMines; i++) {
        // Example: Use parts of the hash to pick a random index from availablePositions
        // This is a simplified example; actual algorithm will be more complex.
        const randomIndex = parseInt(hash.substring(i * 2, i * 2 + 2), 16) % availablePositions.length;
        const selectedPosition = availablePositions.splice(randomIndex, 1)[0];
        minePositions.push(selectedPosition);
    }
    return minePositions.sort((a, b) => a - b);
    */

    // --- Current Placeholder Implementation ---
    // If you run the bot without implementing the real algorithm,
    // this placeholder will always cause a mismatch unless the input happens to be [1, 5, 10].
    console.warn("WARNING: calculateRollbetMines is using a placeholder. Please implement Rollbet's actual provably fair algorithm.");
    if (numMines === 3 && clientSeed.startsWith('test')) { // Example for testing
        return [1, 5, 10];
    }
    return []; // Return empty or a fixed array for validation to fail consistently if not implemented
}


// --- MongoDB Connection Setup ---
const mongoUri = process.env.MONGO_URI; // Your MongoDB connection string from Render
const clientDB = new MongoClient(mongoUri); // Renamed to avoid conflict with Discord Client

async function connectToMongoDB() {
    try {
        await clientDB.connect();
        console.log('Connected to MongoDB');
    } catch (error) {
        console.error('Failed to connect to MongoDB:', error.message);
        // Implement exponential backoff for retries
        let retries = 0;
        const maxRetries = 5;
        const baseDelay = 1000; // 1 second

        while (retries < maxRetries) {
            const delay = baseDelay * Math.pow(2, retries);
            console.log(`Retrying MongoDB connection in ${delay / 1000} seconds... (Attempt ${retries + 1})`);
            await new Promise(res => setTimeout(res, delay));
            try {
                await clientDB.connect();
                console.log('Reconnected to MongoDB');
                return; // Exit if reconnected successfully
            } catch (retryError) {
                console.error(`Retry failed: ${retryError.message}`);
                retries++;
            }
        }
        console.error('Max retries reached. Could not connect to MongoDB.');
        process.exit(1); // Exit if unable to connect after retries
    }
}

// --- No longer pre-loading all verified users into memory for strict checks ---
// Verification status will be checked directly from MongoDB for commands like /predict.
// This cache is now more for quick reference if needed, but not for strict access control.
let verifiedUsersCache = new Map(); // A simple cache for frequently accessed verification data

// This function can be used to load initial data if needed, but for dynamic checks,
// querying the DB directly in commands is more reliable for real-time status.
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
    const baseDelay = 1000; // 1 second

    while (retries < maxRetries) {
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.status === 429) { // Too Many Requests
                const delay = baseDelay * Math.pow(2, retries);
                console.warn(`Gemini API rate limit hit. Retrying in ${delay / 1000} seconds...`);
                await new Promise(res => setTimeout(res, delay));
                retries++;
                continue; // Try again
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
        GatewayIntentBits.DirectMessages, // REQUIRED for sending DMs
        GatewayIntentBits.GuildMembers,   // REQUIRED for GuildMemberAdd event and fetching members
        GatewayIntentBits.MessageContent, // If your bot reads message content (e.g., for prefix commands)
        // Add any other intents your bot uses (e.g., GuildPresences if you track user status)
    ],
    partials: [Partials.Channel, Partials.Message, Partials.GuildMember], // Partials are important for DMs and messages, and GuildMember for new joins
});

// --- GLOBAL MESSAGE CONTENT CONSTANTS ---

// Message for new members joining the server
const welcomeAndWarningMessage = `
Hello {USERNAME}, welcome to the community!

# 🔮 Why Trust Our Bot?
> **Our bot is a community tool for data validation and analysis for Rollbet's Mines game. We are not a scam or a source of guaranteed wins. Our purpose is to prove the game is truly random and to help improve community understanding.**

# ✅ How It Works:
> **Use /predict to see what our bot's data analysis says about game outcomes. This is for research only and does not guarantee a win.**
> **Submit game results with /submitresult (open to everyone) to help improve data accuracy.**
> **Check your contributions with /myresults and compete on the /leaderboard!**

# 🌟 Transparency & Fairness:
> **We use Rollbet’s provably fair system (server seed, nonce) to ensure all game outcomes are verifiable. All submissions are analyzed to enhance our data, and you can verify results yourself. Verified access grants exclusive data analysis access.**

# 🎁 FREE ACCESS
> **Share your mines result to us by using /submitresult and win free access**
> **Participate in giveaway**

---

**Important Warnings:**
1.  **Fake Reports:** Do NOT submit fake reports. Our bot automatically detects and verifies results. Submitting fake reports will result in an immediate ban.

Please make sure to read and follow these rules. Enjoy your time here!
`;

// Message for successful verification via /verify command
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

// Message for when prediction access expires
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
    await connectToMongoDB(); // Connect to MongoDB when the bot is ready
    await loadInitialVerifiedUsersCache(); // Load initial cache (optional, but good for quick checks)
    // Any other initialization logic for your bot goes here
});

// --- New: Guild Member Add Event (Welcome DM on Server Join) ---
client.on('guildMemberAdd', async member => {
    console.log(`New member joined: ${member.user.tag} (${member.id})`);
    try {
        // Personalize the message for the new member
        const personalizedWelcomeMessage = welcomeAndWarningMessage.replace('{USERNAME}', member.user.username);
        await member.send(personalizedWelcomeMessage);
        console.log(`Sent welcome DM to new member: ${member.user.tag}`);
    } catch (error) {
        console.error(`Could not send welcome DM to ${member.user.tag}. They might have DMs disabled.`, error);
        // Optionally, send a message in a public welcome channel
        // const welcomeChannel = member.guild.channels.cache.find(channel => channel.name === 'welcome'); // Replace 'welcome' with your actual welcome channel name
        // if (welcomeChannel) {
        //     welcomeChannel.send(`Welcome to the server, ${member}! Please check your DMs for important information. If you don't receive it, ensure your DMs are open.`);
        // }
    }
});

// --- Interaction Handling (for slash commands) ---
client.on('interactionCreate', async interaction => {
    // Only process slash commands
    if (!interaction.isCommand()) return;

    const { commandName } = interaction;

    // --- /verify Command Logic (Admin only, verifies by user ID, with duration) ---
    if (commandName === 'verify') {
        // Check if the command issuer is one of the authorized admins
        if (!isAuthorizedAdmin(interaction.user.id)) {
            await interaction.reply({ content: 'You do not have permission to use this command. Only designated administrators can verify users.', ephemeral: true });
            return;
        }

        const targetUser = interaction.options.getUser('user'); // Get the user to verify from the option
        const durationOption = interaction.options.getString('duration'); // Get duration: 'permanent', '7d', etc.

        const member = interaction.guild.members.cache.get(targetUser.id);

        if (!member) {
            await interaction.reply({ content: 'Could not find that user in this server. Please ensure the ID is correct or the user is in the server.', ephemeral: true });
            return;
        }

        let expiresAt = null; // Default to permanent
        let durationTextForDM = "Permanent access"; // Text for the verification successful DM

        if (durationOption !== 'permanent') {
            const days = parseInt(durationOption.replace('d', ''), 10);
            if (!isNaN(days) && days > 0) {
                expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000); // Calculate expiration date
                durationTextForDM = `Access for ${days} Days (until ${expiresAt.toLocaleDateString()})`;
            } else {
                await interaction.reply({ content: 'Invalid duration specified. Please use "permanent", "7d", "30d", "90d", or "365d".', ephemeral: true });
                return;
            }
        }

        try {
            const db = clientDB.db('MineBotDB'); // <--- REPLACE THIS WITH YOUR ACTUAL DATABASE NAME!
            const collection = db.collection('verifiedUsers'); // Ensure this collection exists

            await collection.updateOne(
                { userId: member.id },
                { $set: {
                    userId: member.id,
                    username: member.user.tag,
                    isVerified: true,
                    expiresAt: expiresAt, // Store null for permanent, date for time-based
                    verifiedAt: new Date(),
                    verifiedBy: interaction.user.id // Track which admin verified them
                }},
                { upsert: true } // Create a new document if one doesn't exist for the user
            );

            // Update local cache as well (ensure it's consistent with DB)
            verifiedUsersCache.set(member.id, { userId: member.id, isVerified: true, expiresAt: expiresAt });


            await interaction.reply({ content: `${member.user.tag} has been verified! They can now use the \`/predict\` command.`, ephemeral: false });

            // --- Send the NEW Verification Successful DM with warnings ---
            try {
                await member.send(verificationSuccessfulDM(member.user.username, durationTextForDM));
                console.log(`Sent verification successful DM to ${member.user.tag}`);
            } catch (dmError) {
                console.error(`Could not send verification successful DM to ${member.user.tag}. They might have DMs disabled.`, dmError);
                await interaction.followUp({ content: `(I tried to send a verification confirmation DM to ${member.user.tag} with important information, but their DMs might be disabled.)`, ephemeral: false });
            }

        } catch (error) {
            console.error('Error during verification:', error.message);
            await interaction.reply({ content: 'An error occurred during verification. Please try again or contact an admin.', ephemeral: true });
        }
    }

    // --- /admin subcommand group logic ---
    if (commandName === 'admin') {
        // Check if the command issuer is one of the authorized admins
        if (!isAuthorizedAdmin(interaction.user.id)) {
            await interaction.reply({ content: 'You do not have permission to use admin commands.', ephemeral: true });
            return;
        }

        const subCommand = interaction.options.getSubcommand();

        if (subCommand === 'revoke') {
            // PASTE YOUR EXISTING LOGIC FOR /ADMIN REVOKE HERE
            // This should revoke a user's access to prediction service (e.g., by setting isVerified: false or removing expiresAt)
            // Example: const userToRevoke = interaction.options.getUser('user');
            // const db = clientDB.db('MineBotDB');
            // await db.collection('verifiedUsers').updateOne({ userId: userToRevoke.id }, { $set: { isVerified: false, expiresAt: new Date() } });
            // verifiedUsersCache.delete(userToRevoke.id); // Remove from cache
            await interaction.reply({ content: 'Admin: User access revoked (placeholder).', ephemeral: true });
        } else if (subCommand === 'stats') {
            // PASTE YOUR EXISTING LOGIC FOR /ADMIN STATS HERE
            // This should display bot statistics (e.g., number of verified users, total submissions)
            await interaction.reply({ content: 'Admin: Bot stats displayed (placeholder).', ephemeral: true });
        } else if (subCommand === 'unban') {
            // PASTE YOUR EXISTING LOGIC FOR /ADMIN UNBAN HERE
            // This should unban a user from submitting results (if you have a separate ban system)
            // Example: const userToUnban = interaction.options.getUser('user');
            await interaction.reply({ content: 'Admin: User unbanned from submitting results (placeholder).', ephemeral: true });
        }
    }

    // --- /emergency subcommand group logic ---
    if (commandName === 'emergency') {
        // Check if the command issuer is one of the authorized admins
        if (!isAuthorizedAdmin(interaction.user.id)) {
            await interaction.reply({ content: 'You do not have permission to use emergency commands.', ephemeral: true });
            return;
        }

        const subCommand = interaction.options.getSubcommand();

        if (subCommand === 'verify') {
            // PASTE YOUR EXISTING LOGIC FOR /EMERGENCY VERIFY HERE
            // This would likely involve similar logic to /verify, but might bypass some strict checks
            // Example: const userToForceVerify = interaction.options.getUser('user');
            await interaction.reply({ content: 'Emergency: User force verified (placeholder).', ephemeral: true });
        }
    }

    // --- /how_to_submit_result Command Logic ---
    if (commandName === 'how_to_submit_result') { // Renamed for valid slash command format
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
        await interaction.reply({ content: helpMessage, ephemeral: true }); // Ephemeral so only the user sees it
    }

    // --- /leaderboard Command Logic ---
    if (commandName === 'leaderboard') {
        // PASTE YOUR EXISTING LOGIC FOR /LEADERBOARD HERE
        // Logic to show users who submitted the most results
        await interaction.reply({ content: 'Leaderboard: Top submitters displayed (placeholder).', ephemeral: false });
    }

    // --- /myresult Command Logic ---
    if (commandName === 'myresult') {
        // PASTE YOUR EXISTING LOGIC FOR /MYRESULT HERE
        // Logic to show how many results the user has submitted
        await interaction.reply({ content: 'My Results: Your submission count displayed (placeholder).', ephemeral: true });
    }

    // --- /submitresult Command Logic ---
    if (commandName === 'submitresult') {
        const serverSeedHash = interaction.options.getString('server_seed_hash');
        const clientSeed = interaction.options.getString('client_seed');
        const nonce = interaction.options.getInteger('nonce');
        const numMines = interaction.options.getInteger('num_mines');
        const minePositionsString = interaction.options.getString('mine_positions');

        const minePositions = minePositionsString.split(',').map(pos => parseInt(pos.trim(), 10));

        // Basic validation for mine positions input
        if (minePositions.length !== numMines || minePositions.some(isNaN) || minePositions.some(pos => pos < 0 || pos > 24) || new Set(minePositions).size !== numMines) {
            await interaction.reply({ content: '❌ Invalid mine positions provided. Please ensure it\'s a comma-separated list of unique numbers between 0-24, and the count matches the "num_mines" option.', ephemeral: true });
            return;
        }

        try {
            // --- CRITICAL VALIDATION STEP ---
            // This calls YOUR implementation of Rollbet's algorithm.
            const computedMines = calculateRollbetMines(serverSeedHash, clientSeed, nonce, numMines);

            // Sort both arrays to ensure order doesn't affect comparison
            const sortedSubmittedMines = [...minePositions].sort((a, b) => a - b);
            const sortedComputedMines = [...computedMines].sort((a, b) => a - b);

            if (JSON.stringify(sortedSubmittedMines) === JSON.stringify(sortedComputedMines)) {
                // Mines match - this is a valid submission. Store it.
                const db = clientDB.db('MineBotDB'); // <--- REPLACE THIS WITH YOUR ACTUAL DATABASE NAME!
                const collection = db.collection('gameResults'); // New collection for validated game results

                await collection.insertOne({
                    userId: interaction.user.id,
                    username: interaction.user.tag,
                    serverSeedHash,
                    clientSeed,
                    nonce,
                    numMines,
                    minePositions: sortedSubmittedMines, // Store the validated, sorted positions
                    submittedAt: new Date(),
                    isValidated: true // Mark as valid
                });

                await interaction.reply({ content: '✅ Your game result has been successfully submitted and validated! It will now contribute to our community data.', ephemeral: true });
            } else {
                // Mines do NOT match - reject the submission
                await interaction.reply({ content: '❌ Submitted mine positions do not match the computed game outcome or are invalid. Please double-check your input and ensure your algorithm for Rollbet\'s provably fair system is **exactly** correct if you are developing it.', ephemeral: true });
            }
        } catch (error) {
            console.error('Error in /submitresult validation or storage:', error.message);
            await interaction.reply({ content: 'An unexpected error occurred while processing your submission. Please try again or contact an admin.', ephemeral: true });
        }
    }

    // --- /predict Command Logic (now with AI analysis capability) ---
    if (commandName === 'predict') {
        const userId = interaction.user.id;
        const db = clientDB.db('MineBotDB'); // <--- REPLACE THIS WITH YOUR ACTUAL DATABASE NAME!
        const verifiedCollection = db.collection('verifiedUsers');
        const gameResultsCollection = db.collection('gameResults'); // Get reference to game results

        try {
            const userVerification = await verifiedCollection.findOne({ userId: userId });

            if (!userVerification || !userVerification.isVerified) {
                await interaction.reply({ content: '🔒 You must be verified to use the \`/predict\` command. Please ask an admin to verify you, or share your game results via \`/submitresult\` to gain access!', ephemeral: true });
                return;
            }

            if (userVerification.expiresAt && userVerification.expiresAt < new Date()) {
                // Verification expired, update DB and notify user
                await verifiedCollection.updateOne(
                    { userId: userId },
                    { $set: { isVerified: false, expiredAt: new Date() } }
                );
                verifiedUsersCache.delete(userId); // Remove from cache

                // --- Send the Access Expired DM ---
                try {
                    await interaction.user.send(accessExpiredDM(interaction.user.username));
                    console.log(`Sent access expired DM to ${interaction.user.tag}`);
                } catch (dmError) {
                    console.error(`Could not send access expired DM to ${interaction.user.tag}. They might have DMs disabled.`, dmError);
                }

                await interaction.reply({ content: 'Expired! ⏳ Your data analysis access has expired. Please check your DMs for more information. Ask an admin to re-verify you or submit more results via \`/submitresult\` for free access!', ephemeral: true });
                return;
            }

            // --- AI Analysis Section for /predict ---
            await interaction.deferReply(); // Defer reply as AI call might take time

            // Fetch a sample of recent game results for AI analysis
            // Adjust query as needed (e.g., specific numMines, timeframe)
            const recentGameResults = await gameResultsCollection.find({})
                                                         .sort({ submittedAt: -1 }) // Sort by most recent
                                                         .limit(50) // Get last 50 results
                                                         .toArray();

            if (recentGameResults.length === 0) {
                await interaction.editReply({ content: 'No game results submitted yet for analysis. Please encourage users to use `/submitresult`!', ephemeral: false });
                return;
            }

            // Prepare data for the AI prompt
            let dataSummary = `Recent validated Rollbet Mines game results:\n`;
            recentGameResults.forEach((game, index) => {
                dataSummary += `Game ${index + 1}: Mines: ${game.numMines}, Positions: [${game.minePositions.join(', ')}], Nonce: ${game.nonce}\n`;
            });
            dataSummary += `\nBased on this data, provide an analysis of observed patterns or interesting insights regarding mine distribution, game frequencies, or any statistical anomalies. Remind the user this is for data analysis and does not predict future random outcomes.`;

            const aiAnalysis = await callGeminiAPI(dataSummary);

            await interaction.editReply({ content: `**🤖 AI Data Analysis from Latest Submissions:**\n\n${aiAnalysis}`, ephemeral: false });

        } catch (error) {
            console.error('Error in /predict or AI analysis:', error.message);
            await interaction.followUp({ content: 'An error occurred while trying to generate AI analysis. Please try again later.', ephemeral: true });
        }
    }
});

// --- Bot Login ---
// Make sure your BOT_TOKEN environment variable is set on Render
client.login(process.env.BOT_TOKEN);

// --- Slash Command Registration (Run this section ONCE manually or in a separate deploy script) ---
// This part defines and registers your bot's slash commands with Discord.
// You typically run this a single time after adding/modifying commands,
// or as part of your CI/CD pipeline.
// For development, you might uncomment this, fill in your IDs, run `node index.js` once, then comment it out again.

/*
const commands = [
    // /verify command - Admin only to manually verify a user with duration
    {
        name: 'verify',
        description: 'Admin: Verifies a user by ID for permanent or time-based access.',
        options: [
            {
                name: 'user',
                type: 6, // USER type
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
        // No default_member_permissions here, as we're doing custom ID-based admin check
    },
    // /admin subcommand group
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
        // No default_member_permissions here, as we're doing custom ID-based admin check
    },
    // /emergency subcommand group
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
        // No default_member_permissions here, as we're doing custom ID-based admin check
    },
    // /how_to_submit_result command
    {
        name: 'how_to_submit_result',
        description: 'Shows instructions on how to submit a game result.',
    },
    // /leaderboard command
    {
        name: 'leaderboard',
        description: 'Shows users who submitted the most results.',
    },
    // /myresult command
    {
        name: 'myresult',
        description: 'Shows how many results you have submitted.',
    },
    // /submitresult command
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
                min_value: 1, // Example constraint
                max_value: 24, // Example constraint
            },
            {
                name: 'mine_positions',
                type: 3, // STRING type (e.g., "3,7,12,18,22")
                description: 'Comma-separated list of mine positions (0-24).',
                required: true,
            },
        ],
    },
    // /predict command (now for data analysis, not actual prediction)
    {
       name: 'predict',
       description: 'Analyze past game data (requires verification).',
       // Add options for /predict here if it has any, e.g.,
       // options: [{ name: 'data_filter', type: 3, description: 'Filter data (e.g., "last 24 hours").', required: false }]
    },
];

const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');

        // For guild-specific commands (faster updates for development):
        // UNCOMMENT THIS LINE if you want guild-specific commands.
        // REPLACE 'YOUR_CLIENT_ID' and 'YOUR_GUILD_ID' below!
        // await rest.put(
        //     Routes.applicationGuildCommands('YOUR_CLIENT_ID', 'YOUR_GUILD_ID'),
        //     { body: commands },
        // );

        // For global commands (takes up to 1 hour to propagate, but works everywhere):
        // UNCOMMENT THIS LINE if you want global commands.
        // REPLACE 'YOUR_CLIENT_ID' below!
        await rest.put(
             Routes.applicationCommands('YOUR_CLIENT_ID'), // <--- REPLACE THIS WITH YOUR ACTUAL CLIENT ID!
             { body: commands },
         );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('Failed to register slash commands:', error.message);
    }
})();
*/
