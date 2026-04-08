const API_URL = "https://lumen-ai.onrender.com/ask";
let lastIncorrectString = "";
let subjects = JSON.parse(localStorage.getItem('eduMateData')) || {
    "General Workspace": { files: [], chatHistory: [], workspace: "" }
};
let activeSubject = localStorage.getItem('activeSubject') || "General Workspace";

let currentQuizData = null;
let loadingInterval = null;
let pendingToolType = null;
let targetSubjectForContext = null;

const loadingMessages = ["Analyzing document", "Synthesizing information", "Connecting the dots", "Generating content"];

function saveData() {
    localStorage.setItem('eduMateData', JSON.stringify(subjects));
    if (activeSubject) localStorage.setItem('activeSubject', activeSubject);
}

function getTotalStorageSize() {
    return encodeURI(JSON.stringify(subjects)).split(/%..|./).length - 1;
}

function init() {
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

// Tool Execution (Fixed Quiz Prompt)
async function runTool(type) {
    const selectedFiles = subjects[activeSubject].files.filter(f => f.selected);
    if (selectedFiles.length === 0) return alert("Select a file");
    const display = document.getElementById('sourceDisplay');
    startLoading('sourceDisplay', false);

    let promptStr = "";
    if (type === 'quiz') {
        // Forceful JSON prompt to prevent "Analysis of HTML" chatter
        promptStr = `[CRITICAL: RETURN ONLY JSON] Create a quiz with a random of 3 to 15 questions. Your question or answer must not contain a html tag. Only return questions related to the uploaded files.
        Format: [{"question": "...", "options": ["A", "B", "C", "D"], "answer": "text of correct option"}]
        Do not include any intro, outro, or explanation.`;
    } else if (type === 'summary') {
        promptStr = "Provide a comprehensive summary of these materials.";
    } else if (type === 'test') {
        promptStr = `[CRITICAL: RETURN ONLY JSON] Create a quiz with a random of 20 to 25 questions. Your question or answer must not contain a html tag. Only return questions related to the uploaded files.
        Format: [{"question": "...", "options": ["A", "B", "C", "D"], "answer": "text of correct option"}]
        Do not include any intro, outro, or explanation.`
    } else {
        promptStr = "Create a detailed study plan.";
    }

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

function renderFileList() {
    const list = document.getElementById('fileList');
    list.innerHTML = "";
    if(!activeSubject) return;
    subjects[activeSubject].files.forEach((file, index) => {
        list.innerHTML += `
      <div class="file-item">
        <input type="checkbox" ${file.selected ? 'checked' : ''} onchange="toggleFileSelection(${index})">
        <span class="file-name">📄 ${file.name}</span>
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
    if(!activeSubject) return;
    subjects[activeSubject].chatHistory.forEach(msg => {
        const div = document.createElement('div');
        div.className = `msg ${msg.role}`;
        div.innerHTML = msg.role === 'user' ? msg.text : marked.parse(msg.text);
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
        el.innerHTML = `<div class="loader-container"><div class="spinner"></div><div id="loader-text" class="loader-text">${loadingMessages[0]}</div></div>`;
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
  if (incorrect.length > 0) alert('Please wait for you custom feedback to load at the bottom of the workpace. Thank you.')

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
            <div>${marked.parse(data.response)}</div>
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
    overallFeedbackDiv.innerHTML = "<div style='margin-top: 20px; color: green; font-weight: 500;'>Perfect score! No AI review needed.</div>";
  }
}

async function generateTargetedQuiz() {
    const selectedFiles = subjects[activeSubject].files.filter(f => f.selected);
    if (selectedFiles.length === 0) return alert("Please select a source file first.");
    
    const display = document.getElementById('sourceDisplay');
    startLoading('sourceDisplay', false);

    const promptStr = `[CRITICAL: RETURN ONLY JSON] The user recently took a quiz and got the following concepts wrong:
    
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

async function sendMessage() {
    if(!activeSubject) return;
    const input = document.getElementById('userInput');
    const msg = 'You: ' + input.value.trim();
    if (!msg) return;
    const selectedFiles = subjects[activeSubject].files.filter(f => f.selected);
    const workspace = document.getElementById('sourceDisplay').innerText;
    subjects[activeSubject].chatHistory.push({ role: "user", text: msg });
    renderChat();
    input.value = "";
    const thinkingId = "thinking-" + Date.now();
    document.getElementById('chatBox').innerHTML += `<div class="msg ai thinking" id="${thinkingId}"><i id="${thinkingId}-status">Thinking...</i></div>`;
    startLoading(`${thinkingId}-status`, true);
    const fullPrompt = `Context: ${workspace}\nHistory: ${subjects[activeSubject].chatHistory.slice(-5).map(h => h.text).join("\n")}\nQuestion: ${msg}`;
    const formData = new FormData();
    formData.append("prompt", fullPrompt);
    formData.append("model", selectedFiles.length > 0 ? "Lumen VI" : "Lumen V");
    if (selectedFiles.length > 0) {
        const blob = await (await fetch(selectedFiles[0].data)).blob();
        formData.append("file", blob, selectedFiles[0].name);
    }
    try {
        const res = await fetch(API_URL, { method: "POST", body: formData });
        const data = await res.json();
        stopLoading();
        subjects[activeSubject].chatHistory.push({ role: "ai", text: data.response });
        renderChat();
        saveData();
    } catch (err) {
        stopLoading();
        document.getElementById(thinkingId).innerText = "Error.";
    }
}

document.getElementById('userInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

init();
