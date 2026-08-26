export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  try {
    const {
      product,
      images = [],
      count = 5
    } = req.body || {};

    // =========================
    // KIỂM TRA API KEY
    // =========================

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: "GEMINI_API_KEY chưa được cấu hình."
      });
    }

    // =========================
    // KIỂM TRA DỮ LIỆU
    // =========================

    if (!product) {
      return res.status(400).json({
        success: false,
        error: "Thiếu thông tin sản phẩm."
      });
    }

    // =========================
    // MODEL
    // =========================

    const model = "gemini-2.5-flash";

    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    // =========================
    // PROMPT
    // =========================

    const prompt = `
Bạn là AI chuyên viết nội dung bán hàng trên Threads.

Hãy dựa vào thông tin sản phẩm dưới đây để tạo ${count} bài đăng Threads.

THÔNG TIN SẢN PHẨM:
${JSON.stringify(product, null, 2)}

ẢNH SẢN PHẨM:
${JSON.stringify(images, null, 2)}

YÊU CẦU:

1. Viết bằng tiếng Việt tự nhiên.
2. Mỗi bài có cách viết khác nhau.
3. Không được viết quá dài.
4. Có hook ngay câu đầu.
5. Tập trung vào lợi ích sản phẩm.
6. Có CTA nhẹ nhàng.
7. Không spam hashtag.
8. Không bịa thông tin mà sản phẩm không có.
9. Không đánh số trong nội dung bài.
10. Trả về đúng JSON.

FORMAT BẮT BUỘC:

{
  "posts": [
    "Bài viết 1",
    "Bài viết 2",
    "Bài viết 3",
    "Bài viết 4",
    "Bài viết 5"
  ]
}
`;

    // =========================
    // GỌI GEMINI + RETRY 503
    // =========================

    const MAX_RETRIES = 4;

    let lastError = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(endpoint, {
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
            ],

            generationConfig: {
              temperature: 0.9,
              maxOutputTokens: 2500,

              responseMimeType: "application/json"
            }
          })
        });

        // =========================
        // THÀNH CÔNG
        // =========================

        if (response.ok) {
          const data = await response.json();

          const text =
            data?.candidates?.[0]?.content?.parts?.[0]?.text;

          if (!text) {
            throw new Error(
              "Gemini không trả về nội dung."
            );
          }

          // =========================
          // PARSE JSON
          // =========================

          let result;

          try {
            result = JSON.parse(text);
          } catch {
            // Gemini đôi khi trả markdown
            const cleaned = text
              .replace(/```json/gi, "")
              .replace(/```/g, "")
              .trim();

            result = JSON.parse(cleaned);
          }

          if (
            !result.posts ||
            !Array.isArray(result.posts)
          ) {
            throw new Error(
              "Gemini không trả về danh sách bài viết hợp lệ."
            );
          }

          return res.status(200).json({
            success: true,

            posts: result.posts.slice(0, count),

            attempts: attempt
          });
        }

        // =========================
        // LỖI API
        // =========================

        let errorData = {};

        try {
          errorData = await response.json();
        } catch {
          errorData = {};
        }

        const message =
          errorData?.error?.message ||
          `Gemini HTTP ${response.status}`;

        lastError = {
          status: response.status,
          message
        };

        // =========================
        // CHỈ RETRY LỖI 503
        // =========================

        if (response.status !== 503) {
          return res.status(response.status).json({
            success: false,
            error: {
              status: response.status,
              message
            }
          });
        }

        // =========================
        // CHỜ TRƯỚC KHI THỬ LẠI
        // =========================

        if (attempt < MAX_RETRIES) {
          const delay =
            Math.min(
              1500 * Math.pow(2, attempt - 1),
              10000
            );

          console.log(
            `Gemini 503. Retry ${attempt + 1}/${MAX_RETRIES} sau ${delay}ms`
          );

          await new Promise(resolve =>
            setTimeout(resolve, delay)
          );
        }

      } catch (error) {
        lastError = {
          message:
            error?.message ||
            "Unknown error"
        };

        // Retry lỗi mạng
        if (attempt < MAX_RETRIES) {
          const delay =
            Math.min(
              1500 * Math.pow(2, attempt - 1),
              10000
            );

          await new Promise(resolve =>
            setTimeout(resolve, delay)
          );
        }
      }
    }

    // =========================
    // HẾT RETRY
    // =========================

    return res.status(503).json({
      success: false,

      error: {
        status: 503,

        message:
          "Gemini đang quá tải. Hệ thống đã tự thử lại " +
          MAX_RETRIES +
          " lần nhưng vẫn chưa thành công.",

        lastError
      }
    });

  } catch (error) {
    console.error(
      "GENERATE PRODUCTS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,

      error:
        error?.message ||
        "Không thể tạo bài Threads."
    });
  }
}
