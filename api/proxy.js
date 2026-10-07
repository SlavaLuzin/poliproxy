// api/proxy.js
export default async function handler(req, res) {
  // Разрешаем CORS для всех источников
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Обрабатываем preflight-запрос (CORS)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Принимаем только POST-запросы (как в OpenAI API)
  // if (req.method !== 'POST') {
  //  return res.status(405).json({ error: 'Method not allowed' });
  // }

  try {
    const { messages, model = 'openai' } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    // Извлекаем последнее сообщение пользователя как промпт
    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    const prompt = lastUserMessage ? lastUserMessage.content : 'Hello';

    // Формируем URL для GET-запроса к Pollinations
    const encodedPrompt = encodeURIComponent(prompt);
    const pollinationsUrl = `https://text.pollinations.ai/${encodedPrompt}`;
    return res.status(200).json({
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: pollinationsUrl
        },
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      }
    });

    // Отправляем GET-запрос к Pollinations
    const response = await fetch(pollinationsUrl);
    const responseText = await response.text();

    // Возвращаем ответ в формате OpenAI (как ожидает exteraGram)
    return res.status(200).json({
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: responseText
        },
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      }
    });

  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({ 
      error: { 
        message: error.message,
        type: 'proxy_error' 
      } 
    });
  }
}