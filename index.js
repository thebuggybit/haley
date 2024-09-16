const { Client, GatewayIntentBits, Collection, ActivityType } = require("discord.js");
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessages
    ]
});

const botConfig = require("./botConfig.json"); // Config file containing tokens and IDs
const CharacterAI = require('node_characterai');
const characterAI = new CharacterAI();
const fs = require("fs");

const { REST } = require('@discordjs/rest');
const { Routes } = require('discord.js');

// Set up commands if you have them
client.commands = new Collection(); 
const commands = []; 
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith(".js"));

for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    client.commands.set(command.data.name, command);
    commands.push(command.data.toJSON());
    console.log(`${command.data.name}.js has loaded.`);
}

client.once("ready", async () => {
    console.log(`${client.user.username} is online.`);
    client.user.setPresence({ activities: [{ name: ``, type: ActivityType.Playing }], status: 'Online' });

    // Register slash commands if needed
    const rest = new REST({ version: '10' }).setToken(botConfig.token);
    (async () => {
        try {
            console.log(`Started refreshing application (/) commands.`);
            const data = await rest.put(
                Routes.applicationCommands(client.user.id),
                { body: commands },
            );
            console.log(`Successfully reloaded application (/) commands.`);
        } catch (error) {
            console.error(error);
        }
    })();

    console.log("Fetching and replying to recent mentions...");

    // Get the specific channel from the ID in botConfig.json
    const channel = client.channels.cache.get(botConfig.chatID);

    if (channel && channel.type === 0) { // 0 is the value for 'GUILD_TEXT'
        console.log(`Processing channel: ${channel.name} (${channel.id})`);
        try {
            // Fetch the last X messages from the specified channel
            const messageLimit = 1; // Set how many messages to fetch (you can change this limit)
            const messages = await channel.messages.fetch({ limit: messageLimit });
            
            console.log(`Fetched ${messages.size} messages from channel ${channel.name}`);
            
            // Process each message
            for (const msg of messages.values()) {
                if (!msg.author.bot) { // Ignore messages from bots
                    console.log(`Processing message: "${msg.content}" from user ${msg.author.tag}`);
                    await handleMessage(msg);
                }
            }
        } catch (error) {
            console.error(`Error processing messages in channel ${channel.name} (${channel.id}):`, error);
        }
    } else {
        console.log(`Could not find specified channel with ID ${botConfig.chatID} or it's not a text channel.`);
    }
});

client.on("messageCreate", async message => {
    // Ignore messages from bots
    if (message.author.bot) return; 

    // Only respond if the message is in the designated channel
    if (message.channel.id !== botConfig.chatID) return;

    await handleMessage(message);
});

async function handleMessage(message) {
    // Extract the message text
    const msgText = message.content;

    // Simulate the bot typing
    await message.channel.sendTyping();

    try {
        // Get AI response
        const response = await aiMSG(msgText);

        // Reply to the message with the AI response
        await message.reply(`${response.text}`);
    } catch (error) {
        console.error(`Error handling message from ${message.author.tag}:`, error);
        await message.reply("There was a problem processing your request.");
    }
}

async function aiMSG(msgText) {
    // Authenticate with Character.AI if not already authenticated
    if (!characterAI.isAuthenticated()) { 
        await characterAI.authenticateWithToken(botConfig.authToken);
    }

    // Create or continue the chat
    const chat = await characterAI.createOrContinueChat(botConfig.characterID);

    // Send a message and get a response
    const response = await chat.sendAndAwaitResponse(msgText, true);

    return response; // Return the AI response text
}

// Handles slash commands if any exist
client.on("interactionCreate", async interaction => {
    if (interaction.isCommand()) {
        const slashCommand = client.commands.get(interaction.commandName); 
        if (!slashCommand) return; 

        try {
            await slashCommand.execute(client, interaction, characterAI);
        } catch (err) {
            await interaction.reply({ content: `An error has occurred. ${err}`, ephemeral: true });
        }
    }
});

// Log in the bot using the token
client.login(botConfig.token);
