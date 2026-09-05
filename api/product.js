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

    const isShopee = hostname.includes("shopee.");

    // ==============================
    // LẤY TRANG SẢN PHẨM (cải thiện anti-bot)
    // ==============================

    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7,zh-CN;q=0.6",
      "Accept-Encoding": "gzip, deflate, br",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
      "Sec-Ch-Ua": '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"Windows"',
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
      "Referer": "https://www.google.com/"
    };

    // Thêm header riêng cho từng nền tảng
    if (isShopee) {
      headers["User-Agent"] =
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
      headers["Referer"] = "https://shopee.vn/";
    }

    if (isTaobao) {
      headers["User-Agent"] =
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";
      headers["Referer"] = "https://www.taobao.com/";
      headers["Accept-Language"] = "zh-CN,zh;q=0.9,en;q=0.8";
    }

    let response;
    try {
      response = await fetch(productUrl.href, {
        method: "GET",
        redirect: "follow",
        headers
      });
    } catch (fetchError) {
      return res.status(502).json({
        success: false,
        error: "Không thể kết nối đến trang sản phẩm: " + fetchError.message
      });
    }

    if (!response.ok) {
      // Trả về thông báo rõ ràng hơn
      let tip = "";
      if (response.status === 403) {
        tip = "Trang sản phẩm đang chặn bot (HTTP 403). Hãy thử:\n- Dùng link AliExpress thay vì Taobao\n- Hoặc nhập thủ công tên + mô tả + ảnh";
      } else if (response.status === 404) {
        tip = "Link sản phẩm không tồn tại hoặc đã bị xóa.";
      }

      return res.status(502).json({
        success: false,
        error: `Không thể lấy trang sản phẩm. HTTP ${response.status}`,
        tip,
        status: response.status
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
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (!titleMatch) return "";
      return decodeHtml(titleMatch[1].replace(/<[^>]+>/g, ""));
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

      if (image.startsWith("javascript:") || image.startsWith("data:")) return;
      if (!image.startsWith("http://") && !image.startsWith("https://")) return;

      const lower = image.toLowerCase();
      const blockedWords = [
        "logo", "taobao_logo", "tmall_logo", "default", "placeholder",
        "loading", "avatar", "icon", "favicon", "sprite", "seller",
        "shop_logo", "tb-icon", "shopee-logo"
      ];

      if (blockedWords.some(word => lower.includes(word))) return;
      if (!images.includes(image)) {
        images.push(image);
      }
    }

    // Meta images
    addImage(getMeta("og:image"));
    addImage(getMeta("og:image:url"));
    addImage(getMeta("twitter:image"));

    // Tìm ảnh trong HTML
    const imagePatterns = [
      /https?:\/\/[^"'\\<> ]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\\<> ]*)?/gi,
      /https?:\\\/\\\/[^"'\\<> ]+\.(?:jpg|jpeg|png|webp)(?:\\?[^"'\\<> ]*)?/gi,
      /https?:\/\/[^"'\\<> ]*(?:alicdn\.com|taobaocdn\.com|tbcdn\.cn|shopee\.|shp\.ee)[^"'\\<> ]+/gi,
      /https?:\\\/\\\/[^"'\\<> ]*(?:alicdn\.com|taobaocdn\.com|tbcdn\.cn|shopee\.|shp\.ee)[^"'\\<> ]+/gi
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

    // Tìm src / data-src
    const imgRegex =
      /<(?:img|source)[^>]+(?:src|data-src|data-original|data-lazy-src)=["']([^"']+)["']/gi;

    let match;
    while ((match = imgRegex.exec(html)) !== null) {
      let image = decodeHtml(match[1]);
      if (image.startsWith("//")) image = "https:" + image;
      addImage(image);
      if (images.length >= 20) break;
    }

    // JSON image fields
    const jsonImageRegex =
      /["'](?:picUrl|pic_url|imageUrl|image_url|imgUrl|img_url|image)["']\s*:\s*["']([^"']+)["']/gi;

    while ((match = jsonImageRegex.exec(html)) !== null) {
      let image = decodeHtml(match[1]);
      if (image.startsWith("//")) image = "https:" + image;
      addImage(image);
      if (images.length >= 20) break;
    }

    // Làm sạch URL ảnh
    const cleanedImages = [];
    for (let image of images) {
      try {
        image = image.replace(/\\u002F/g, "/").replace(/\\\//g, "/");
        const parsed = new URL(image);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
        if (!cleanedImages.includes(parsed.href)) {
          cleanedImages.push(parsed.href);
        }
      } catch {}
    }

    // ==============================
    // XỬ LÝ KHI BỊ CHẶN
    // ==============================
    if (cleanedImages.length === 0 && (isTaobao || isShopee)) {
      return res.status(200).json({
        success: false,
        source: isTaobao ? "taobao" : "shopee",
        error: isTaobao
          ? "Taobao đang chặn việc lấy dữ liệu. Hãy dùng link AliExpress hoặc nhập thủ công."
          : "Shopee đang chặn việc lấy dữ liệu. Hãy thử link khác hoặc nhập thủ công.",
        product: {
          url: productUrl.href,
          title: title || "Không lấy được tên sản phẩm",
          description,
          images: []
        }
      });
    }

    // ==============================
    // TÊN SẢN PHẨM
    // ==============================
    if (
      !title ||
      title.toLowerCase().includes("taobao") ||
      title.toLowerCase().includes("shopee") ||
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
        source: isTaobao ? "taobao" : isShopee ? "shopee" : hostname
      }
    });

  } catch (error) {
    console.error("PRODUCT API ERROR:", error);
    return res.status(500).json({
      success: false,
      error: error?.message || "Không thể lấy thông tin sản phẩm."
    });
  }
}
