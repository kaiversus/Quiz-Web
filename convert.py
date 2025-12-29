import re
import json

def parse_quiz_data(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()

    # Tách các câu hỏi dựa trên từ khóa "Câu hỏi "
    raw_questions = re.split(r'Câu hỏi \d+', content)
    questions_json = []
    
    # Bỏ qua phần rỗng đầu tiên do split
    id_counter = 1
    
    for raw in raw_questions:
        if not raw.strip(): continue
        
        # Tìm đáp án đúng
        correct_match = re.search(r'The correct answer is:\s*(.*)', raw)
        if not correct_match: continue
        
        correct_text_full = correct_match.group(1).strip()
        
        # Tách nội dung câu hỏi và các lựa chọn
        # Lấy phần text trước dòng "The correct answer is"
        body = raw.split('The correct answer is:')[0].strip()
        
        # Cố gắng tìm các lựa chọn A, B, C, D
        options = []
        answer_index = -1
        
        # Regex tìm A. B. C. D. hoặc a. b. c. d.
        option_pattern = re.compile(r'\n[a-zA-Z]\.\s+(.*)')
        matches = option_pattern.findall(body)
        
        if matches:
            # Nếu tìm thấy các dòng a. b. c. d.
            options = [m.strip() for m in matches]
            # Lấy phần text câu hỏi (là phần trước lựa chọn đầu tiên)
            question_text = re.split(r'\n[a-zA-Z]\.', body)[0].strip()
        else:
            # Nếu không tìm thấy A,B,C,D (như câu 1-12), bỏ qua hoặc xử lý đặc biệt
            # Ở đây mình sẽ bỏ qua để tập trung vào các câu trắc nghiệm chuẩn
            continue

        # Xác định index của đáp án đúng
        # So sánh text của đáp án đúng với các options
        clean_correct = correct_text_full.lower().strip()
        
        for i, opt in enumerate(options):
            # So sánh tương đối
            if opt.lower().strip() in clean_correct or clean_correct in opt.lower().strip():
                answer_index = i
                break
        
        # Nếu không khớp text, thử check xem đáp án có phải là "A", "B"... không
        if answer_index == -1:
             # Logic mapping đơn giản nếu đáp án chỉ là ký tự
             pass 

        if options and answer_index != -1:
            questions_json.append({
                "id": id_counter,
                "question": question_text,
                "options": options,
                "answer": answer_index
            })
            id_counter += 1

    return questions_json

# Chạy và lưu file
data = parse_quiz_data('raw_data.txt')
with open('questions.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print(f"Đã tạo xong {len(data)} câu hỏi vào file questions.json")