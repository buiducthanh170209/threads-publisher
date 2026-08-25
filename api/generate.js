export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
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
- Có thể dùng emoji.
- Chỉ trả về nội dung bài viết.
- Không giải thích.`
        })
      }
    );

    const raw = await response.text();

    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      return res.status(502).json({
        success: false,
        error: "OpenAI trả về dữ liệu không hợp lệ.",
        raw: raw.substring(0, 500)
      });
    }

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: data
      });
    }

    const text = data.output_text;

    if (!text) {
      return res.status(500).json({
        success: false,
        error: "AI không trả về nội dung.",
        response: data
      });
    }

    return res.status(200).json({
      success: true,
      text: text.trim()
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
