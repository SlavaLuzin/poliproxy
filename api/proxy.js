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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages, model = 'openai' } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    // --- Сборка промпта из всех сообщений ---
    // Каждое сообщение превращаем в строку с префиксом роли.
    // System-сообщения идут первыми, затем история диалога, затем последний вопрос.
    const roleLabels = {
      system: 'System',
      user: 'User',
      assistant: 'Assistant',
      tool: 'Tool'
    };

    const parts = messages
      .map(m => {
        const role = roleLabels[m.role] || m.role || 'User';
        // content может быть строкой или массивом частей (multimodal)
        let content = m.content;
        if (Array.isArray(content)) {
          content = content
            .map(part => {
              if (typeof part === 'string') return part;
              if (part && part.type === 'text') return part.text || '';
              return '';
            })
            .filter(Boolean)
            .join('\n');
        }
        if (typeof content !== 'string') {
          content = String(content ?? '');
        }
        return `${role}: ${content.trim()}`;
      })
      .filter(line => line.length > 0);

    // Итоговый промпт. Если сообщений несколько — склеиваем через перевод строки.
    const prompt = parts.length > 1
      ? parts.join('\n\n') + '\n\nAssistant:'
      : parts[0] || 'Hello';

    // Формируем URL для GET-запроса к Pollinations
    const encodedPrompt = encodeURIComponent(prompt);
    const pollinationsUrl = `https://text.pollinations.ai/${encodedPrompt}?model=${model}`;

    // Отправляем GET-запрос к Pollinations
    const response = await fetch(pollinationsUrl);

    // Если Pollinations вернул ошибку — пробрасываем её
    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({
        error: {
          message: `Pollinations error: ${errText || response.statusText}`,
          type: 'upstream_error'
        }
      });
    }

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