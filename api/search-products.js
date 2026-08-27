export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  try {
    const { keyword, page = 1, pageSize = 10 } = req.body || {};

    if (!keyword || !keyword.trim()) {
      return res.status(400).json({
        success: false,
        error: "Vui lòng nhập từ khóa sản phẩm."
      });
    }

    const apiKey = process.env.ONEBOUND_API_KEY;
    const apiSecret = process.env.ONEBOUND_API_SECRET || "";

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: "ONEBOUND_API_KEY chưa được cấu hình trên Vercel."
      });
    }

    const q = keyword.trim();

    /*
     * T1J là API tìm kiếm tổng hợp.
     * Theo tài liệu OneBound:
     * 1688 + Taobao + JD
     */

    const params = new URLSearchParams({
      key: apiKey,
      secret: apiSecret,
      q,
      page: String(page),
      page_size: String(Math.min(pageSize, 20)),
      lang: "cn",
      result_type: "json",
      cache: "yes"
    });

    const apiUrl =
      `https://api-gw.onebound.cn/t1j/item_search/?${params.toString()}`;

    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "Accept": "application/json"
      }
    });

    const text = await response.text();

    let data;

    try {
      data = JSON.parse(text);
    } catch {
      return res.status(502).json({
        success: false,
        error: "API sản phẩm trả về dữ liệu không hợp lệ.",
        raw: text.slice(0, 500)
      });
    }

    if (!response.ok) {
      return res.status(502).json({
        success: false,
        error: `API sản phẩm HTTP ${response.status}`,
        details: data
      });
    }

    /*
     * Một số API trả:
     * items
     * item
     * data.items
     * result.items
     */

    const rawItems =
      data?.items ||
      data?.item ||
      data?.data?.items ||
      data?.data?.item ||
      data?.result?.items ||
      [];

    const items = Array.isArray(rawItems)
      ? rawItems
      : [];

    function cleanImage(url) {
      if (!url) return "";

      let image = String(url).trim();

      if (image.startsWith("//")) {
        image = "https:" + image;
      }

      if (
        !image.startsWith("http://") &&
        !image.startsWith("https://")
      ) {
        return "";
      }

      return image;
    }

    function getTitle(item) {
      return (
        item.title ||
        item.name ||
        item.product_name ||
        item.productName ||
        ""
      ).trim();
    }

    function getImage(item) {
      return cleanImage(
        item.pic_url ||
        item.picUrl ||
        item.image ||
        item.image_url ||
        item.img ||
        item.thumbnail
      );
    }

    function getPrice(item) {
      return (
        item.price ||
        item.promotion_price ||
        item.sale_price ||
        item.min_price ||
        ""
      );
    }

    function getSales(item) {
      return (
        item.sales ||
        item.sale_num ||
        item.volume ||
        item.sold ||
        0
      );
    }

    function getShop(item) {
      return (
        item.seller_nick ||
        item.shop_name ||
        item.shopName ||
        item.seller ||
        ""
      );
    }

    function getUrl(item) {
      let url =
        item.detail_url ||
        item.detailUrl ||
        item.url ||
        item.product_url ||
        "";

      if (url && url.startsWith("//")) {
        url = "https:" + url;
      }

      return url;
    }

    function detectPlatform(item, url) {
      const value = JSON.stringify(item).toLowerCase() + " " +
        String(url).toLowerCase();

      if (
        value.includes("1688") ||
        value.includes("alibaba")
      ) {
        return "1688";
      }

      if (
        value.includes("taobao") ||
        value.includes("alicdn")
      ) {
        return "Taobao";
      }

      if (value.includes("tmall")) {
        return "Tmall";
      }

      if (
        value.includes("jd.com") ||
        value.includes("jd.hk")
      ) {
        return "JD";
      }

      return "Trung Quốc";
    }

    /*
     * Chuẩn hóa dữ liệu
     */

    const products = items
      .map((item, index) => {
        const title = getTitle(item);
        const image = getImage(item);
        const url = getUrl(item);

        return {
          id:
            item.num_iid ||
            item.item_id ||
            item.id ||
            `product-${index + 1}`,

          title,

          image,

          price: getPrice(item),

          sales: getSales(item),

          shop: getShop(item),

          url,

          platform: detectPlatform(item, url),

          raw: item
        };
      })
      .filter(product => {
        return (
          product.title &&
          product.image &&
          product.url
        );
      });

    /*
     * Chấm điểm sơ bộ sản phẩm
     * AI sẽ chấm điểm nâng cao ở bước sau.
     */

    const scoredProducts = products.map(product => {
      let score = 50;

      if (product.image) {
        score += 10;
      }

      if (product.shop) {
        score += 5;
      }

      if (product.sales) {
        const sales =
          Number(
            String(product.sales)
              .replace(/[^\d]/g, "")
          ) || 0;

        if (sales >= 1000) {
          score += 20;
        } else if (sales >= 100) {
          score += 12;
        } else if (sales >= 10) {
          score += 5;
        }
      }

      return {
        ...product,
        score: Math.min(score, 100)
      };
    });

    scoredProducts.sort(
      (a, b) => b.score - a.score
    );

    return res.status(200).json({
      success: true,

      keyword: q,

      total: scoredProducts.length,

      products: scoredProducts.slice(0, 20)
    });

  } catch (error) {
    console.error(
      "SEARCH PRODUCTS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        error?.message ||
        "Không thể tìm sản phẩm."
    });
  }
}
