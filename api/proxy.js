export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { text, fileData, mimeType, isVisual } = req.body;
    const apiKey = process.env.MY_API_KEY;
    const MODEL_NAME = "gemini-1.5-flash"; // Dùng 1.5 Flash vì nó xử lý ảnh rất nhanh và rẻ

    let contents = [];
    const promptText = `Nhiệm vụ: Tạo JSON danh sách câu hỏi trắc nghiệm từ nội dung được cung cấp. 
    Nếu là hình ảnh, hãy đọc kỹ chữ trong ảnh. 
    Yêu cầu output (JSON Array thuần túy):
    [
        {
            "id": 1,
            "question": "Nội dung câu hỏi?",
            "options": ["A. Lựa chọn 1", "B. Lựa chọn 2", "C. Lựa chọn 3", "D. Lựa chọn 4"],
            "answer": 0,
            "explanation": "Giải thích ngắn gọn."
        }
    ]`;

    if (isVisual) {
        // Gửi nội dung kèm hình ảnh/PDF cho Gemini
        contents = [{
            parts: [
                { text: promptText },
                { inline_data: { mime_type: mimeType, data: fileData } }
            ]
        }];
    } else {
        // Gửi text thuần túy
        contents = [{
            parts: [{ text: promptText + `\n\nVăn bản nguồn: """${text}"""` }]
        }];
    }

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents })
        });

        const data = await response.json();

        if (data.error) {
            console.error("Gemini API Error:", data.error);
            return res.status(500).json({ error: data.error.message || "Lỗi từ Google API" });
        }

        return res.status(200).json(data);

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
