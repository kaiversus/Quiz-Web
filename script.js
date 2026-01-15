let quizData = [];
let currentIdx = 0;
let userAnswers = {};

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
    loadingText.innerText = "Hệ thống đang xử lý... Vui lòng chờ giây lát.";

    try {
        const file = fileInput.files[0];
        let payload = {};

        // 1. Phân loại và xử lý file (Hỗ trợ file văn bản và file scan/ảnh)
        if (file.type.startsWith('image/') || file.name.endsWith('.pdf')) {
            // Nếu là ảnh hoặc PDF (Xử lý như file scan)
            const base64Data = await fileToBase64(file);
            payload = {
                fileData: base64Data,
                mimeType: file.type || 'application/pdf',
                isVisual: true
            };
        } else {
            // Xử lý file văn bản bình thường (.txt, .docx, .json)
            let textContent = "";
            if (file.name.endsWith('.docx')) {
                textContent = await readDocxFile(file);
            } else {
                textContent = await readTextFile(file);
            }
            payload = { 
                text: textContent, 
                isVisual: false 
            };
        }

        // 2. Gửi dữ liệu cho AI thông qua backend proxy
        const aiQuestions = await generateQuestionsWithGemini(payload);
        
        // 3. Xử lý kết quả trả về và cập nhật UI
        if (aiQuestions && aiQuestions.length > 0) {
            quizData = aiQuestions;
            // Vào giao diện làm bài
            document.getElementById('welcome-modal').classList.add('hidden');
            document.getElementById('main-ui').classList.remove('hidden');
            renderSidebar();
            loadQuestion(0);
        } else {
            throw new Error("AI không thể tạo câu hỏi từ file này. Hãy thử file khác.");
        }

    } catch (error) {
        console.error("Lỗi chính:", error);
        alert("❌ LỖI: " + error.message);
    } finally {
        btn.disabled = false;
        btn.style.opacity = 1;
        loadingText.style.display = 'none';
    }
});

// --- PHẦN 2: CÁC HÀM ĐỌC FILE ---

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

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]); 
        reader.onerror = error => reject(error);
    });
}

// --- PHẦN 3: GỌI VỀ BACKEND (Proxy Vercel) ---

async function generateQuestionsWithGemini(payload) {
    const response = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "Lỗi từ Server khi gọi AI");
    }

    // Xử lý lấy JSON từ phản hồi của Gemini
    const rawText = data.candidates[0].content.parts[0].text;
    let cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    const firstBracket = cleanJson.indexOf('[');
    const lastBracket = cleanJson.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1) {
        cleanJson = cleanJson.substring(firstBracket, lastBracket + 1);
    }

    try {
        return JSON.parse(cleanJson);
    } catch (e) {
        console.error("JSON lỗi:", cleanJson);
        throw new Error("Lỗi định dạng JSON từ AI. Hãy thử lại!");
    }
}

// --- PHẦN 4: LOGIC GIAO DIỆN ---

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
