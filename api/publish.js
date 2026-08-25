export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  try {
    const token = process.env.THREADS_ACCESS_TOKEN;

    if (!token) {
      return res.status(500).json({
        success: false,
        error: "THREADS_ACCESS_TOKEN chưa được cấu hình trên Vercel."
      });
    }

    const { text } = req.body || {};

    if (!text || !text.trim()) {
      return res.status(400).json({
        success: false,
        error: "Bạn chưa nhập nội dung."
      });
    }

    // 1. Tạo container
    const createBody = new URLSearchParams({
      media_type: "TEXT",
      text: text.trim(),
      access_token: token
    });

    const createResponse = await fetch(
      "https://graph.threads.net/v1.0/me/threads",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: createBody
      }
    );

    const createRaw = await createResponse.text();

    let createData;

    try {
      createData = JSON.parse(createRaw);
    } catch {
      return res.status(502).json({
        success: false,
        step: "create",
        error: "Threads trả về dữ liệu không phải JSON.",
        raw: createRaw.slice(0, 1000)
      });
    }

    if (!createResponse.ok || !createData.id) {
      return res.status(400).json({
        success: false,
        step: "create",
        error: createData
      });
    }

    const creationId = createData.id;

    // 2. Chờ container hoàn tất
    let statusData = null;

    for (let i = 0; i < 10; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const statusResponse = await fetch(
        `https://graph.threads.net/v1.0/${encodeURIComponent(
          creationId
        )}?fields=status&access_token=${encodeURIComponent(token)}`
      );

      const statusRaw = await statusResponse.text();

      try {
        statusData = JSON.parse(statusRaw);
      } catch {
        return res.status(502).json({
          success: false,
          step: "status",
          error: "Không đọc được phản hồi trạng thái từ Threads.",
          raw: statusRaw.slice(0, 1000)
        });
      }

      if (statusData.status === "FINISHED") {
        break;
      }

      if (
        statusData.status === "ERROR" ||
        statusData.status === "EXPIRED"
      ) {
        return res.status(400).json({
          success: false,
          step: "status",
          error: statusData
        });
      }
    }

    if (!statusData || statusData.status !== "FINISHED") {
      return res.status(408).json({
        success: false,
        step: "status",
        error: "Container chưa hoàn tất sau thời gian chờ.",
        creation_id: creationId,
        status: statusData
      });
    }

    // 3. Publish
    const publishBody = new URLSearchParams({
      creation_id: creationId,
      access_token: token
    });

    const publishResponse = await fetch(
      "https://graph.threads.net/v1.0/me/threads_publish",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: publishBody
      }
    );

    const publishRaw = await publishResponse.text();

    let publishData;

    try {
      publishData = JSON.parse(publishRaw);
    } catch {
      return res.status(502).json({
        success: false,
        step: "publish",
        error: "Threads trả về dữ liệu publish không phải JSON.",
        raw: publishRaw.slice(0, 1000)
      });
    }

    if (!publishResponse.ok || !publishData.id) {
      return res.status(400).json({
        success: false,
        step: "publish",
        error: publishData,
        creation_id: creationId
      });
    }

    return res.status(200).json({
      success: true,
      message: "Đăng Threads thành công!",
      creation_id: creationId,
      thread_id: publishData.id
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: error.message || "Lỗi máy chủ."
    });
  }
}
