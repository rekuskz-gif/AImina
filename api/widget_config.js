module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const clientId = req.query.clientId || 'mina_001';

    // ТЕСТОВЫЕ ДАННЫЕ (пока таблица не работает)
    const testData = {
      mina_001: {
        text1: 'Здравствуйте я Амина',
        text2: 'Могу ответить на вопросы',
        colorStart: '#7c3aed',
        colorEnd: '#4f46e5',
        avatarUrl: 'https://via.placeholder.com/100',
        botName: 'Амина'
      }
    };

    const config = testData[clientId];
    
    if (!config) {
      return res.status(404).json({ error: "Клиент не найден" });
    }

    res.status(200).json(config);

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
};
