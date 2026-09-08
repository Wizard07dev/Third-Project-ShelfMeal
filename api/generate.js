// Converts the Anthropic-style messages array the frontend sends into
// Gemini's "contents" shape.
function toGeminiContents(messages) {
  return messages.map(function(m) {
    var parts;
    if (typeof m.content === 'string') {
      parts = [{ text: m.content }];
    } else {
      parts = m.content.map(function(block) {
        if (block.type === 'text') {
          return { text: block.text };
        }
        if (block.type === 'image') {
          return {
            inlineData: {
              mimeType: block.source.media_type,
              data: block.source.data
            }
          };
        }
        return null;
      }).filter(Boolean);
    }
    return {
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: parts
    };
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST.' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Server is missing its API key. Set GEMINI_API_KEY in Vercel.' });
    return;
  }

  try {
    const { messages } = req.body;

    if (!messages) {
      res.status(400).json({ error: 'Request is missing "messages".' });
      return;
    }

    const geminiRes = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          contents: toGeminiContents(messages)
        })
      }
    );

    const data = await geminiRes.json();

    if (!geminiRes.ok) {
      res.status(geminiRes.status).json({ error: data.error?.message || 'Gemini API error.' });
      return;
    }

    var text = '';
    var candidate = data.candidates && data.candidates[0];
    if (candidate && candidate.content && candidate.content.parts) {
      text = candidate.content.parts.map(function(p) { return p.text || ''; }).join('');
    }

    // Reshape into the same {content: [{type, text}]} format the frontend
    // already expects, so script.js needs no changes.
    res.status(200).json({ content: [{ type: 'text', text: text }] });
  } catch (err) {
    res.status(500).json({ error: 'Something went wrong reaching the meal generator.' });
  }
}
