// --- CẤU HÌNH BIẾN TOÀN CỤC ---
let quizData = [];
let currentIdx = 0;
let userAnswers = {};

// --- HÀM NÉN VÀ XỬ LÝ ẢNH (QUAN TRỌNG) ---
// Giúp giảm dung lượng ảnh xuống để không bị lỗi "Request Entity Too Large"
function compressAndConvertToBase64(file) {
    return new Promise((resolve, reject) => {
        // 1. Nếu là PDF, không nén được, chuyển đổi luôn
        if (file.type === 'application/pdf') {
            if (file.size > 4 * 1024 * 1024) { // Giới hạn 4MB cho PDF
                reject(new Error("File PDF quá lớn (>4MB). Vercel miễn phí không xử lý được. Hãy cắt nhỏ file PDF hoặc dùng ảnh chụp."));
                return;
            }
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = error => reject(error);
            return;
        }

        // 2. Nếu là Ảnh, dùng Canvas để vẽ lại và nén
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Resize ảnh nếu cạnh lớn nhất > 1500px
                const MAX_DIMENSION = 1500;
                if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
                    if (width > height) {
                        height *= MAX_DIMENSION / width;
                        width = MAX_DIMENSION;
                    } else {
                        width *= MAX_DIMENSION / height;
                        height = MAX_DIMENSION;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Xuất ra Base64 với chất lượng JPEG 0.7 (giảm dung lượng đáng kể)
                const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                resolve(dataUrl.split(',')[1]);
            };
            img.onerror = (e) => reject(new Error("File ảnh bị lỗi không đọc được."));
        };
        reader.onerror = error => reject(error);
    });
}

// --- PHẦN 1: XỬ LÝ SỰ KIỆN NÚT BẤM ---
document.getElementById('process-btn').addEventListener('click', async () => {
    const fileInput = document.getElementById('file-upload');
    const loadingText = document.getElementById('loading-text');
    const btn = document.getElementById('process-btn');

    if (!fileInput.files.length) { 
        alert("⚠️ Vui lòng chọn file!"); 
        return; 
    }

    // Hiệu ứng loading
    btn.disabled = true;
    btn.style.opacity = 0.5;
    loadingText.style.display = 'block';
    loadingText.innerHTML = "Hệ thống đang làm việc, trong lúc đó thì bạn làm quả lọ đi nhé -.-";

    try {
        const file = fileInput.files[0];
        let payload = {};

        // === LOGIC XỬ LÝ FILE ===
        if (file.type.startsWith('image/') || file.type === 'application/pdf') {
            // Dùng hàm nén mới viết ở trên
            const base64Data = await compressAndConvertToBase64(file);
            
            payload = {
                fileData: base64Data,
                mimeType: file.type.startsWith('image/') ? 'image/jpeg' : 'application/pdf', // Ảnh luôn convert về JPEG
                isVisual: true 
            };
        } else {
            // Xử lý text (Word/Txt)
            let textContent = "";
            if (file.name.endsWith('.docx')) {
                textContent = await readDocxFile(file);
            } else {
                textContent = await readTextFile(file);
            }
            
            if (!textContent || textContent.trim().length < 10) {
                throw new Error("File không có nội dung chữ. Hãy thử chụp ảnh màn hình.");
            }
            payload = { text: textContent, isVisual: false };
        }

        // Gửi sang Backend
        const aiQuestions = await generateQuestionsWithGemini(payload);
        
        // Xử lý kết quả
        if (aiQuestions && aiQuestions.length > 0) {
            quizData = aiQuestions;
            document.getElementById('welcome-modal').classList.add('hidden');
            document.getElementById('main-ui').classList.remove('hidden');
            renderSidebar();
            loadQuestion(0);
        } else {
            throw new Error("AI không tìm thấy câu hỏi nào trong file này.");
        }

    } catch (error) {
        console.error("Lỗi:", error);
        // Hiển thị thông báo lỗi thân thiện hơn
        let msg = error.message;
        if (msg.includes("Request Entity Too Large") || msg.includes("Unexpected token 'R'")) {
            msg = "File quá nặng! Server miễn phí không tải nổi. Hãy thử ảnh/file khác nhẹ hơn (<4MB).";
        }
        alert("❌ LỖI: " + msg);
    } finally {
        btn.disabled = false;
        btn.style.opacity = 1;
        loadingText.style.display = 'none';
    }
});

// --- PHẦN 2: GỌI API (Đã tối ưu handle lỗi JSON) ---
async function generateQuestionsWithGemini(payload) {
    const response = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    const responseText = await response.text(); // Đọc text trước để check lỗi HTML

    // Nếu server trả về lỗi HTML (thường là 413, 504, 500)
    if (!response.ok) {
        if (responseText.includes("Too Large")) throw new Error("File quá lớn (Request Entity Too Large).");
        if (responseText.includes("Timeout")) throw new Error("Server xử lý quá lâu (Timeout).");
        try {
            const errJson = JSON.parse(responseText);
            throw new Error(errJson.error || "Lỗi Server");
        } catch {
            throw new Error(`Lỗi Server (${response.status}): ${responseText.substring(0, 50)}...`);
        }
    }

    try {
        const data = JSON.parse(responseText);
        const rawText = data.candidates[0].content.parts[0].text;
        let cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        
        const firstBracket = cleanJson.indexOf('[');
        const lastBracket = cleanJson.lastIndexOf(']');
        if (firstBracket !== -1 && lastBracket !== -1) {
            cleanJson = cleanJson.substring(firstBracket, lastBracket + 1);
        }
        return JSON.parse(cleanJson);
    } catch (e) {
        console.error("Parse Error:", e);
        console.log("Raw AI Response:", responseText);
        throw new Error("AI trả về dữ liệu lỗi. Hãy thử lại với ảnh rõ nét hơn.");
    }
}

// --- CÁC HÀM CŨ (GIỮ NGUYÊN) ---
function readTextFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

async function readDocxFile(file) {
    if (typeof mammoth === 'undefined') throw new Error("Chưa tải thư viện Word.");
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
    return result.value;
}

function renderSidebar() {
    const list = document.getElementById('question-list');
    list.innerHTML = '';
    quizData.forEach((_, index) => {
        const circle = document.createElement('div');
        circle.className = 'q-circle';
        circle.innerText = index + 1;
        circle.id = `q-circle-${index}`;
        circle.onclick = () => loadQuestion(index);
        list.appendChild(circle);
    });
}

function loadQuestion(index) {
    if (index < 0 || index >= quizData.length) return;
    currentIdx = index;
    document.getElementById('q-number').innerText = index + 1;
    document.querySelectorAll('.q-circle').forEach(c => c.classList.remove('active'));
    const currentCircle = document.getElementById(`q-circle-${index}`);
    if(currentCircle) currentCircle.classList.add('active');

    const qData = quizData[index];
    const content = document.getElementById('question-content');
    
    let optionsHtml = '';
    qData.options.forEach((opt, i) => {
        optionsHtml += `<button class="option-btn" id="btn-opt-${i}" onclick="checkAnswer(${i}, this)">${opt}</button>`;
    });

    content.innerHTML = `
        <div class="question-text">${qData.question}</div>
        <div class="options-list">${optionsHtml}</div>
        <div id="feedback" style="margin-top:15px; font-weight:bold;"></div>
        <div id="explanation" class="explanation-box"></div> 
    `;

    if (userAnswers.hasOwnProperty(index)) {
        const savedAnswer = userAnswers[index];
        const correctAns = qData.answer;
        const feedback = document.getElementById('feedback');
        const explanationDiv = document.getElementById('explanation');
        const allBtns = document.querySelectorAll('.option-btn');

        allBtns.forEach(btn => btn.classList.add('disabled'));

        if (savedAnswer === correctAns) {
            document.getElementById(`btn-opt-${savedAnswer}`).classList.add('correct-answer');
            feedback.innerHTML = '<span style="color:var(--success-color)">Chính xác!</span>';
        } else {
            document.getElementById(`btn-opt-${savedAnswer}`).classList.add('wrong-answer');
            document.getElementById(`btn-opt-${correctAns}`).classList.add('correct-answer');
            feedback.innerHTML = '<span style="color:var(--error-color)">Sai rồi!</span>';
        }

        if (qData.explanation) {
            explanationDiv.innerHTML = `<span class="explanation-title">Giải thích:</span> ${qData.explanation}`;
            explanationDiv.style.display = 'block';
        }
    }
}

function checkAnswer(selectedOptIndex, btnElement) {
    if (userAnswers.hasOwnProperty(currentIdx)) return;
    userAnswers[currentIdx] = selectedOptIndex;

    const qData = quizData[currentIdx];
    const allBtns = document.querySelectorAll('.option-btn');
    const feedback = document.getElementById('feedback');
    const explanationDiv = document.getElementById('explanation'); 
    const circle = document.getElementById(`q-circle-${currentIdx}`);

    allBtns.forEach(btn => btn.classList.add('disabled'));

    if (selectedOptIndex === qData.answer) {
        btnElement.classList.add('correct-answer');
        feedback.innerHTML = '<span style="color:var(--success-color)">Chính xác!</span>';
        circle.classList.add('done-correct');
        updateScore(true);
    } else {
        btnElement.classList.add('wrong-answer');
        allBtns[qData.answer].classList.add('correct-answer');
        feedback.innerHTML = '<span style="color:var(--error-color)">Sai rồi!</span>';
        circle.classList.add('done-wrong');
        updateScore(false);
    }
    
    if (qData.explanation) {
        explanationDiv.innerHTML = `<span class="explanation-title">Giải thích:</span> ${qData.explanation}`;
        explanationDiv.style.display = 'block';
    }
}

function changeQuestion(step) {
    loadQuestion(currentIdx + step);
}

let correctCount = 0;
let wrongCount = 0;
function updateScore(isCorrect) {
    if(isCorrect) correctCount++; else wrongCount++;
    document.getElementById('score-correct').innerText = correctCount;
    document.getElementById('score-wrong').innerText = wrongCount;
}

function closeResultModal() {
    document.getElementById('result-modal').classList.add('hidden');
}s
