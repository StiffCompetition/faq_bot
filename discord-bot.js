// Stiff Competition FAQ Bot — Discord connector
// Reuses the same knowledge base and Claude call as server.js.
// Run alongside server.js on Railway (see README for the two-process setup).

const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { askClaude } = require('./server');

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
// Optional: restrict the bot to a specific channel by ID (e.g. #faq or #support).
// Leave unset to let it respond anywhere it's mentioned.
const FAQ_CHANNEL_ID = process.env.DISCORD_FAQ_CHANNEL_ID || null;

if (!DISCORD_BOT_TOKEN) {
  console.error('Missing DISCORD_BOT_TOKEN environment variable.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

client.once('ready', () => {
  console.log(`Discord FAQ bot logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (FAQ_CHANNEL_ID && message.channel.id !== FAQ_CHANNEL_ID) return;

  // Respond if the bot is mentioned, or always respond in the dedicated FAQ channel.
  const mentioned = message.mentions.has(client.user);
  if (!mentioned && !FAQ_CHANNEL_ID) return;

  const question = message.content.replace(/<@!?\d+>/g, '').trim();
  if (!question) return;

  try {
    await message.channel.sendTyping();
    const reply = await askClaude(question);
    await message.reply(reply);
  } catch (err) {
    console.error(err);
    await message.reply("Sorry, something went wrong answering that. Try rigid@stiffcompetitionart.com if it's urgent.");
  }
});

client.login(DISCORD_BOT_TOKEN);
