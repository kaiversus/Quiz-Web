const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function createQuiz({ confirm = () => true } = {}) {
    const nodes = new Map();

    class Element {
        constructor(id = '') {
            this.id = id;
            this.children = [];
            this.listeners = {};
            this.style = {};
            this.classes = new Set();
            this.classList = {
                add: name => this.classes.add(name),
                remove: name => this.classes.delete(name),
                contains: name => this.classes.has(name),
                toggle: (name, force) => force ? this.classes.add(name) : this.classes.delete(name)
            };
        }

        appendChild(child) {
            this.children.push(child);
            if (child.id) nodes.set(child.id, child);
        }

        replaceChildren(...children) {
            this.children = children;
            for (const child of children) if (child.id) nodes.set(child.id, child);
        }

        addEventListener(event, listener) { this.listeners[event] = listener; }
        click() { this.listeners.click?.(); }
    }

    const document = {
        getElementById(id) {
            if (!nodes.has(id)) nodes.set(id, new Element(id));
            return nodes.get(id);
        },
        createElement() { return new Element(); },
        createTextNode(text) { return { textContent: text }; },
        querySelectorAll(selector) {
            if (selector === '.q-circle') return this.getElementById('question-list').children;
            if (selector === '.option-btn') return this.getElementById('question-content').children[1].children;
            return [];
        }
    };

    // A fixed random value makes the shuffle deterministic while exercising its mapping.
    const random = Object.assign(Object.create(Math), { random: () => 0 });
    const context = vm.createContext({ document, Math: random, console, window: { confirm } });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8'), context);
    const run = code => vm.runInContext(code, context);
    run("sourceQuestions = [{question:'A',options:['a0','a1','a2'],answer:1},{question:'B',options:['b0','b1','b2'],answer:2},{question:'C',options:['c0','c1','c2'],answer:0}]");
    return { document, run };
}

test('shuffled answers retain the correct answer and wrong questions repeat until correct', () => {
    const { document, run } = createQuiz();
    run('startRound([0,1,2])');
    const questions = run('quizData');
    assert.equal(questions.length, 3);
    for (const question of questions) {
        assert.equal(question.options[question.answer], ['a1', 'b2', 'c0'][question.sourceIndex]);
    }

    const missedIndex = questions[0].sourceIndex;
    run('checkAnswer((quizData[0].answer + 1) % 3)');
    for (let index = 1; index < 3; index++) {
        run(`loadQuestion(${index}); checkAnswer(quizData[${index}].answer)`);
    }
    assert.equal(run('wrongCount'), 1);
    assert.match(document.getElementById('result-message').textContent, /1 câu sai/);

    document.getElementById('next-round-btn').click();
    assert.equal(run('roundNumber'), 2);
    assert.equal(run('quizData.length'), 1);
    assert.equal(document.getElementById('round-total').textContent, 1);
    assert.equal(run('quizData[0].sourceIndex'), missedIndex);
    assert.equal(run('correctCount + wrongCount'), 0);

    run('checkAnswer(quizData[0].answer)');
    assert.match(document.getElementById('result-title').textContent, /đúng tất cả/);
    assert.equal(document.getElementById('next-round-btn').classList.contains('hidden'), true);
});

test('turning off shuffle keeps question and answer order', () => {
    const { run } = createQuiz();
    run('shuffleQuestions = false; shuffleOptions = false; startRound([0,1,2])');
    const questions = run('quizData');
    assert.deepEqual(Array.from(questions, question => question.sourceIndex), [0, 1, 2]);
    assert.deepEqual(Array.from(questions[0].options), ['a0', 'a1', 'a2']);
    assert.equal(questions[0].answer, 1);
});

test('finishing early retries wrong and unanswered questions', () => {
    const { document, run } = createQuiz();
    run('shuffleQuestions = false; shuffleOptions = false; startRound([0,1,2])');
    run('checkAnswer(1)'); // Correct A
    run('loadQuestion(1); checkAnswer(0)'); // Wrong B
    document.getElementById('finish-round-btn').click(); // C is unanswered

    assert.equal(run('roundFinished'), true);
    assert.equal(document.getElementById('final-unanswered').textContent, 1);
    assert.match(document.getElementById('result-message').textContent, /1 câu sai và 1 câu chưa làm/);
    assert.equal(document.getElementById('finish-round-btn').classList.contains('hidden'), true);

    run('loadQuestion(2); checkAnswer(0)');
    assert.equal(run('correctCount'), 1); // The finished round cannot change.
    assert.equal(document.querySelectorAll('.option-btn').every(button => button.disabled), true);

    document.getElementById('next-round-btn').click();
    const retry = run('quizData');
    assert.deepEqual(Array.from(retry, question => question.sourceIndex), [1, 2]);
    assert.equal(document.getElementById('round-total').textContent, 2);
    assert.equal(run('roundFinished'), false);
    assert.equal(run('roundNumber'), 2);
});

test('canceling the finish confirmation keeps the round open', () => {
    let allowFinish = false;
    let prompt = '';
    const { document, run } = createQuiz({ confirm: message => {
        prompt = message;
        return allowFinish;
    } });
    run('startRound([0,1,2])');
    document.getElementById('finish-round-btn').click();
    assert.match(prompt, /3 câu chưa làm/);
    assert.equal(run('roundFinished'), false);
    assert.equal(document.getElementById('result-modal').classList.contains('hidden'), true);

    run('checkAnswer(quizData[0].answer)');
    assert.equal(run('correctCount'), 1);
    allowFinish = true;
    document.getElementById('finish-round-btn').click();
    assert.equal(run('roundFinished'), true);
    assert.equal(document.getElementById('final-unanswered').textContent, 2);
});

test('quiz script loads after the result controls it registers', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.ok(html.indexOf('id="restart-btn"') < html.indexOf('<script src="script.js"></script>'));
});
