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
    // HEADERS
    // ==============================
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
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

    if (isShopee) {
      headers["User-Agent"] =
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
      headers["Referer"] = "https://shopee.vn/";
    }

    if (isTaobao) {
      headers["User-Agent"] =
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";
      headers["Referer"] = "https://www.taobao.com/";
      headers["Accept-Language"] = "zh-CN,zh;q=0.9";
    }

    let response;
    try {
      response = await fetch(productUrl.href, {
        method: "GET",
        redirect: "follow",
        headers
      });
    } catch (err) {
      return res.status(502).json({
        success: false,
        error: "Không thể kết nối đến trang sản phẩm: " + err.message
      });
    }

    if (!response.ok) {
      return res.status(502).json({
        success: false,
        error: `Không thể lấy trang sản phẩm. HTTP ${response.status}`,
        tip:
          response.status === 403
            ? "Trang đang chặn bot. Nên dùng AliExpress hoặc nhập thủ công."
            : null
      });
    }

    const html = await response.text();

    // ==============================
    // HELPERS
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
        if (match?.[1]) return decodeHtml(match[1]);
      }
      return "";
    }

    // ==============================
    // TITLE & DESCRIPTION
    // ==============================
    let title =
      getMeta("og:title") ||
      getMeta("twitter:title") ||
      (() => {
        const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        return m ? decodeHtml(m[1].replace(/<[^>]+>/g, "")) : "";
      })();

    let description =
      getMeta("og:description") || getMeta("description") || "";

    // ==============================
    // IMAGE FILTER (loại logo mạnh)
    // ==============================
    const images = [];
    const blocked = [
      "logo", "shopee", "taobao_logo", "tmall_logo", "default",
      "placeholder", "loading", "avatar", "icon", "favicon",
      "sprite", "seller", "shop_logo", "tb-icon", "shopee-logo",
      "cf.shopee", "down-bfs", "susercontent.com/file"
    ];

    function addImage(image) {
      if (!image) return;
      image = decodeHtml(image);

      if (image.startsWith("javascript:") || image.startsWith("data:")) return;
      if (!image.startsWith("http://") && !image.startsWith("https://")) {
        if (image.startsWith("//")) image = "https:" + image;
        else return;
      }

      const lower = image.toLowerCase();
      if (blocked.some(w => lower.includes(w))) return;

      // Chỉ nhận ảnh thật (có đuôi hoặc cdn sản phẩm)
      const isRealImage =
        lower.includes(".jpg") ||
        lower.includes(".jpeg") ||
        lower.includes(".png") ||
        lower.includes(".webp") ||
        lower.includes("alicdn") ||
        lower.includes("taobaocdn") ||
        lower.includes("susercontent.com") ||
        lower.includes("cf.shopee.vn");

      if (!isRealImage) return;
      if (!images.includes(image)) images.push(image);
    }

    // Meta
    addImage(getMeta("og:image"));
    addImage(getMeta("og:image:url"));
    addImage(getMeta("twitter:image"));

    // Các pattern ảnh
    const imagePatterns = [
      /https?:\/\/[^"'\\<> ]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\\<> ]*)?/gi,
      /https?:\\\/\\\/[^"'\\<> ]+\.(?:jpg|jpeg|png|webp)(?:\\?[^"'\\<> ]*)?/gi,
      /https?:\/\/[^"'\\<> ]*(?:alicdn\.com|taobaocdn\.com|susercontent\.com|cf\.shopee)[^"'\\<> ]+/gi
    ];

    for (const regex of imagePatterns) {
      const matches = html.match(regex) || [];
      for (let img of matches) {
        img = img
          .replace(/\\\//g, "/")
          .replace(/\\u002F/g, "/")
          .replace(/\\u003A/g, ":")
          .replace(/\\u0026/g, "&");
        addImage(img);
        if (images.length >= 15) break;
      }
      if (images.length >= 15) break;
    }

    // img tag
    const imgRegex =
      /<(?:img|source)[^>]+(?:src|data-src|data-original|data-lazy-src)=["']([^"']+)["']/gi;
    let match;
    while ((match = imgRegex.exec(html)) !== null) {
      let img = decodeHtml(match[1]);
      if (img.startsWith("//")) img = "https:" + img;
      addImage(img);
      if (images.length >= 15) break;
    }

    // JSON fields
    const jsonImageRegex =
      /["'](?:picUrl|pic_url|imageUrl|image_url|imgUrl|img_url|image|images)["']\s*:\s*["']([^"']+)["']/gi;
    while ((match = jsonImageRegex.exec(html)) !== null) {
      let img = decodeHtml(match[1]);
      if (img.startsWith("//")) img = "https:" + img;
      addImage(img);
      if (images.length >= 15) break;
    }

    // Thử lấy từ __NEXT_DATA__ (Shopee hay dùng)
    try {
      const nextDataMatch = html.match(
        /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i
      );
      if (nextDataMatch) {
        const nextData = JSON.parse(nextDataMatch[1]);
        const item =
          nextData?.props?.pageProps?.initialState?.item?.product ||
          nextData?.props?.pageProps?.product ||
          nextData?.props?.initialProps?.pageProps?.product;

        if (item) {
          if (item.name || item.title) title = item.name || item.title;
          if (item.description) description = item.description;

          const imgs =
            item.images ||
            item.image ||
            item.media ||
            item.item?.images ||
            [];
          if (Array.isArray(imgs)) {
            imgs.forEach(img => {
              if (typeof img === "string") addImage(img);
              else if (img?.url) addImage(img.url);
            });
          }
        }
      }
    } catch (e) {
      // bỏ qua nếu parse lỗi
    }

    // Làm sạch
    const cleanedImages = [];
    for (let img of images) {
      try {
        const parsed = new URL(img.replace(/\\u002F/g, "/").replace(/\\\//g, "/"));
        if (
          (parsed.protocol === "http:" || parsed.protocol === "https:") &&
          !cleanedImages.includes(parsed.href)
        ) {
          cleanedImages.push(parsed.href);
        }
      } catch {}
    }

    // ==============================
    // KẾT QUẢ
    // ==============================
    const hasRealData =
      cleanedImages.length > 0 &&
      title &&
      !title.toLowerCase().includes("shopee") &&
      !title.toLowerCase().includes("taobao") &&
      title.length > 5;

    if (!hasRealData && (isShopee || isTaobao)) {
      return res.status(200).json({
        success: false,
        source: isShopee ? "shopee" : "taobao",
        error: isShopee
          ? "Shopee đang chặn lấy dữ liệu thật (chỉ trả logo). Hãy nhập thủ công tên + mô tả + ảnh."
          : "Taobao đang chặn lấy dữ liệu. Hãy dùng link AliExpress hoặc nhập thủ công.",
        product: {
          url: productUrl.href,
          title: title || "Sản phẩm từ " + hostname,
          description: description || "",
          images: cleanedImages
        }
      });
    }

    if (
      !title ||
      title.toLowerCase().includes("shopee") ||
      title.toLowerCase().includes("taobao") ||
      title.length < 3
    ) {
      title = "Sản phẩm từ " + hostname;
    }

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
