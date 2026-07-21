// Stiff Competition FAQ Bot — backend service
// Deploys to Railway. Exposes POST /api/chat for the Shopify widget,
// and is reused by discord-bot.js for Discord.

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
  console.error('Missing ANTHROPIC_API_KEY environment variable.');
  process.exit(1);
}

const kb = JSON.parse(fs.readFileSync(path.join(__dirname, 'knowledge-base.json'), 'utf8'));

function buildSystemPrompt() {
  const faqBlock = kb.faqs
    .map((f, i) => `${i + 1}. Q: ${f.question}\n   A: ${f.answer}`)
    .join('\n\n');

  return `You are the customer support assistant for ${kb.brand.name}, an ecommerce store (${kb.brand.description}).

Answer customer questions using ONLY the facts below. If a question isn't covered by these facts, say you don't have that information and point the customer to ${kb.brand.contact_email} rather than guessing or inventing an answer.

Keep answers short (2-4 sentences), direct, and friendly. Do not make up policy details, prices, shipping times, or dates that aren't in the facts below.

KNOWN FACTS:
${faqBlock}

Brand characters: ${kb.brand.characters.join(', ')}.
Contact email for anything not covered here: ${kb.brand.contact_email}.`;
}

const SYSTEM_PROMPT = buildSystemPrompt();

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
      system: SYSTEM_PROMPT,
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

app.listen(PORT, () => {
  console.log(`Stiff Competition FAQ bot listening on port ${PORT}`);
});

module.exports = { askClaude, SYSTEM_PROMPT };
