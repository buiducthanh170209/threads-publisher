export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({
        success: false,
        error: "Method not allowed"
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: "GEMINI_API_KEY chưa được cấu hình trên Vercel."
      });
    }

    const body = req.body || {};
    const topic = String(body.topic || "").trim();
    const style = String(body.style || "tự nhiên, cuốn hút").trim();

    if (!topic) {
      return res.status(400).json({
        success: false,
        error: "Bạn chưa nhập chủ đề."
      });
    }

    const prompt =
      "Viết một bài đăng Threads bằng tiếng Việt.\n\n" +
      "Chủ đề: " + topic + "\n" +
      "Phong cách: " + style + "\n\n" +
      "Yêu cầu:\n" +
      "- Ngắn gọn và tự nhiên.\n" +
      "- Dễ đọc trên Threads.\n" +
      "- Thu hút người đọc.\n" +
      "- Có thể dùng emoji.\n" +
      "- Chỉ trả về nội dung bài đăng.\n" +
      "- Không giải thích.";

    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=" +
      encodeURIComponent(apiKey);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ]
      })
    });

    const raw = await response.text();

    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      return res.status(502).json({
        success: false,
        error: "Gemini trả về dữ liệu không hợp lệ.",
        raw: raw.substring(0, 500)
      });
    }

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: data
      });
    }

    const text =
      data &&
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text;

    if (!text) {
      return res.status(500).json({
        success: false,
        error: "Gemini không trả về nội dung.",
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
