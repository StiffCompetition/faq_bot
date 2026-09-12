const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

const N8N_BASE_URL = 'https://n8n-production-afc2.up.railway.app';
const N8N_PROJECT = '5tHMVzHlU1eiamv9';
const KB_TABLE = 'a8dJwY1TwutuErts';

let knowledgeBase = [];

async function loadKnowledgeBase() {
  try {
    // Fetch KB via the public no-auth webhook (the /api/v1/data-tables REST
    // endpoint requires an n8n API key that isn't configured here and 401s)
    const response = await fetch(
      `${N8N_BASE_URL}/webhook/sc-kb-public`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`n8n API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    knowledgeBase = Array.isArray(data) ? data : (data.rows || []);
    console.log(`Loaded ${knowledgeBase.length} KB rows from n8n`);
    return true;
  } catch (error) {
    console.error('Failed to load KB from n8n:', error.message);
    return false;
  }
}

// Load KB on startup and periodically refresh
loadKnowledgeBase().then(success => {
  if (!success) {
    console.error('CRITICAL: Failed to load KB on startup - bot will serve empty responses');
  }
});

// Refresh KB every 5 minutes
setInterval(loadKnowledgeBase, 5 * 60 * 1000);

const BRIDGE_URL = `${N8N_BASE_URL}/webhook/sc-web-bridge`;

async function askSharedBrain(message, history, channel, contactId) {
  const response = await fetch(BRIDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history: history || [], channel, contact_id: contactId })
  });
  if (!response.ok) {
    throw new Error(`Shared Brain bridge returned ${response.status}: ${response.statusText}`);
  }
  const data = await response.json();
  return data.reply || data.response || 'Standing by, Soldier.';
}

// Kept for backwards compatibility with discord-bot.js's original single-argument call
async function askClaude(message) {
  return askSharedBrain(message, [], 'discord', null);
}

app.post('/api/chat', async (req, res) => {
  const { message, history } = req.body;

  if (!message || typeof message !== 'string') {
    return res.json({ reply: 'Invalid message format', response: 'Invalid message format' });
  }

  try {
    const reply = await askSharedBrain(message, history, 'web', req.body.contact_id);
    res.json({ reply, response: reply });
  } catch (error) {
    console.error('Shared Brain call failed:', error.message);
    res.status(500).json({
      reply: "Sorry, I couldn't reach support right now. Try rigid@stiffcompetitionart.com.",
      response: "Sorry, I couldn't reach support right now. Try rigid@stiffcompetitionart.com."
    });
  }
});

module.exports = { askClaude, askSharedBrain };

app.get('/health', (req, res) => {
  res.json({ status: 'ok', kbLoaded: knowledgeBase.length > 0 });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Stiff Competition FAQ bot listening on port ${PORT}`);
});
