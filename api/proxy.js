export default async function handler(req, res) {
    // 1. Cho phép CORS để tránh lỗi chặn truy cập từ trình duyệt
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const { text, fileData, mimeType, isVisual } = req.body;
        const apiKey = process.env.MY_API_KEY;
        
        // Kiểm tra API Key
        if (!apiKey) {
            return res.status(500).json({ error: "Server chưa cấu hình API Key (MY_API_KEY)" });
        }

        const MODEL_NAME = "gemini-1.5-flash"; 

        // Cấu hình Prompt
        let contents = [];
        const systemInstruction = `Bạn là một trợ lý giáo dục chuyên nghiệp. Nhiệm vụ của bạn là đọc nội dung đầu vào (văn bản hoặc hình ảnh tài liệu scan) và tạo ra các câu hỏi trắc nghiệm.
        
        YÊU CẦU QUAN TRỌNG:
        1. Output bắt buộc phải là một JSON Array hợp lệ.
        2. Không bọc trong Markdown (không dùng \`\`\`json).
        3. Nếu là hình ảnh, hãy cố gắng luận giải các chữ mờ hoặc chữ viết tay tiếng Việt chính xác nhất có thể.
        4. Cấu trúc JSON mẫu:
        [
            {
                "id": 1,
                "question": "Câu hỏi là gì?",
                "options": ["A. Đáp án 1", "B. Đáp án 2", "C. Đáp án 3", "D. Đáp án 4"],
                "answer": 0,
                "explanation": "Giải thích vì sao đúng."
            }
        ]`;

        if (isVisual) {
            // Trường hợp file ảnh/PDF Scan
            contents = [{
                parts: [
                    { text: systemInstruction },
                    { inline_data: { mime_type: mimeType, data: fileData } }
                ]
            }];
        } else {
            // Trường hợp Text thuần túy
            contents = [{
                parts: [{ text: `${systemInstruction}\n\n=== NỘI DUNG TÀI LIỆU ===\n${text}` }]
            }];
        }

        // Gọi Google API
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: contents,
                // Ép kiểu trả về là JSON để Frontend dễ đọc
                generationConfig: {
                    response_mime_type: "application/json"
                },
                // Tắt các bộ lọc an toàn để tránh chặn nhầm tài liệu học tập
                safetySettings: [
                    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                ]
            })
        });

        const data = await response.json();

        // Xử lý lỗi từ Google trả về
        if (data.error) {
            console.error("Gemini API Error Detail:", JSON.stringify(data.error, null, 2));
            return res.status(500).json({ error: data.error.message || "Lỗi từ Google API" });
        }

        // Kiểm tra xem có candidate nào không
        if (!data.candidates || data.candidates.length === 0) {
            return res.status(500).json({ error: "AI không trả về kết quả nào. Có thể tài liệu bị chặn hoặc không đọc được." });
        }

        return res.status(200).json(data);

    } catch (error) {
        console.error("Server Error:", error);
        return res.status(500).json({ error: error.message });
    }
}
