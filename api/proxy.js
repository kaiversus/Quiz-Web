export default async function handler(req, res) {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') { res.status(200).end(); return; }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const { text, fileData, mimeType, isVisual } = req.body;
        const apiKey = process.env.MY_API_KEY;

        if (!apiKey) {
            return res.status(500).json({ error: "Server chưa cấu hình API Key (MY_API_KEY)" });
        }

        // ✅ Dùng gemini-1.5-flash: hỗ trợ system_instruction + JSON mode + vision
        const MODEL_NAME = "gemini-1.5-pro";

        // ✅ System instruction tách riêng, KHÔNG nhét vào contents
        const systemInstruction = {
            parts: [{
                text: `Bạn là trợ lý giáo dục chuyên nghiệp. Nhiệm vụ: đọc nội dung đầu vào và tạo câu hỏi trắc nghiệm.

QUY TẮC ĐẦU RA BẮT BUỘC:
- Chỉ trả về JSON Array thuần túy, KHÔNG có bất kỳ text nào khác
- KHÔNG dùng markdown, KHÔNG dùng backtick
- KHÔNG có dấu phẩy thừa ở phần tử cuối mảng
- Đảm bảo cú pháp JSON hoàn toàn hợp lệ

CẤU TRÚC JSON:
[
  {
    "id": 1,
    "question": "Nội dung câu hỏi?",
    "options": ["A. Đáp án 1", "B. Đáp án 2", "C. Đáp án 3", "D. Đáp án 4"],
    "answer": 0,
    "explanation": "Giải thích ngắn gọn tại sao đáp án đúng."
  }
]

GIẢI THÍCH CÁC TRƯỜNG:
- "id": số thứ tự nguyên, bắt đầu từ 1
- "question": câu hỏi rõ ràng, đầy đủ
- "options": mảng đúng 4 phần tử, bắt đầu bằng "A. ", "B. ", "C. ", "D. "
- "answer": chỉ số (0, 1, 2 hoặc 3) của đáp án đúng trong mảng options
- "explanation": giải thích ngắn gọn, chính xác

XỬ LÝ HÌNH ẢNH:
- Nếu chữ mờ hoặc viết tay tiếng Việt, luận giải chính xác nhất có thể
- Ưu tiên ngữ cảnh để đoán các từ không rõ`
            }]
        };

        // ✅ Contents chỉ chứa nội dung người dùng, KHÔNG chứa system instruction
        let contents = [];

        if (isVisual) {
            contents = [{
                role: "user",
                parts: [
                    { text: "Hãy tạo câu hỏi trắc nghiệm từ tài liệu/hình ảnh sau:" },
                    { inline_data: { mime_type: mimeType, data: fileData } }
                ]
            }];
        } else {
            contents = [{
                role: "user",
                parts: [{
                    text: `Hãy tạo câu hỏi trắc nghiệm từ tài liệu sau:\n\n=== NỘI DUNG TÀI LIỆU ===\n${text}`
                }]
            }];
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                // ✅ system_instruction là field riêng, không nằm trong contents
                system_instruction: systemInstruction,
                contents: contents,
                generationConfig: {
                    // ✅ Đúng key là "responseMimeType", không phải "response_mime_type"
                    responseMimeType: "application/json",
                    temperature: 0.2,       // Giảm hallucination
                    maxOutputTokens: 8192,
                },
                safetySettings: [
                    { category: "HARM_CATEGORY_HARASSMENT",        threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_HATE_SPEECH",        threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",  threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_DANGEROUS_CONTENT",  threshold: "BLOCK_NONE" }
                ]
            })
        });

        const data = await response.json();

        // Xử lý lỗi từ Google
        if (!response.ok || data.error) {
            const errMsg = data.error?.message || `HTTP ${response.status}`;
            console.error("Gemini API Error:", JSON.stringify(data.error, null, 2));
            return res.status(502).json({ error: `Lỗi từ Google API: ${errMsg}` });
        }

        // Kiểm tra candidates
        if (!data.candidates || data.candidates.length === 0) {
            const blockReason = data.promptFeedback?.blockReason || "Không rõ";
            return res.status(500).json({
                error: `AI không trả về kết quả. Lý do: ${blockReason}`
            });
        }

        // ✅ Parse + validate ngay tại server trước khi trả về client
        const rawText = data.candidates[0]?.content?.parts?.[0]?.text || "";

        let questions = [];
        try {
            let cleaned = rawText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
            const start = cleaned.indexOf('[');
            const end = cleaned.lastIndexOf(']');
            if (start === -1 || end === -1) throw new Error("Không tìm thấy JSON Array");
            questions = JSON.parse(cleaned.slice(start, end + 1));
        } catch (parseErr) {
            console.error("Parse Error:", parseErr.message);
            console.error("Raw AI text:", rawText.substring(0, 500));
            return res.status(500).json({
                error: `AI trả về dữ liệu không hợp lệ: ${parseErr.message}`,
                raw: rawText.substring(0, 300)
            });
        }

        // Validate từng câu hỏi
        const validQuestions = questions
            .map((q, i) => ({ ...q, id: i + 1 })) // Đánh lại id cho chắc
            .filter((q, i) => {
                const ok =
                    q.question?.trim() &&
                    Array.isArray(q.options) && q.options.length === 4 &&
                    typeof q.answer === 'number' && q.answer >= 0 && q.answer <= 3;
                if (!ok) console.warn(`⚠️ Câu #${i + 1} bị lỗi cấu trúc, bỏ qua.`);
                return ok;
            });

        console.log(`✅ Tạo thành công ${validQuestions.length}/${questions.length} câu hỏi`);

        return res.status(200).json({ questions: validQuestions });

    } catch (error) {
        console.error("Server Error:", error);
        return res.status(500).json({ error: error.message });
    }
}
