// // --- CẤU HÌNH API KEY TẠI ĐÂY ---
// const MY_API_KEY = "AIzaSyCi2vzJJ8ME9zs5BKuSKmICbfb8eiKobpU"; // Ví dụ: "AIzaSyD..."
// // --------------------------------

let quizData = [];
let currentIdx = 0;
let userAnswers = {};

// --- PHẦN 1: XỬ LÝ SỰ KIỆN NÚT BẤM ---

document.getElementById('process-btn').addEventListener('click', async () => {
    const fileInput = document.getElementById('file-upload');
    const loadingText = document.getElementById('loading-text');
    const btn = document.getElementById('process-btn');

    // Kiểm tra đầu vào
    // if (MY_API_KEY === "DÁN_KEY_CỦA_BẠN_VÀO_ĐÂY" || !MY_API_KEY) {
    //     alert("⚠️ Bạn chưa dán API Key vào trong file script.js!");
    //     return;
    // }
    
    if (!fileInput.files.length) { alert("⚠️ Vui lòng chọn file!"); return; }

    // Hiệu ứng loading
    btn.disabled = true;
    btn.style.opacity = 0.5;
    loadingText.style.display = 'block';
    loadingText.innerText = "Hệ thống đang xử lí, trong lúc đó thì bạn làm quả lọ đi nhé !!! -.-";

    try {
        const file = fileInput.files[0];
        let textContent = "";

        // 1. Đọc nội dung file
try {
        const file = fileInput.files[0];
        let payload = {};

        // Kiểm tra nếu là file ảnh hoặc PDF scan
        if (file.type.startsWith('image/') || file.name.endsWith('.pdf')) {
            const base64Data = await fileToBase64(file);
            payload = {
                fileData: base64Data,
                mimeType: file.type || 'application/pdf',
                isVisual: true // Đánh dấu để backend biết đây là dữ liệu hình ảnh
            };
        } else {
            // Xử lý file văn bản bình thường như cũ
            let textContent = "";
            if (file.name.endsWith('.docx')) {
                textContent = await readDocxFile(file);
            } else {
                textContent = await readTextFile(file);
            }
            payload = { text: textContent, isVisual: false };
        }

        // Gọi hàm gửi dữ liệu đã được cập nhật
        const aiQuestions = await generateQuestionsWithGeminiV2(payload);

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

async function readPdfFile(file) {
    if (typeof pdfjsLib === 'undefined') {
        throw new Error("Chưa tải được thư viện PDF. Hãy F5 lại trang.");
    }
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";
    const maxPages = Math.min(pdf.numPages, 15); 
    
    for (let i = 1; i <= maxPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(" ");
        fullText += pageText + "\n";
    }
    return fullText;
}

async function readDocxFile(file) {
    if (typeof mammoth === 'undefined') {
        throw new Error("Chưa tải được thư viện Word. Hãy F5 lại trang.");
    }
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
    return result.value;
}

// --- PHẦN 3: GỌI GEMINI API  ---

// --- PHẦN 3: GỌI VỀ BACKEND (Đã sửa đổi) ---

async function generateQuestionsWithGeminiV1(text) {
    // Gọi về server của chính mình (Vercel) thay vì gọi thẳng Google
    const response = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "Lỗi từ Server khi gọi AI");
    }

    // Server đã trả về đúng định dạng Google response, ta xử lý lấy JSON như cũ
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

// --- PHẦN 4: LOGIC GIAO DIỆN (Giữ nguyên) ---

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
    
    // Cập nhật active sidebar
    document.querySelectorAll('.q-circle').forEach(c => c.classList.remove('active'));
    const currentCircle = document.getElementById(`q-circle-${index}`);
    if(currentCircle) currentCircle.classList.add('active');

    const qData = quizData[index];
    const content = document.getElementById('question-content');
    
    // Tạo danh sách nút (chưa tô màu)
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

    // --- PHẦN MỚI: KHÔI PHỤC TRẠNG THÁI NẾU ĐÃ LÀM RỒI ---
    if (userAnswers.hasOwnProperty(index)) {
        const savedAnswer = userAnswers[index]; // Đáp án người dùng đã chọn trước đó
        const correctAns = qData.answer;        // Đáp án đúng của câu hỏi
        
        const feedback = document.getElementById('feedback');
        const explanationDiv = document.getElementById('explanation');
        const allBtns = document.querySelectorAll('.option-btn');

        // Disable tất cả nút
        allBtns.forEach(btn => btn.classList.add('disabled'));

        // Tô màu lại các nút
        // 1. Nếu chọn đúng:
        if (savedAnswer === correctAns) {
            document.getElementById(`btn-opt-${savedAnswer}`).classList.add('correct-answer');
            feedback.innerHTML = '<span style="color:var(--success-color)">Chính xác!</span>';
        } 
        // 2. Nếu chọn sai:
        else {
            document.getElementById(`btn-opt-${savedAnswer}`).classList.add('wrong-answer');
            document.getElementById(`btn-opt-${correctAns}`).classList.add('correct-answer'); // Hiện đáp án đúng
            feedback.innerHTML = '<span style="color:var(--error-color)">Sai rồi!</span>';
        }

        // Hiện lại giải thích
        if (qData.explanation) {
            explanationDiv.innerHTML = `<span class="explanation-title">Giải thích:</span> ${qData.explanation}`;
            explanationDiv.style.display = 'block';
        }
    }
}

function checkAnswer(selectedOptIndex, btnElement) {
    // Nếu câu này đã làm rồi thì không cho chọn lại (đề phòng lỗi)
    if (userAnswers.hasOwnProperty(currentIdx)) return;

    // 1. LƯU ĐÁP ÁN NGƯỜI DÙNG CHỌN
    userAnswers[currentIdx] = selectedOptIndex;

    const qData = quizData[currentIdx];
    const allBtns = document.querySelectorAll('.option-btn');
    const feedback = document.getElementById('feedback');
    const explanationDiv = document.getElementById('explanation'); 
    const circle = document.getElementById(`q-circle-${currentIdx}`);

    // Disable tất cả các nút
    allBtns.forEach(btn => btn.classList.add('disabled'));

    // Xử lý đúng/sai
    if (selectedOptIndex === qData.answer) {
        btnElement.classList.add('correct-answer');
        feedback.innerHTML = '<span style="color:var(--success-color)">Chính xác!</span>';
        
        // Cập nhật sidebar
        circle.classList.add('done-correct');
        circle.classList.remove('done-wrong');
        
        // Cập nhật điểm
        updateScore(true);
    } else {
        btnElement.classList.add('wrong-answer');
        // Hiện đáp án đúng
        allBtns[qData.answer].classList.add('correct-answer');
        feedback.innerHTML = '<span style="color:var(--error-color)">Sai rồi!</span>';
        
        // Cập nhật sidebar
        circle.classList.add('done-wrong');
        circle.classList.remove('done-correct');
        
        // Cập nhật điểm
        updateScore(false);
    }
    
    // Hiện giải thích
    if (qData.explanation) {
        explanationDiv.innerHTML = `<span class="explanation-title">Giải thích:</span> ${qData.explanation}`;
        explanationDiv.style.display = 'block';
    } else {
        explanationDiv.style.display = 'none';
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

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]); // Lấy phần data sau dấu phẩy
        reader.onerror = error => reject(error);
    });
}
