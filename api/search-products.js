export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  try {
    const { keyword } = req.body || {};

    if (!keyword || !keyword.trim()) {
      return res.status(400).json({
        success: false,
        error: "Vui lòng nhập từ khóa sản phẩm."
      });
    }

    const q = keyword.trim();
    const encoded = encodeURIComponent(q);

    const links = {
      "1688": `https://s.1688.com/selloffer/offer_search.htm?keywords=${encoded}`,
      "Taobao": `https://s.taobao.com/search?q=${encoded}`
    };

    return res.status(200).json({
      success: true,
      keyword: q,

      products: [
        {
          platform: "1688",
          title: `Tìm "${q}" trên 1688`,
          url: links["1688"]
        },
        {
          platform: "Taobao",
          title: `Tìm "${q}" trên Taobao`,
          url: links["Taobao"]
        }
      ]
    });

  } catch (error) {
    console.error("SEARCH PRODUCTS ERROR:", error);

    return res.status(500).json({
      success: false,
      error: error.message || "Không thể tạo tìm kiếm."
    });
  }
}
