export default async function handler(req, res) {
    // Chỉ chấp nhận method POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { text } = req.body;

    if (!text) {
        return res.status(400).json({ error: 'Thiếu nội dung văn bản (text)' });
    }

    // Lấy Key từ biến môi trường Vercel
    const apiKey = process.env.MY_API_KEY; 

    // --- SỬA LỖI 1: Dùng đúng tên Model chuẩn (1.5-flash) ---
    const MODEL_NAME = "gemini-2.5-flash";
    
    // --- SỬA LỖI 2: Tối ưu Prompt để đảm bảo đủ Output ---
    const prompt = `
        Bạn là trợ lý tạo đề thi trắc nghiệm chuyên nghiệp.
        Văn bản nguồn: """${text}""" 

        Nhiệm vụ: Tạo JSON danh sách câu hỏi trắc nghiệm từ văn bản trên.
        
        1. Nếu file đã có sẵn câu hỏi: Trích xuất và format lại đúng định dạng JSON.
        2. Nếu là file lý thuyết: 
           - Hãy tạo ra **30 câu hỏi trắc nghiệm** quan trọng nhất (Không tạo quá 30 câu để tránh lỗi quá tải).
           - Tập trung vào các ý chính, định nghĩa, số liệu quan trọng.
           - Phần giải thích phải ngắn gọn, súc tích (khoảng 1-2 câu).
        
        Yêu cầu output (JSON Array thuần túy, KHÔNG dùng Markdown \`\`\`json):
        [
            {
                "id": 1,
                "question": "Nội dung câu hỏi?",
                "options": ["A. Lựa chọn 1", "B. Lựa chọn 2", "C. Lựa chọn 3", "D. Lựa chọn 4"],
                "answer": 0,
                "explanation": "Giải thích ngắn gọn tại sao đúng."
            }
        ]
        - Ngôn ngữ: Tiếng Việt.
        - Đảm bảo JSON hợp lệ, không bị cắt cụt.
    `;

    // Hàm thử lại (Retry) để chống lỗi Overload
    async function fetchWithRetry(url, options, retries = 3, backoff = 2000) {
        try {
            const response = await fetch(url, options);
            if (response.status === 503 && retries > 0) {
                console.log(`Google API bận. Đang thử lại... (Còn ${retries} lần)`);
                await new Promise(r => setTimeout(r, backoff));
                return fetchWithRetry(url, options, retries - 1, backoff * 2);
            }
            return response;
        } catch (err) {
            if (retries > 0) {
                await new Promise(r => setTimeout(r, backoff));
                return fetchWithRetry(url, options, retries - 1, backoff * 2);
            }
            throw err;
        }
    }

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;
        
        const response = await fetchWithRetry(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
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
