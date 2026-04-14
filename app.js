async function notices() {
    await delay(1000);
    if (checkNewDay()) {
        Swal.fire({
            title: 'Notices and Updates',
            html: 'We have added website attachments, so now you can upload a webpage for analysis (Open info centre in upper right corner to learn how). <br><br>We have also added web search, concise mode, and follow-up questions in the new configure menu. Try them out and let us know what you think!',
        });
    }
}

const API_URL = "https://edumate-r44q.onrender.com/ask";
let lastIncorrectString = "";
let subjects = JSON.parse(localStorage.getItem('eduMateData')) || {
    "General Workspace": { files: [], chatHistory: [], workspace: "" }
};
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
let activeSubject = localStorage.getItem('activeSubject') || "General Workspace";

let currentQuizData = null;
let loadingInterval = null;
let pendingToolType = null;
let targetSubjectForContext = null;

let responseConfig = {
    web: false,
    concise: false,
    followUp: false
};



document.getElementById('includeSources').addEventListener('change', (e) => {
    responseConfig.web = e.target.checked;
});

document.getElementById('conciseMode').addEventListener('change', (e) => {
    responseConfig.concise = e.target.checked;
});

document.getElementById('followUp').addEventListener('change', (e) => {
    responseConfig.followUp = e.target.checked;
});

const loadingMessages = ["Analyzing document", "Synthesizing information", "Connecting the dots", "Generating content"];

function saveData() {
    localStorage.setItem('eduMateData', JSON.stringify(subjects));
    if (activeSubject) localStorage.setItem('activeSubject', activeSubject);
}

function init() {
    if (!localStorage.getItem('edumateUser')) {
        if (window.location.href === "https://staklabs.github.io/EduMate/") {
            window.location.href = "https://staklabs.github.io/EduMate/Login/";
        } else window.location.href = "l.html";
    }

    if (JSON.parse(localStorage.getItem('edumateUser')).tier != 'pay') {
        document.querySelector('.premium').classList.add('pay-first');
    } else {
        document.querySelector('.logo').classList.add('plus');
    }

    const keys = Object.keys(subjects);
    if (keys.length === 0) {
        activeSubject = null;
        showEmptyState();
    } else {
        if (!subjects[activeSubject]) activeSubject = keys[0];
        switchSubject(activeSubject);
    }
}

// Workspace Management Logic (Restored)
function addNewSubject() {
    if (JSON.parse(localStorage.getItem('edumateUser')).tier != 'pay') {
        if (Object.keys(subjects).length >= 2) {
            return Swal.fire("Free users can only have 2 workspaces. Please upgrade to premium for more workspaces.");
        }
    }
    let name = "New Workspace";
    let counter = 1;
    while (subjects[name]) {
        name = `New Workspace ${counter}`;
        counter++;
    }
    subjects[name] = { files: [], chatHistory: [], workspace: "" };
    switchSubject(name);
}

function confirmRename() {
    const newName = document.getElementById('renameInput').value.trim();
    if (!newName || newName === targetSubjectForContext) return closeRenameModal();
    if (subjects[newName]) return alert("Name exists.");
    subjects[newName] = subjects[targetSubjectForContext];
    delete subjects[targetSubjectForContext];
    if (activeSubject === targetSubjectForContext) activeSubject = newName;
    saveData();
    renderSubjectList();
    closeRenameModal();
}

function confirmDeleteSubject() {
    delete subjects[targetSubjectForContext];
    const remaining = Object.keys(subjects);
    activeSubject = remaining.length > 0 ? remaining[0] : null;
    saveData();
    if (activeSubject) switchSubject(activeSubject); else showEmptyState();
    closeDeleteModal();
}

// File Upload Logic (Restored 4MB Limit)
function uploadFiles() {
    const input = document.getElementById('fileInput');
    const MAX_BYTES = 4 * 1024 * 1024;
    if (JSON.parse(localStorage.getItem('edumateUser')).tier != 'pay') {
        if (input.files.length + subjects[activeSubject].files.length > 1) {
            return Swal.fire("Free users have 1 file limit per workspace. Please upgrade to premium for more storage.");
        }
    }
    if (input.files.length > 0) {
        Array.from(input.files).forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const newData = e.target.result;
                if (getTotalStorageSize() + newData.length > MAX_BYTES) {
                    return alert("Exceeds 4MB limit.");
                }
                subjects[activeSubject].files.push({
                    name: file.name,
                    data: newData,
                    type: file.type,
                    selected: true
                });
                renderFileList();
                saveData();
            };
            reader.readAsDataURL(file);
        });
    }
}

function toggleResponseMenu() {
    const menu = document.getElementById('responseMenu');
    if (menu.style.display === 'block') {
        menu.style.display = 'none';
    } else {
        menu.style.display = 'block';
    }
}

window.addEventListener('click', function(e) {
  const toolsMenu = document.getElementById('toolsMenu');
  const responseMenu = document.getElementById('responseMenu');
  const toolsBtn = document.querySelector('.tools-btn');

  if (!e.target.closest('.tools-container')) {
    if (toolsMenu) toolsMenu.classList.remove('active');
    if (responseMenu) responseMenu.classList.remove('active');
  }
});

async function runTool(type) {
    const selectedFiles = subjects[activeSubject].files.filter(f => f.selected);
    if (selectedFiles.length === 0) return alert("Select a file");
    const display = document.getElementById('sourceDisplay');

    let promptStr = "";
    if (type === 'quiz') {
        // Forceful JSON prompt to prevent "Analysis of HTML" chatter
        promptStr = `[CRITICAL: RETURN ONLY JSON] Create a quiz with a random of 3 to 15 questions. Your question or answer must not contain a html tag. Only return questions related to the uploaded files.
        Format: [{"question": "...", "options": ["A", "B", "C", "D"], "answer": "text of correct option"}]
        Do not include any intro, outro, or explanation.`;
    } else if (type === 'summary') {
        promptStr = "Provide a comprehensive summary of these materials.";
    } else if (type === 'test') {
        if (JSON.parse(localStorage.getItem('edumateUser')).tier != 'pay') {
            Swal.fire('Test generation is exclusive to premium users.');
            return;
        }
        promptStr = `[CRITICAL: RETURN ONLY JSON] Create a quiz with a random of 20 to 25 questions. Your question or answer must not contain a html tag. Only return questions related to the uploaded files.
        Format: [{"question": "...", "options": ["A", "B", "C", "D"], "answer": "text of correct option"}]
        Do not include any intro, outro, or explanation.`
    } else {
        promptStr = "Create a detailed study plan.";
    }
    startLoading('sourceDisplay', false);

    const formData = new FormData();
    formData.append("prompt", promptStr);
    formData.append("model", "Lumen VI");
    const blob = await (await fetch(selectedFiles[0].data)).blob();
    formData.append("file", blob, selectedFiles[0].name);

    try {
        const res = await fetch(API_URL, { method: "POST", body: formData });
        const data = await res.json();
        stopLoading();

        if (type === 'quiz' || type === 'test') {
            const match = data.response.match(/\[[\s\S]*\]/);
            if (match) {
                currentQuizData = JSON.parse(match[0]);
                if (type == 'test') renderQuiz(currentQuizData, true);
                else renderQuiz(currentQuizData);
            }
        } else {
            const html = marked.parse(data.response);
            display.innerHTML = html;
            subjects[activeSubject].workspace = html;
            saveData();
        }
    } catch (err) {
        stopLoading();
        display.innerHTML = "Error processing request.";
    }
}

// ... All other original functions (renderChat, renderFileList, sendMessage) remain identical to your original code ...
function getTotalStorageSize() {
    return encodeURI(JSON.stringify(subjects)).split(/%..|./).length - 1;
}

document.addEventListener('click', () => {
    document.getElementById('contextMenu').style.display = 'none';
});

function handleContextMenu(e, name) {
    e.preventDefault();
    targetSubjectForContext = name;
    const menu = document.getElementById('contextMenu');
    menu.style.display = 'block';
    menu.style.left = `${e.pageX}px`;
    menu.style.top = `${e.pageY}px`;
}

function renderSubjectList() {
    const list = document.getElementById('subjectList');
    list.innerHTML = "";
    Object.keys(subjects).forEach(sub => {
        const btn = document.createElement('button');
        btn.innerText = sub;
        btn.className = `subject-btn-main ${sub === activeSubject ? 'active' : ''}`;
        btn.onclick = () => switchSubject(sub);
        btn.oncontextmenu = (e) => handleContextMenu(e, sub);
        list.appendChild(btn);
    });
}

function openRenameModal() {
    document.getElementById('renameInput').value = targetSubjectForContext;
    document.getElementById('renameModal').style.display = 'flex';
    document.getElementById('renameInput').focus();
}

function closeRenameModal() {
    document.getElementById('renameModal').style.display = 'none';
}

function openDeleteModal() {
    document.getElementById('deleteModal').style.display = 'flex';
    document.getElementById('confirmDeleteBtn').onclick = confirmDeleteSubject;
}

function closeDeleteModal() {
    document.getElementById('deleteModal').style.display = 'none';
}

function switchSubject(name) {
    activeSubject = name;
    hideEmptyState();
    const data = subjects[activeSubject];
    document.getElementById('activeDocTitle').innerText = name;
    document.getElementById('sourceDisplay').innerHTML = data.workspace || "";
    renderFileList();
    renderChat();
    renderSubjectList();
    saveData();
}
function checkNewDay() {
  const today = new Date().toDateString();
  const lastSavedDate = localStorage.getItem('lastVisitDate');

  if (!lastSavedDate) {
    localStorage.setItem('lastVisitDate', today);
    return true;
  }
  if (lastSavedDate !== today) {
    localStorage.setItem('lastVisitDate', today);
    const diff = new Date(today) - new Date(lastSavedDate);
    return diff >= 24 * 60 * 60 * 1000;
  }
  return false;
}

function streak() {
  let streakData = JSON.parse(localStorage.getItem('streak'));
  const isNewDay = checkNewDay();

  if (!streakData) {
    streakData = { currentStreak: 1 };
    localStorage.setItem('streak', JSON.stringify(streakData));

    Swal.fire(`Congrats! You've started a 1 day streak 🔥`);
    return;
  }
  if (isNewDay) {
    streakData.currentStreak += 1;
    localStorage.setItem('streak', JSON.stringify(streakData));
    Swal.fire(`Congrats on adding to your streak! You're on ${streakData.currentStreak} days 🔥`);
  }
  console.log(streakData);
}

streak();


function showEmptyState() {
    document.getElementById('emptyState').style.display = 'flex';
    document.getElementById('canvasPaper').style.display = 'none';
    document.getElementById('chatPane').style.display = 'none';
    document.getElementById('sourcesHeader').style.display = 'none';
    document.getElementById('sourcesSection').style.display = 'none';
    renderSubjectList();
}

function hideEmptyState() {
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('canvasPaper').style.display = 'flex';
    document.getElementById('chatPane').style.display = 'flex';
    document.getElementById('sourcesHeader').style.display = 'block';
    document.getElementById('sourcesSection').style.display = 'block';
}

function getFileEmoji(file) {
    if (!file) return '📄';

    const type = file.type || '';
    const name = file.name || '';
    const ext = name.split('.').pop()?.toLowerCase();

    const mimeMap = {
        'text/html': '🌐',
        'text/css': '🎨',
        'application/javascript': '💻',
        'text/javascript': '💻',
        'application/json': '💻',
        'text/plain': '📄',
        'text/markdown': '📝',

        'application/pdf': '📄',

        'image/jpeg': '🖼️',
        'image/png': '🖼️',
        'image/gif': '🖼️',
        'image/webp': '🖼️',
        'image/svg+xml': '🖼️',

        'video/mp4': '🎬',
        'video/webm': '🎬',

        'audio/mpeg': '🎵',
        'audio/wav': '🎵',

        'application/zip': '🗜️',
        'application/x-zip-compressed': '🗜️'
    };

    const extMap = {
        js: '💻',
        css: '🎨',
        html: '🌐',
        json: '💻',
        md: '📝',
        txt: '📄',

        py: '🐍',
        cs: '💜',
        java: '☕',
        cpp: '⚙️',
        c: '⚙️',
        ts: '🔷',

        jpeg: '🖼️',
        jpg: '🖼️',
        png: '🖼️',

        mp4: '🎬',
        mp3: '🎵',

        zip: '🗜️',
        rar: '🗜️'
    };

    if (mimeMap[type]) return mimeMap[type];
    if (extMap[ext]) return extMap[ext];

    if (type.startsWith('image/')) return '🖼️';
    if (type.startsWith('video/')) return '🎬';
    if (type.startsWith('audio/')) return '🎵';
    if (type.startsWith('text/')) return '📄';

    return '📁';
}

function renderFileList() {
    const list = document.getElementById('fileList');
    list.innerHTML = "";
    if(!activeSubject) return;
    subjects[activeSubject].files.forEach((file, index) => {
        list.innerHTML += `
    <div class="file-item">
        <input type="checkbox" ${file.selected ? 'checked' : ''} onchange="toggleFileSelection(${index})">
        <span title="${(file.name).replace('.html', '')}" class="file-name">${getFileEmoji(file)} ${(file.name).replace('.html', '')}</span>
        <button class="remove-file-btn" onclick="removeFile(${index})">×</button>
    </div> 
    `;
    });
}

function toggleFileSelection(index) {
    subjects[activeSubject].files[index].selected = !subjects[activeSubject].files[index].selected;
    saveData();
}

function removeFile(index) {
    subjects[activeSubject].files.splice(index, 1);
    renderFileList();
    saveData();
}

function clearChat() {
    if(!activeSubject) return;
    subjects[activeSubject].chatHistory = [];
    renderChat();
    saveData();
}

function renderChat() {
    const chatBox = document.getElementById('chatBox');
    chatBox.innerHTML = "";
    if (!activeSubject) return;

    subjects[activeSubject].chatHistory.forEach(msg => {
        const div = document.createElement('div');
        div.className = `msg ${msg.role}`;

        if (msg.role === 'user') {
            div.innerHTML = marked.parse(msg.text || "");
        } else {
            let text = msg.text || "";
            let answers = msg.answers || [];

            if (Array.isArray(answers) && answers.length > 0) {
                answers.forEach(ans => {
                    if (!ans) return;
                    const escaped = ans.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const regex = new RegExp(`(${escaped})`, 'gi');
                    text = text.replace(regex, `<span class="highlight">$1</span>`);
                });
            }
            div.innerHTML = marked.parse(text);
        }
        chatBox.appendChild(div);
    });

    chatBox.scrollTop = chatBox.scrollHeight;
}

function toggleTools() {
    document.getElementById('toolsMenu').classList.toggle('active');
}

function openCountModal(type) {
    toggleTools();
    pendingToolType = type;
    document.getElementById('countModal').style.display = 'flex';
}

function closeCountModal() {
    document.getElementById('countModal').style.display = 'none';
    pendingToolType = null;
}

function confirmToolCount() {
    const count = parseInt(document.getElementById('itemCount').value);
    if (isNaN(count) || count < 3 || count > 15) return alert("Enter 3-15");
    closeCountModal();
    runTool(pendingToolType, count);
}

function startLoading(elementId, isChat = false) {
    const el = document.getElementById(elementId);
    let index = 0;
    if (!isChat) {
        el.innerHTML = `<div class="loader-container"><div class="spinner"></div><div id="loader-text" class="loader-text">${responseConfig.web ? 'Searching the web...' : loadingMessages[0]}</div></div>`;
    } else {
        el.innerText = loadingMessages[0];
    }
    loadingInterval = setInterval(() => {
        index = (index + 1) % loadingMessages.length;
        const textEl = isChat ? el : document.getElementById('loader-text');
        if (textEl) textEl.innerText = loadingMessages[index];
    }, 2500);
}

function stopLoading() {
    clearInterval(loadingInterval);
}

function renderQuiz(quizData, test) {
const chatPane = document.getElementById('chatPane');
if (test) {
    document.body.classList.add('test-mode');
    if (chatPane) chatPane.style.display = 'none';
} else {
    document.body.classList.remove('test-mode');
}
const display = document.getElementById('sourceDisplay');
let html = '<div class="quiz-container">';

quizData.forEach((q, index) => {
    html += `
    <div class="quiz-question" id="q-${index}">
        <p><b>Q${index + 1}: ${q.question}</b></p>
        ${q.options.map(opt => `
        <label class="quiz-option">
            <input type="radio" name="question-${index}" value="${opt.replace(/"/g, '&quot;')}">
            ${opt}
        </label><br>
        `).join('')}
        <div class="feedback" id="feedback-${index}"></div>
    </div><hr>
    `;
});

html += `<button onclick="submitQuiz(${test ? true : false})" class="submit-btn">Submit ${test ? 'Test' : 'Quiz'}</button>`;
if (test) html += `<button onclick="window.location.reload()" class="exit-btn">Exit Test</button>`;
html += '</div>';
display.innerHTML = html;
}

async function submitQuiz(test) {
if (!currentQuizData) return;
let score = 0;
let incorrect = [];

let overallFeedbackDiv = document.getElementById('overall-quiz-feedback');
if (!overallFeedbackDiv) {
    overallFeedbackDiv = document.createElement('div');
    overallFeedbackDiv.id = 'overall-quiz-feedback';
    document.querySelector('.quiz-container').appendChild(overallFeedbackDiv);
}
overallFeedbackDiv.innerHTML = ''; 

currentQuizData.forEach((q, index) => {
    const selected = document.querySelector(`input[name="question-${index}"]:checked`);
    const feedback = document.getElementById(`feedback-${index}`);
    feedback.style.display = 'block';

    const userAnswer = selected ? selected.value : "No answer provided";

    if (selected && userAnswer === q.answer) {
    feedback.innerHTML = '<span class="correct">Correct!</span>';
    score++;
    } else {
    feedback.innerHTML = `<span class="incorrect">Incorrect. Correct answer: ${q.answer}</span>`;
    incorrect.push({
        'question': q.question,
        'correct_answer': q.answer,
        'user_answer': userAnswer
    });
    }
});

alert(`You scored ${score} out of ${currentQuizData.length}`);
if (incorrect.length > 0) alert('Please wait for you custom feedback to load at the bottom of the workspace. Thank you.')

if (incorrect.length > 0) {
    const thinkingId = "quiz-thinking-" + Date.now();
    
    overallFeedbackDiv.innerHTML = `
    <div class="msg ai thinking" id="${thinkingId}" style="margin-top: 20px;">
        <i id="${thinkingId}-status">Analyzing your incorrect answers...</i>
    </div>
    `;
    
    startLoading(`${thinkingId}-status`, true);

    const formData = new FormData();
    const selectedFiles = subjects[activeSubject].files.filter(f => f.selected);

    lastIncorrectString = incorrect.map(item => 
    `Question: ${item.question} | Correct Answer: ${item.correct_answer} | User Answer: ${item.user_answer}`
    ).join('\n');

    formData.append("prompt", `These are questions that the user got incorrect on a quiz. Please explain what they did wrong, how they can improve${test ? '.' : ' , and whether they would like a quiz with questions just like that for practice.'} Maximum 3 sentences, minimum 1. Here is what they got incorrect:\n${lastIncorrectString}`);
    formData.append("model", selectedFiles.length > 0 ? "Lumen VI" : "Lumen V");
    
    if (selectedFiles.length > 0) {
        const blob = await (await fetch(selectedFiles[0].data)).blob();
        formData.append("file", blob, selectedFiles[0].name);
    }

    try {
        const res = await fetch(API_URL, { method: "POST", body: formData });
        const data = await res.json();
        
        stopLoading();
        
        overallFeedbackDiv.innerHTML = `
        <div class="ai-quiz-feedback" style="margin-top: 20px; padding: 15px; border-radius: 8px; border-left: 4px solid #6200ee; background: #f4f0ff;">
            <h4 style="margin-top: 0;">AI Tutor Feedback</h4>
            ${JSON.parse(localStorage.getItem('edumateUser')).tier === 'pay' ? '' : '<p>Unlock detailed feedback by upgrading to a premium plan.</p>'}
            <div class="${JSON.parse(localStorage.getItem('edumateUser')).tier === 'pay' ? '' : 'locked'} prevent-select">${marked.parse(data.response)}</div>
            ${test ? '' : `<button onclick="generateTargetedQuiz()" class="primary-btn" style="margin-top: 15px; background: #6200ee; color: white; border: none; padding: 10px 15px; border-radius: 6px; cursor: pointer;">
            Practice Weak Areas
            </button>
        `}</div
        `;
    } catch (err) {
        stopLoading();
        overallFeedbackDiv.innerHTML = "<div style='color: red; margin-top: 20px;'>Error generating AI feedback.</div>";
    }
} else {
    overallFeedbackDiv.innerHTML = `<div style='margin-top: 20px; color: green; font-weight: 500;'>Perfect score! No AI review needed.</div>
    <button onclick="generateTargetedQuiz()" class="primary-btn" style="margin-top: 15px; background: #6200ee; color: white; border: none; padding: 10px 15px; border-radius: 6px; cursor: pointer;">
            Practice Weak Areas
            </button>`;
}
}

async function generateTargetedQuiz() {
    if (JSON.parse(localStorage.getItem('edumateUser')).tier != 'pay') {
        Swal.fire('Targeted quiz generation is exclusive to premium users.');
        return;
    }
    const selectedFiles = subjects[activeSubject].files.filter(f => f.selected);
    if (selectedFiles.length === 0) return alert("Please select a source file first.");
    
    const display = document.getElementById('sourceDisplay');
    startLoading('sourceDisplay', false);

    const promptStr = `The user recently took a quiz and got the following concepts wrong:
    
    ${lastIncorrectString}
    
    Create a new practice quiz focusing ONLY on similar concepts to help them practice their weak areas. Generate between 3 and 7 questions. Your question or answer must not contain a html tag.
    Format: [{"question": "...", "options": ["A", "B", "C", "D"], "answer": "text of correct option"}]
    Do not include any intro, outro, or explanation. Return ONLY the JSON array.`;

    const formData = new FormData();
    formData.append("prompt", promptStr);
    formData.append("model", "Lumen VI");
    
    const blob = await (await fetch(selectedFiles[0].data)).blob();
    formData.append("file", blob, selectedFiles[0].name);

    try {
        const res = await fetch(API_URL, { method: "POST", body: formData });
        const data = await res.json();
        
        stopLoading();

        const match = data.response.match(/\[[\s\S]*\]/);
        if (match) {
            currentQuizData = JSON.parse(match[0]);
            renderQuiz(currentQuizData);
        } else {
            display.innerHTML = "Error generating targeted quiz. The AI did not return a valid format.";
        }
    } catch (err) {
        stopLoading();
        display.innerHTML = "Error processing request.";
    }
}

function openSettings() {
    Swal.fire({
        title: 'Hard Reset Data',
        text: 'This will clear all your workspaces, files, and chat history. This action cannot be undone. Only use this if the AI is not recieving your files. Are you sure?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Yes, reset everything!',
        backdrop: `
    rgba(0,0,123,0.4)
    url("nyan-cat.gif")
    left top
    no-repeat
  `
    }).then((result) => {
            if (result.isConfirmed) {
                localStorage.clear();
                window.location.reload();
            }
        }
    );
}

function showSourceInfo() {
    Swal.fire({
        title: 'Info Centre',
        showCancelButton: true,
        cancelButtonText: 'How to upload a website'
    }).then((result) => {        if (result.isDismissed) {
            Swal.fire({
                title: 'How to upload a website',   
                text: 'To upload a website, you can use the command Ctrl+s or Cmd+s on that site, and click save to save the webpage as a .html file. Then, upload that file to EduMate to have the AI analyze its content.'
            });
        }
    });
}

async function sendMessage() {
    let premium = true;
    if (!activeSubject) return;

    const input = document.getElementById('userInput');
    const raw = input.value.trim();
    if (!raw) return;

    const msg = 'You: ' + raw;
    const selectedFiles = subjects[activeSubject].files.filter(f => f.selected);
    const workspace = document.getElementById('sourceDisplay').innerText;

    if (JSON.parse(localStorage.getItem('edumateUser')).tier !== 'pay') {
        const userMsgs = subjects[activeSubject].chatHistory.filter(m => m.role === 'user').length;
        if (userMsgs >= 5) {
            Swal.fire("Responses will now be short and slow. Upgrade to premium for unlimited access to the AI's full capabilities.");
            document.querySelector('.chat-title').innerText = "AI Chat (Limited Access)";
            premium = false;
        }
    }

    subjects[activeSubject].chatHistory.push({ role: "user", text: msg });
    renderChat();
    input.value = "";

    const thinkingId = "thinking-" + Date.now();
    const chatBox = document.getElementById('chatBox');
    const thinkingDiv = document.createElement('div');
    thinkingDiv.className = "msg ai thinking";
    thinkingDiv.id = thinkingId;
    thinkingDiv.innerHTML = `<i id="${thinkingId}-status">Thinking...</i>`;
    chatBox.appendChild(thinkingDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
    
    startLoading(`${thinkingId}-status`, true);

    if (!premium) await delay(3000);

    const fullPrompt = `
    ${responseConfig.concise ? 'Very short responses only.' : (premium ? 'Long and detailed response.' : 'Short responses only.')}
${premium ? 'Long and detailed response.' : 'Very short responses only.'}
${responseConfig.followUp ? 'At the end of your response, you must ask a follow-up question, like "Would you like to ..."' : 'Do not ask a follow-up question.'}
You are an AI study assistant.
ALWAYS respond in JSON format.
Response format:
{
"text": "",
"answers": []
}
Rules:
- "text" must be natural and human.
- "answers" must be extracted from the text.
- Only add things to the answers array that are directly mentioned in the text.
- Only add things to the answers array if you provided an explaination or answer of some sort.
- Do not output anything outside JSON.
- Answers array should only be 1 to 2 words per answer, recommended to only have 1 answer
- Prefferably, ONLY HAVE 1 ANSWER in the answers array
- If there is an uploaded file, then when providing a response, reference the file like this: [filename.mimetype]
- When a html file is uploaded, it means that the user wants you to analyze the content of that webpage, not the source code. So when referencing the content of the webpage, use [filename] in your response
Context: ${workspace}
History:
${subjects[activeSubject].chatHistory.slice(-5).map(h => h.text).join("\n")}
Question:
${msg}`;

    const formData = new FormData();
    formData.append("prompt", fullPrompt);
    formData.append("model", selectedFiles.length > 0 ? "Lumen VI" : "Lumen V");

    if (selectedFiles.length > 0) {
        const blob = await (await fetch(selectedFiles[0].data)).blob();
        formData.append("file", blob, selectedFiles[0].name);
    }

    try {
        const res = await fetch(`${responseConfig.web ? 'https://edumate-r44q.onrender.com/websearch' : API_URL}`, { method: "POST", body: formData });
        const data = await res.json();
        stopLoading();

        let aiData = data.response;
        if (typeof aiData === "string") {
            try {
                const jsonMatch = aiData.match(/\{[\s\S]*\}/);
                aiData = JSON.parse(jsonMatch ? jsonMatch[0] : aiData);
            } catch {
                aiData = { text: aiData, answers: [] };
            }
        }

        subjects[activeSubject].chatHistory.push({
            role: "ai",
            text: aiData.text || "",
            answers: aiData.answers || []
        });

        renderChat();
        saveData();
    } catch (err) {
        stopLoading();
        const errDiv = document.getElementById(thinkingId);
        if (errDiv) errDiv.innerText = "Error processing request.";
    }
}

document.getElementById('userInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

init();
