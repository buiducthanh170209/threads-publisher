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

    const hostname = productUrl.hostname.toLowerCase();

    const isTaobao =
      hostname.includes("taobao.com") ||
      hostname.includes("tmall.com") ||
      hostname.includes("tmall.hk");

    // ==============================
    // LẤY TRANG SẢN PHẨM
    // ==============================

    const response = await fetch(productUrl.href, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",

        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",

        "Accept-Language":
          "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",

        "Cache-Control": "no-cache",

        "Pragma": "no-cache"
      }
    });

    if (!response.ok) {
      return res.status(502).json({
        success: false,
        error: `Không thể lấy trang sản phẩm. HTTP ${response.status}`
      });
    }

    const html = await response.text();

    // ==============================
    // GIẢI MÃ HTML
    // ==============================

    function decodeHtml(value) {
      if (!value) return "";

      return value
        .replace(/\\u002F/g, "/")
        .replace(/\\u003A/g, ":")
        .replace(/\\u0026/g, "&")
        .replace(/\\u003F/g, "?")
        .replace(/\\u003D/g, "=")
        .replace(/\\u0022/g, '"')
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/gi, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .trim();
    }

    // ==============================
    // LẤY META
    // ==============================

    function getMeta(name) {
      const patterns = [
        new RegExp(
          `<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["']`,
          "i"
        ),

        new RegExp(
          `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["']`,
          "i"
        )
      ];

      for (const regex of patterns) {
        const match = html.match(regex);

        if (match && match[1]) {
          return decodeHtml(match[1]);
        }
      }

      return "";
    }

    // ==============================
    // TITLE
    // ==============================

    function getTitle() {
      const titleMatch = html.match(
        /<title[^>]*>([\s\S]*?)<\/title>/i
      );

      if (!titleMatch) return "";

      return decodeHtml(
        titleMatch[1]
          .replace(/<[^>]+>/g, "")
      );
    }

    let title =
      getMeta("og:title") ||
      getMeta("twitter:title") ||
      getTitle();

    // ==============================
    // DESCRIPTION
    // ==============================

    let description =
      getMeta("og:description") ||
      getMeta("description") ||
      "";

    // ==============================
    // LẤY IMAGE
    // ==============================

    const images = [];

    function addImage(image) {
      if (!image) return;

      image = decodeHtml(image);

      // Bỏ javascript
      if (
        image.startsWith("javascript:") ||
        image.startsWith("data:")
      ) {
        return;
      }

      // Chỉ nhận http/https
      if (
        !image.startsWith("http://") &&
        !image.startsWith("https://")
      ) {
        return;
      }

      // ==============================
      // LOẠI ẢNH LOGO / PLACEHOLDER
      // ==============================

      const lower = image.toLowerCase();

      const blockedWords = [
        "logo",
        "taobao_logo",
        "tmall_logo",
        "default",
        "placeholder",
        "loading",
        "avatar",
        "icon",
        "favicon",
        "sprite",
        "seller",
        "shop_logo",
        "tb-icon"
      ];

      const isBlocked = blockedWords.some(word =>
        lower.includes(word)
      );

      if (isBlocked) return;

      // Không thêm trùng
      if (!images.includes(image)) {
        images.push(image);
      }
    }

    // Meta images
    addImage(getMeta("og:image"));
    addImage(getMeta("og:image:url"));
    addImage(getMeta("twitter:image"));

    // ==============================
    // TÌM ẢNH TRONG HTML
    // ==============================

    const imagePatterns = [
      // URL bình thường
      /https?:\/\/[^"'\\<> ]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\\<> ]*)?/gi,

      // URL trong JSON escaped
      /https?:\\\/\\\/[^"'\\<> ]+\.(?:jpg|jpeg|png|webp)(?:\\?[^"'\\<> ]*)?/gi,

      // Taobao CDN
      /https?:\/\/[^"'\\<> ]*(?:alicdn\.com|taobaocdn\.com|tbcdn\.cn)[^"'\\<> ]+/gi,

      // HTTPS escaped
      /https?:\\\/\\\/[^"'\\<> ]*(?:alicdn\.com|taobaocdn\.com|tbcdn\.cn)[^"'\\<> ]+/gi
    ];

    for (const regex of imagePatterns) {
      const matches = html.match(regex) || [];

      for (let image of matches) {
        image = image
          .replace(/\\\//g, "/")
          .replace(/\\u002F/g, "/")
          .replace(/\\u003A/g, ":")
          .replace(/\\u0026/g, "&");

        addImage(image);

        if (images.length >= 20) break;
      }

      if (images.length >= 20) break;
    }

    // ==============================
    // TÌM src / data-src CỦA IMG
    // ==============================

    const imgRegex =
      /<(?:img|source)[^>]+(?:src|data-src|data-original|data-lazy-src)=["']([^"']+)["']/gi;

    let match;

    while ((match = imgRegex.exec(html)) !== null) {
      let image = decodeHtml(match[1]);

      if (image.startsWith("//")) {
        image = "https:" + image;
      }

      addImage(image);

      if (images.length >= 20) break;
    }

    // ==============================
    // TÌM ẢNH TAOBAO BẰNG JSON
    // ==============================

    const jsonImageRegex =
      /["'](?:picUrl|pic_url|imageUrl|image_url|imgUrl|img_url)["']\s*:\s*["']([^"']+)["']/gi;

    while ((match = jsonImageRegex.exec(html)) !== null) {
      let image = decodeHtml(match[1]);

      if (image.startsWith("//")) {
        image = "https:" + image;
      }

      addImage(image);

      if (images.length >= 20) break;
    }

    // ==============================
    // LÀM SẠCH URL ẢNH
    // ==============================

    const cleanedImages = [];

    for (let image of images) {
      try {
        image = image
          .replace(/\\u002F/g, "/")
          .replace(/\\\//g, "/");

        const parsed = new URL(image);

        if (
          parsed.protocol !== "http:" &&
          parsed.protocol !== "https:"
        ) {
          continue;
        }

        // Ưu tiên ảnh HTTPS
        image = parsed.href;

        if (!cleanedImages.includes(image)) {
          cleanedImages.push(image);
        }
      } catch {
        // Bỏ URL lỗi
      }
    }

    // ==============================
    // KIỂM TRA TAOBAO
    // ==============================

    if (isTaobao) {
      // Nếu chỉ lấy được ảnh logo / không có ảnh
      // thì báo rõ thay vì đưa logo về frontend

      if (cleanedImages.length === 0) {
        return res.status(200).json({
          success: false,
          source: "taobao",
          error:
            "Taobao đang chặn việc lấy ảnh trực tiếp. Hãy thử dùng link sản phẩm đầy đủ dạng item.taobao.com hoặc dùng API trung gian.",
          product: {
            url: productUrl.href,
            title: title || "Không lấy được tên sản phẩm",
            description,
            images: []
          }
        });
      }
    }

    // ==============================
    // TÊN SẢN PHẨM
    // ==============================

    if (
      !title ||
      title.toLowerCase().includes("taobao") ||
      title.length < 3
    ) {
      title = "Sản phẩm từ " + hostname;
    }

    // ==============================
    // TRẢ KẾT QUẢ
    // ==============================

    return res.status(200).json({
      success: true,

      product: {
        url: productUrl.href,

        title,

        description,

        images: cleanedImages.slice(0, 12),

        source: isTaobao
          ? "taobao"
          : hostname
      }
    });

  } catch (error) {
    console.error("PRODUCT API ERROR:", error);

    return res.status(500).json({
      success: false,
      error:
        error?.message ||
        "Không thể lấy thông tin sản phẩm."
    });
  }
}
