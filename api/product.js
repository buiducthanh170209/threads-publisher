export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  try {
    const { url } = req.body || {};

    if (!url) {
      return res.status(400).json({
        success: false,
        error: "Chưa nhập link sản phẩm."
      });
    }

    let productUrl;

    try {
      productUrl = new URL(url);
    } catch {
      return res.status(400).json({
        success: false,
        error: "Link sản phẩm không hợp lệ."
      });
    }

    const response = await fetch(productUrl.href, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150 Safari/537.36",
        "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8"
      }
    });

    if (!response.ok) {
      return res.status(502).json({
        success: false,
        error: `Không thể lấy trang sản phẩm. HTTP ${response.status}`
      });
    }

    const html = await response.text();

    function getMeta(property) {
      const regex = new RegExp(
        `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)["']`,
        "i"
      );

      const match = html.match(regex);

      if (match) {
        return match[1]
          .replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"')
          .trim();
      }

      return "";
    }

    function getTitle() {
      const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);

      if (!match) return "";

      return match[1]
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .trim();
    }

    const title =
      getMeta("og:title") ||
      getMeta("twitter:title") ||
      getTitle();

    const mainImage =
      getMeta("og:image") ||
      getMeta("twitter:image");

    const description =
      getMeta("og:description") ||
      getMeta("description");

    const images = [];

    if (mainImage) {
      images.push(mainImage);
    }

    // Tìm thêm một số ảnh tuyệt đối trong HTML
    const imageRegex =
      /https?:\/\/[^"'<> ]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'<> ]*)?/gi;

    const matches = html.match(imageRegex) || [];

    for (const image of matches) {
      if (!images.includes(image)) {
        images.push(image);
      }

      if (images.length >= 8) break;
    }

    return res.status(200).json({
      success: true,
      product: {
        url: productUrl.href,
        title: title || "Sản phẩm chưa có tên",
        description: description || "",
        images
      }
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
