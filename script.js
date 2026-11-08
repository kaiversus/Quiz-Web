// // --- CẤU HÌNH API KEY TẠI ĐÂY ---
// const MY_API_KEY = "AIzaSyCi2vzJJ8ME9zs5BKuSKmICbfb8eiKobpU"; // Ví dụ: "AIzaSyD..."
// // --------------------------------

let sourceQuestions = [];
let quizData = [];
let currentIdx = 0;
let userAnswers = {};
let roundNumber = 0;
let correctCount = 0;
let wrongCount = 0;
let shuffleQuestions = true;
let shuffleOptions = true;
let roundFinished = false;

document.getElementById('show-result-btn').addEventListener('click', showRoundResult);
document.getElementById('finish-round-btn').addEventListener('click', showRoundResult);
document.getElementById('review-btn').addEventListener('click', () => {
    document.getElementById('result-modal').classList.add('hidden');
});
document.getElementById('next-round-btn').addEventListener('click', () => {
    const retryQuestions = quizData
        .filter((question, index) => userAnswers[index] !== question.answer)
        .map(question => question.sourceIndex);
    if (roundFinished && retryQuestions.length) startRound(retryQuestions);
});
document.getElementById('restart-btn').addEventListener('click', () => {
    roundNumber = 0;
    startRound(sourceQuestions.map((_, index) => index));
});

function shuffle(items) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

function startRound(sourceIndexes) {
    const indexes = shuffleQuestions ? shuffle(sourceIndexes) : [...sourceIndexes];
    quizData = indexes.map(sourceIndex => {
        const original = sourceQuestions[sourceIndex];
        const options = original.options.map((text, index) => ({ text, index }));
        const orderedOptions = shuffleOptions ? shuffle(options) : options;
        return {
            sourceIndex,
            question: original.question,
            explanation: original.explanation,
            options: orderedOptions.map(option => option.text),
            answer: orderedOptions.findIndex(option => option.index === original.answer)
        };
    });
    roundNumber++;
    currentIdx = 0;
    userAnswers = {};
    correctCount = 0;
    wrongCount = 0;
    roundFinished = false;
    document.getElementById('round-number').textContent = roundNumber;
    document.getElementById('sidebar-round').textContent = roundNumber;
    document.getElementById('round-total').textContent = quizData.length;
    document.getElementById('score-correct').textContent = '0';
    document.getElementById('score-wrong').textContent = '0';
    document.getElementById('show-result-btn').classList.add('hidden');
    document.getElementById('finish-round-btn').classList.remove('hidden');
    document.getElementById('result-modal').classList.add('hidden');
    renderSidebar();
    loadQuestion(0);
}

function showRoundResult() {
    if (!quizData.length) return;
    roundFinished = true;
    const unansweredCount = quizData.length - correctCount - wrongCount;
    const finished = wrongCount === 0 && unansweredCount === 0;
    document.getElementById('result-title').textContent = finished ? '🎉 Đã trả lời đúng tất cả!' : `Kết quả lượt ${roundNumber}`;
    document.getElementById('result-message').textContent = finished
        ? `Bạn đã hoàn thành sau ${roundNumber} lượt.`
        : `Lượt tiếp theo gồm ${wrongCount} câu sai và ${unansweredCount} câu chưa làm.`;
    document.getElementById('final-correct').textContent = `${correctCount}/${quizData.length}`;
    document.getElementById('final-wrong').textContent = wrongCount;
    document.getElementById('final-unanswered').textContent = unansweredCount;
    document.getElementById('next-round-btn').classList.toggle('hidden', finished);
    document.getElementById('restart-btn').classList.toggle('hidden', !finished);
    document.getElementById('finish-round-btn').classList.add('hidden');
    document.getElementById('show-result-btn').classList.remove('hidden');
    document.getElementById('result-modal').classList.remove('hidden');
}

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
            if (file.name.endsWith('.pdf')) {
                textContent = await readPdfFile(file);
            } else if (file.name.endsWith('.docx')) {
                textContent = await readDocxFile(file);
            } else {
                textContent = await readTextFile(file);
            }
        } catch (readErr) {
            console.error(readErr);
            throw new Error("Lỗi đọc file. Hãy thử file khác (Word/Txt).");
        }

        if (!textContent || textContent.trim().length < 10) {
            throw new Error("📄 File rỗng hoặc file ảnh scan không lấy được chữ.");
        }

        console.log("Đã đọc được " + textContent.length + " ký tự.");

        // 2. Gửi text cho AI xử lý (Dùng Key đã dán cứng)
        const aiQuestions = await generateQuestionsWithGeminiV1(textContent);
        
        if (aiQuestions && aiQuestions.length > 0) {
            if (!aiQuestions.every(question =>
                typeof question.question === 'string' &&
                Array.isArray(question.options) && question.options.length >= 2 &&
                question.options.every(option => typeof option === 'string') &&
                Number.isInteger(question.answer) &&
                question.answer >= 0 && question.answer < question.options.length
            )) {
                throw new Error('Dữ liệu câu hỏi không hợp lệ. Hãy thử lại.');
            }
            sourceQuestions = aiQuestions;
            shuffleQuestions = document.getElementById('shuffle-questions').checked;
            shuffleOptions = document.getElementById('shuffle-options').checked;
            roundNumber = 0;
            // 3. Vào giao diện làm bài
            document.getElementById('welcome-modal').classList.add('hidden');
            document.getElementById('main-ui').classList.remove('hidden');
            startRound(sourceQuestions.map((_, index) => index));
        } else {
            throw new Error("AI trả về rỗng. Hãy thử lại.");
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
        body: JSON.stringify({ 
            text: text.substring(0, 30000) // Gửi văn bản lên server
        })
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
    list.replaceChildren();
    quizData.forEach((_, index) => {
        const circle = document.createElement('button');
        circle.type = 'button';
        circle.className = 'q-circle';
        circle.textContent = index + 1;
        circle.id = `q-circle-${index}`;
        circle.onclick = () => loadQuestion(index);
        list.appendChild(circle);
    });
}

function loadQuestion(index) {
    if (index < 0 || index >= quizData.length) return;
    currentIdx = index;
    document.getElementById('q-number').textContent = index + 1;
    document.getElementById('prev-btn').disabled = index === 0;
    document.getElementById('next-btn').disabled = index === quizData.length - 1;
    
    // Cập nhật active sidebar
    document.querySelectorAll('.q-circle').forEach(c => c.classList.remove('active'));
    const currentCircle = document.getElementById(`q-circle-${index}`);
    if(currentCircle) currentCircle.classList.add('active');

    const qData = quizData[index];
    const content = document.getElementById('question-content');
    
    const questionText = document.createElement('div');
    questionText.className = 'question-text';
    questionText.textContent = qData.question;
    const optionsList = document.createElement('div');
    optionsList.className = 'options-list';
    qData.options.forEach((option, optionIndex) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'option-btn';
        button.textContent = option;
        button.addEventListener('click', () => checkAnswer(optionIndex));
        optionsList.appendChild(button);
    });
    const feedback = document.createElement('div');
    feedback.id = 'feedback';
    const explanation = document.createElement('div');
    explanation.id = 'explanation';
    explanation.className = 'explanation-box';
    content.replaceChildren(questionText, optionsList, feedback, explanation);

    if (Object.hasOwn(userAnswers, index)) {
        showAnswer(index);
    } else if (roundFinished) {
        Array.from(optionsList.children).forEach(button => { button.disabled = true; });
        feedback.textContent = 'Chưa làm trong lượt này.';
    }
}

function showAnswer(index) {
    const qData = quizData[index];
    const selectedOptIndex = userAnswers[index];
    const allBtns = document.querySelectorAll('.option-btn');
    const feedback = document.getElementById('feedback');
    const explanationDiv = document.getElementById('explanation');
    const circle = document.getElementById(`q-circle-${index}`);
    allBtns.forEach(button => { button.disabled = true; });
    if (selectedOptIndex === qData.answer) {
        allBtns[selectedOptIndex].classList.add('correct-answer');
        feedback.textContent = 'Chính xác!';
        feedback.className = 'feedback-correct';
        circle.classList.add('done-correct');
    } else {
        allBtns[selectedOptIndex].classList.add('wrong-answer');
        allBtns[qData.answer].classList.add('correct-answer');
        feedback.textContent = 'Sai rồi!';
        feedback.className = 'feedback-wrong';
        circle.classList.add('done-wrong');
    }
    if (qData.explanation) {
        const title = document.createElement('span');
        title.className = 'explanation-title';
        title.textContent = 'Giải thích:';
        explanationDiv.replaceChildren(title, document.createTextNode(qData.explanation));
        explanationDiv.style.display = 'block';
    }
}

function checkAnswer(selectedOptIndex) {
    if (roundFinished || Object.hasOwn(userAnswers, currentIdx)) return;
    userAnswers[currentIdx] = selectedOptIndex;
    const isCorrect = selectedOptIndex === quizData[currentIdx].answer;
    if (isCorrect) correctCount++; else wrongCount++;
    document.getElementById('score-correct').textContent = correctCount;
    document.getElementById('score-wrong').textContent = wrongCount;
    showAnswer(currentIdx);
    if (correctCount + wrongCount === quizData.length) {
        showRoundResult();
    }
}

function changeQuestion(step) {
    loadQuestion(currentIdx + step);
}
