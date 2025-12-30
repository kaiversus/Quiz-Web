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
    
    // Câu lệnh Prompt (Đã di chuyển từ Frontend sang đây để bảo mật quy trình)
    const prompt = `
        Bạn là trợ lý tạo đề thi trắc nghiệm.
        Văn bản nguồn: """${text}""" 

        Nhiệm vụ: Tạo JSON danh sách câu hỏi trắc nghiệm từ văn bản trên.
        Yêu cầu output (JSON Array thuần túy, KHÔNG dùng Markdown \`\`\`json):
        [
            {
                "id": 1,
                "question": "Câu hỏi?",
                "options": ["A", "B", "C", "D"],
                "answer": 0,
                "explanation": "Giải thích ngắn."
            }
        ]
        - Ngôn ngữ: Tiếng Việt.
        - Trong phần explanation, hãy tìm kiếm thông tin và tự điền vào phần giải thích chi tiết.
    `;

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const data = await response.json();

        if (data.error) {
            return res.status(500).json({ error: data.error.message });
        }

        // Trả nguyên kết quả từ Google về cho Frontend xử lý tiếp
        return res.status(200).json(data);

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}