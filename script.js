// --- CẤU HÌNH BIẾN TOÀN CỤC ---
let quizData = [];
let currentIdx = 0;
let userAnswers = {};

// --- HÀM CHUYỂN ĐỔI FILE SANG BASE64 (Cho tính năng đọc ảnh) ---
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]); // Lấy phần data sau dấu phẩy
        reader.onerror = error => reject(error);
    });
}

// --- PHẦN 1: XỬ LÝ SỰ KIỆN NÚT BẤM ---
document.getElementById('process-btn').addEventListener('click', async () => {
    const fileInput = document.getElementById('file-upload');
    const loadingText = document.getElementById('loading-text');
    const btn = document.getElementById('process-btn');

    // 1. Kiểm tra đầu vào
    if (!fileInput.files.length) { 
        alert("⚠️ Vui lòng chọn file!"); 
        return; 
    }

    // 2. Hiệu ứng loading
    btn.disabled = true;
    btn.style.opacity = 0.5;
    loadingText.style.display = 'block';
    loadingText.innerText = "Hệ thống đang xử lý... Vui lòng chờ giây lát ⏳";

    try {
        const file = fileInput.files[0]; // Chỉ khai báo 1 lần tại đây
        let payload = {};

        // 3. Phân loại và xử lý file
        // Nếu là file Ảnh hoặc PDF -> Dùng chế độ Vision (đọc ảnh/scan)
        if (file.type.startsWith('image/') || file.name.endsWith('.pdf')) {
            const base64Data = await fileToBase64(file);
            payload = {
                fileData: base64Data,
                mimeType: file.type || 'application/pdf',
                isVisual: true // Cờ báo hiệu cho Backend biết đây là xử lý ảnh
            };
        } 
        // Nếu là file Word/Text/JSON -> Dùng chế độ Text
        else {
            let textContent = "";
            if (file.name.endsWith('.docx')) {
                textContent = await readDocxFile(file);
            } else {
                textContent = await readTextFile(file);
            }
            
            if (!textContent || textContent.trim().length < 10) {
                throw new Error("File không có nội dung text. Hãy thử tải lên dạng ảnh chụp hoặc PDF.");
            }
            
            payload = { 
                text: textContent, 
                isVisual: false 
            };
        }

        // 4. Gửi dữ liệu sang Backend
        const aiQuestions = await generateQuestionsWithGemini(payload);
        
        // 5. Xử lý kết quả trả về
        if (aiQuestions && aiQuestions.length > 0) {
            quizData = aiQuestions;
            // Ẩn màn hình chào, hiện màn hình làm bài
            document.getElementById('welcome-modal').classList.add('hidden');
            document.getElementById('main-ui').classList.remove('hidden');
            renderSidebar();
            loadQuestion(0);
        } else {
            throw new Error("AI không tìm thấy câu hỏi nào. Hãy kiểm tra lại file.");
        }

    } catch (error) {
        console.error("Lỗi chính:", error);
        alert("❌ LỖI: " + error.message);
    } finally {
        // Tắt loading dù thành công hay thất bại
        btn.disabled = false;
        btn.style.opacity = 1;
        loadingText.style.display = 'none';
    }
});

// --- PHẦN 2: GỌI API (Đã cập nhật nhận Payload) ---
async function generateQuestionsWithGemini(payload) {
    const response = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "Lỗi từ Server");
    }

    // Xử lý chuỗi JSON từ AI (loại bỏ markdown ```json nếu có)
    const rawText = data.candidates[0].content.parts[0].text;
    let cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    // Tìm cặp ngoặc vuông [] ngoài cùng
    const firstBracket = cleanJson.indexOf('[');
    const lastBracket = cleanJson.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1) {
        cleanJson = cleanJson.substring(firstBracket, lastBracket + 1);
    }

    try {
        return JSON.parse(cleanJson);
    } catch (e) {
        console.error("JSON lỗi:", cleanJson);
        throw new Error("AI trả về định dạng không đúng. Hãy thử lại!");
    }
}

// --- PHẦN 3: CÁC HÀM ĐỌC FILE VĂN BẢN (Giữ nguyên) ---
function readTextFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

async function readDocxFile(file) {
    if (typeof mammoth === 'undefined') {
        throw new Error("Chưa tải được thư viện Word. Hãy F5 lại trang.");
    }
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
    return result.value;
}

// --- PHẦN 4: LOGIC GIAO DIỆN & LÀM BÀI (Giữ nguyên logic cũ) ---

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

    // Khôi phục trạng thái nếu đã làm
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
}
