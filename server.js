const express = require('express');
const app = express();
app.use(express.json());

const N8N_BASE_URL = 'https://n8n-production-afc2.up.railway.app';
const N8N_PROJECT = '5tHMVzHlU1eiamv9';
const KB_TABLE = 'a8dJwY1TwutuErts';

let knowledgeBase = [];

async function loadKnowledgeBase() {
  try {
    // Fetch KB from n8n Data Table API
    const response = await fetch(
      `${N8N_BASE_URL}/api/v1/data-tables/${KB_TABLE}/rows?limit=100&active=checked`,
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
    knowledgeBase = data.rows || [];
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

app.post('/api/chat', (req, res) => {
  const { message } = req.body;
  
  if (!message || typeof message !== 'string') {
    return res.json({ response: 'Invalid message format' });
  }
  
  if (knowledgeBase.length === 0) {
    return res.json({ response: 'Knowledge base not yet loaded. Please try again.' });
  }
  
  const query = message.toLowerCase();
  
  // Search KB for matching topic
  for (const entry of knowledgeBase) {
    if (entry.topic && entry.topic.toLowerCase().includes(query)) {
      return res.json({ response: entry.content || 'No content available' });
    }
  }
  
  // Default response
  res.json({ 
    response: 'Card payments processed securely by PayPal — all major cards accepted, no PayPal account needed.'
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', kbLoaded: knowledgeBase.length > 0 });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Stiff Competition FAQ bot listening on port ${PORT}`);
});
