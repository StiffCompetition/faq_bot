// Stiff Competition FAQ Bot — backend service
// Deploys to Railway. Exposes POST /api/chat for the Shopify widget,
// and is reused by discord-bot.js for Discord.

const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
  console.error('Missing ANTHROPIC_API_KEY environment variable.');
  process.exit(1);
}

// Load KB from GitHub instead of local file
let kb = null;

async function loadKB() {
  try {
    const response = await fetch('https://raw.githubusercontent.com/StiffCompetition/sc-kb/main/kb-master.json');
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
    kb = await response.json();
    console.log(`Loaded ${kb.length} KB entries from GitHub`);
  } catch (err) {
    console.error('Failed to load KB from GitHub:', err.message);
    // Fallback: empty KB so the bot gracefully degrades
    kb = [];
  }
}

function buildSystemPrompt() {
  if (!kb || kb.length === 0) {
    return `You are the customer support assistant for Stiff Competition, an ecommerce store.
Answer customer questions using only the facts provided. If you don't have information, 
point the customer to support@stiffcompetition.com. Keep answers short (2-4 sentences).`;
  }

  const faqBlock = kb
    .filter(row => row.active === 'checked' && row.visibility === 'external')
    .map((f, i) => `${i + 1}. Q: ${f.topic}\n   A: ${f.content}`)
    .join('\n\n');

  return `You are the customer support assistant for Stiff Competition, an ecommerce store.

Answer customer questions using ONLY the facts below. If a question isn't covered by these facts, say you don't have that information and point the customer to rigid@stiffcompetitionart.com rather than guessing or inventing an answer.

Keep answers short (2-4 sentences), direct, and friendly. Do not make up policy details, prices, shipping times, or dates that aren't in the facts below.

KNOWN FACTS:
${faqBlock}

Contact email for anything not covered here: rigid@stiffcompetitionart.com`;
}

const SYSTEM_PROMPT = buildSystemPrompt;

async function askClaude(userMessage, history = []) {
  const messages = [
    ...history.slice(-6), // keep last few turns for context, avoid runaway context growth
    { role: 'user', content: userMessage },
  ];

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      system: SYSTEM_PROMPT(),
      messages,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const textBlock = data.content.find((c) => c.type === 'text');
  return textBlock ? textBlock.text : "Sorry, I couldn't generate a response.";
}

// Health check for Railway
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Main chat endpoint used by the Shopify widget
app.post('/api/chat', async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Missing "message" string in request body.' });
    }
    const reply = await askClaude(message, Array.isArray(history) ? history : []);
    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong answering that question.' });
  }
});

app.listen(PORT, async () => {
  console.log(`Stiff Competition FAQ bot listening on port ${PORT}`);
  await loadKB();
});

module.exports = { askClaude, SYSTEM_PROMPT };
