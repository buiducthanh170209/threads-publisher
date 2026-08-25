error: "Method not allowed"
    });
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: "Chưa có OPENAI_API_KEY trên Vercel."
      });
    }

    const { topic, style } = req.body || {};

    if (!topic?.trim()) {
      return res.status(400).json({
        success: false,
        error: "Chưa nhập chủ đề."
      });
    }

    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-5.6",
          input: `Viết một bài Threads bằng tiếng Việt.

Chủ đề: ${topic}

Phong cách: ${style || "tự nhiên, cuốn hút"}

Yêu cầu:
- Viết ngắn gọn.
- Dễ đọc.
- Tự nhiên như người thật.
- Có 
    if (!response.ok) {
      
      
