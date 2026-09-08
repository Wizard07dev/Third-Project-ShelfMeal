export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST.' });
    return;
  }

  // On a Vercel deployment this token is provided automatically, no setup needed.
  // If you'd rather use your own AI Gateway key instead, set AI_GATEWAY_API_KEY
  // in your Vercel project's environment variables and it will be used instead.
  const gatewayKey = process.env.AI_GATEWAY_API_KEY;
  const oidcToken = process.env.VERCEL_OIDC_TOKEN;

  if (!gatewayKey && !oidcToken) {
    res.status(500).json({
      error: 'No AI Gateway credentials found. If you are testing locally, run "vercel link" then "vercel dev" so the OIDC token is available.'
    });
    return;
  }

  try {
    const { messages, max_tokens } = req.body;

    if (!messages) {
      res.status(400).json({ error: 'Request is missing "messages".' });
      return;
    }

    const headers = {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    };
    if (gatewayKey) {
      headers['x-api-key'] = gatewayKey;
    } else {
      headers['Authorization'] = 'Bearer ' + oidcToken;
    }

    const gatewayRes = await fetch('https://ai-gateway.vercel.sh/v1/messages', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        model: 'anthropic/claude-haiku-4.5',
        max_tokens: max_tokens || 1000,
        messages: messages
      })
    });

    const data = await gatewayRes.json();

    if (!gatewayRes.ok) {
      var message = data.error?.message || 'AI Gateway error.';
      if (gatewayRes.status === 403) {
        message = 'This model is not available on the free tier (' + message + '). Try a lower-cost model, or add AI Gateway credits.';
      }
      res.status(gatewayRes.status).json({ error: message });
      return;
    }

    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Something went wrong reaching the meal generator.' });
  }
}
