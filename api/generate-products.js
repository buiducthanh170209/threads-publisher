export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: "GEMINI_API_KEY chưa được cấu hình."
      });
    }

    const {
      title,
      description,
      url,
      images
    } = req.body || {};

    if (!title) {
      return res.status(400).json({
        success: false,
        error: "Thiếu tên sản phẩm."
      });
    }

    const prompt = `
Bạn là AI chuyên tạo nội dung bán hàng trên Threads.

Thông tin sản phẩm:

Tên:
${title}

Mô tả:
${description || "Không có mô tả"}

Link:
${url || ""}

Hãy tạo chính xác 5 bài Threads khác nhau.

YÊU CẦU:
- Viết bằng tiếng Việt.
- Tự nhiên như người thật.
- Không nói quá hoặc bịa thông số.
- Không khẳng định sản phẩm có tác dụng nếu thông tin không cung cấp.
- Mỗi bài tối đa khoảng 400 ký tự.
- Có thể sử dụng emoji.
- Mỗi bài có cách mở đầu khác nhau.
- Phù hợp với nội dung affiliate.
- Không đưa link vào giữa bài.
- Chỉ trả về JSON.

Định dạng:

[
  {
    "caption": "..."
  },
  {
    "caption": "..."
  },
  {
    "caption": "..."
  },
  {
    "caption": "..."
  },
  {
    "caption": "..."
  }
]
`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
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
          ],
          generationConfig: {
            responseMimeType: "application/json"
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: data
      });
    }

    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return res.status(500).json({
        success: false,
        error: "Gemini không trả về nội dung."
      });
    }

    let posts;

    try {
      posts = JSON.parse(text);
    } catch {
      return res.status(500).json({
        success: false,
        error: "Gemini trả về JSON không hợp lệ.",
        raw: text
      });
    }

    return res.status(200).json({
      success: true,
      posts,
      images: images || []
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
