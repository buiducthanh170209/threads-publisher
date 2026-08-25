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
        error: "OPENAI_API_KEY chưa được cấu hình."
      });
    }

    const { topic, style } = req.body || {};

    if (!topic || !topic.trim()) {
      return res.status(400).json({
        success: false,
        error: "Bạn chưa nhập chủ đề."
      });
    }

    const prompt = `
Bạn là AI chuyên viết nội dung ngắn cho Threads.

Hãy viết một bài Threads bằng tiếng Việt.

Chủ đề:
${topic}

Phong cách:
${style || "tự nhiên, ngắn gọn, dễ đọc"}

Yêu cầu:
- 1 bài duy nhất.
- Không giải thích.
- Không đặt trong dấu ngoặc kép.
- Không nói "đây là bài viết".
- Tối đa khoảng 400 ký tự.
- Có thể dùng emoji nhưng không lạm dụng.
- Không bịa thông tin cụ thể nếu chủ đề cần dữ kiện.
`;

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
          input: prompt
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
        raw: raw.slice(0, 1000)
      });
    }

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: data
      });
    }

    const text =
      data.output_text ||
      data.output
        ?.flatMap(item => item.content || [])
        ?.filter(item => item.type === "output_text")
        ?.map(item => item.text)
        ?.join("") ||
      "";

    if (!text.trim()) {
      return res.status(502).json({
        success: false,
        error: "AI không tạo được nội dung."
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
