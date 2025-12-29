let quizData = [];
let currentIdx = 0;
let userAnswers = {};
let correctCount = 0;
let wrongCount = 0;

// --- SỰ KIỆN NÚT BẮT ĐẦU (ĐÃ SỬA ĐỔI) ---
document.getElementById('start-btn').addEventListener('click', () => {
    const fileInput = document.getElementById('file-upload');
    const file = fileInput.files[0];

    // 1. Kiểm tra xem người dùng đã chọn file chưa
    if (!file) {
        alert("⚠️ Vui lòng chọn một file JSON câu hỏi trước!");
        return;
    }

    // 2. Tạo đối tượng đọc file
    const reader = new FileReader();

    // Khi đọc xong file thì chạy hàm này
    reader.onload = function(e) {
        try {
            // Lấy nội dung text trong file
            const jsonContent = e.target.result;
            
            // Chuyển từ text sang mảng object (Parse JSON)
            quizData = JSON.parse(jsonContent);

            // Kiểm tra sơ bộ xem file có đúng format không
            if (!Array.isArray(quizData) || quizData.length === 0) {
                alert("File JSON không hợp lệ hoặc rỗng!");
                return;
            }

            // Nếu ổn -> Ẩn modal, hiện game
            document.getElementById('welcome-modal').classList.add('hidden');
            document.getElementById('main-ui').classList.remove('hidden');
            
            // Khởi tạo giao diện
            renderSidebar();
            loadQuestion(0);

        } catch (error) {
            alert("❌ Lỗi đọc file JSON! Hãy kiểm tra lại cấu trúc file.\n" + error.message);
        }
    };

    // Bắt đầu đọc file dưới dạng văn bản
    reader.readAsText(file);
});

// 2. Vẽ sidebar (các ô số)
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

// 3. Hiển thị 1 câu hỏi
function loadQuestion(index) {
    if (index < 0 || index >= quizData.length) return;
    currentIdx = index;

    // Update UI số câu
    document.getElementById('q-number').innerText = index + 1;
    
    // Highlight sidebar
    document.querySelectorAll('.q-circle').forEach(c => c.classList.remove('active'));
    const currentCircle = document.getElementById(`q-circle-${index}`);
    if(currentCircle) currentCircle.classList.add('active');

    // Render nội dung câu hỏi
    const qData = quizData[index];
    const content = document.getElementById('question-content');
    
    let optionsHtml = '';
    qData.options.forEach((opt, i) => {
        // Kiểm tra xem câu này đã làm chưa để active lại nút
        // (Lưu ý: Logic này cần mở rộng nếu muốn lưu trạng thái từng câu, 
        // nhưng ở mức cơ bản thì ta render lại nút mới)
        optionsHtml += `<button class="option-btn" onclick="checkAnswer(${i}, this)">${opt}</button>`;
    });

    content.innerHTML = `
        <div class="question-text">${qData.question}</div>
        <div class="options-list">${optionsHtml}</div> <div id="feedback" style="margin-top:15px; font-weight:bold;"></div>
        <div id="explanation" class="explanation-box" style="display:none;"></div>
    `;

    // --- LOGIC NÚT "TIẾP THEO" / "HOÀN THÀNH" (MỚI THÊM) ---
    const nextBtn = document.getElementById('next-btn');
    
    // Nếu là câu cuối cùng
    if (index === quizData.length - 1) {
        nextBtn.innerText = "HOÀN THÀNH 🏁";
        nextBtn.style.background = "var(--success-color)"; // Đổi màu xanh lá cho nổi
        nextBtn.onclick = finishQuiz; // Đổi hành động thành nộp bài
    } else {
        // Nếu không phải câu cuối
        nextBtn.innerText = "Tiếp theo ➜";
        nextBtn.style.background = ""; // Reset màu
        nextBtn.onclick = () => changeQuestion(1); // Hành động chuyển câu
    }
}

function finishQuiz() {
    const totalQuestions = quizData.length;
    const score = (correctCount / totalQuestions) * 10;

    // Cập nhật thông tin vào HTML mới
    // SỬA DÒNG NÀY: Thêm phần "/ tổng số"
    document.getElementById('final-correct').innerText = correctCount + "/" + totalQuestions; 
    
    document.getElementById('final-wrong').innerText = wrongCount;
    document.getElementById('final-score').innerText = score.toFixed(1);

    // Hiện modal
    document.getElementById('result-modal').classList.remove('hidden');
}

// --- THÊM HÀM ĐỂ TẮT MODAL (XEM LẠI BÀI) ---
function closeResultModal() {
    document.getElementById('result-modal').classList.add('hidden');
}

// 4. Kiểm tra đáp án
function checkAnswer(selectedOptIndex, btnElement) {
    const qData = quizData[currentIdx];
    const allBtns = document.querySelectorAll('.option-btn');
    const feedback = document.getElementById('feedback');
    const circle = document.getElementById(`q-circle-${currentIdx}`);
    
    // ✅ THÊM DÒNG NÀY ĐỂ LẤY THẺ DIV GIẢI THÍCH
    const explanationDiv = document.getElementById('explanation'); 

    // Khóa tất cả nút
    allBtns.forEach(btn => btn.classList.add('disabled'));

    if (selectedOptIndex === qData.answer) {
        // Đúng
        btnElement.classList.add('correct-answer');
        feedback.innerHTML = '<span style="color:green">Chính xác!</span>';
        circle.classList.add('done-correct');
        circle.classList.remove('done-wrong');
        updateScore(true);
    } else {
        // Sai
        btnElement.classList.add('wrong-answer');
        // Hiện đáp án đúng
        allBtns[qData.answer].classList.add('correct-answer');
        feedback.innerHTML = '<span style="color:red">Sai rồi!</span>';
        circle.classList.add('done-wrong');
        circle.classList.remove('done-correct');
        updateScore(false);
    }
    
    // Kiểm tra xem câu hỏi này có dữ liệu explanation không
    if (qData.explanation) {
        explanationDiv.innerHTML = `<span class="explanation-title">Giải thích:</span> ${qData.explanation}`;
        explanationDiv.style.display = 'block'; // Hiện lên
    } else {
        explanationDiv.style.display = 'none'; // Ẩn đi nếu không có giải thích
    }
}

// 5. Chuyển câu
function changeQuestion(step) {
    loadQuestion(currentIdx + step);
}

// 6. Tính điểm đơn giản
function updateScore(isCorrect) {
    // Logic đếm đơn giản (reset khi F5)
    if(isCorrect) correctCount++; else wrongCount++;
    document.getElementById('score-correct').innerText = correctCount;
    document.getElementById('score-wrong').innerText = wrongCount;
}