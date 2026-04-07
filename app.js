const API_URL = "https://lumen-ai.onrender.com/ask";
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
    if (activeSubject) {
        localStorage.setItem('activeSubject', activeSubject);
    } else {
        localStorage.removeItem('activeSubject');
    }
}

function init() {
    const keys = Object.keys(subjects);
    if (keys.length === 0) {
        activeSubject = null;
        showEmptyState();
    } else {
        if (!subjects[activeSubject]) {
            activeSubject = keys[0];
        }
        switchSubject(activeSubject);
    }
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

function addNewSubject() {
    let baseName = "New Workspace";
    let name = baseName;
    let counter = 1;
    while (subjects[name]) {
        name = `${baseName} ${counter}`;
        counter++;
    }
    subjects[name] = { files: [], chatHistory: [], workspace: "" };
    switchSubject(name);
}

function openRenameModal() {
    document.getElementById('renameInput').value = targetSubjectForContext;
    document.getElementById('renameModal').style.display = 'flex';
    document.getElementById('renameInput').focus();
}

function closeRenameModal() {
    document.getElementById('renameModal').style.display = 'none';
}

function confirmRename() {
    const newName = document.getElementById('renameInput').value.trim();
    if (!newName || newName === targetSubjectForContext) return closeRenameModal();
    if (subjects[newName]) return alert("A workspace with this name already exists.");

    subjects[newName] = subjects[targetSubjectForContext];
    delete subjects[targetSubjectForContext];

    if (activeSubject === targetSubjectForContext) {
        activeSubject = newName;
    }
    
    saveData();
    renderSubjectList();
    if (activeSubject === newName) {
        document.getElementById('activeDocTitle').innerText = newName;
    }
    closeRenameModal();
}

function openDeleteModal() {
    document.getElementById('deleteModal').style.display = 'flex';
    document.getElementById('confirmDeleteBtn').onclick = confirmDeleteSubject;
}

function closeDeleteModal() {
    document.getElementById('deleteModal').style.display = 'none';
}

function confirmDeleteSubject() {
    if (targetSubjectForContext && subjects[targetSubjectForContext]) {
        delete subjects[targetSubjectForContext];
        const remaining = Object.keys(subjects);
        
        if (remaining.length === 0) {
            activeSubject = null;
        } else if (activeSubject === targetSubjectForContext) {
            activeSubject = remaining[0];
        }
        
        saveData();
        if (activeSubject) {
            switchSubject(activeSubject);
        } else {
            showEmptyState();
        }
        closeDeleteModal();
    }
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

function uploadFiles() {
    const input = document.getElementById('fileInput');
    if (input.files.length > 0) {
        Array.from(input.files).forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
                subjects[activeSubject].files.push({
                    name: file.name,
                    data: e.target.result,
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

async function runTool(type, count = null) {
    if(!activeSubject) return;
    const selectedFiles = subjects[activeSubject].files.filter(f => f.selected);
    if (selectedFiles.length === 0) return alert("Select at least one file");

    const display = document.getElementById('sourceDisplay');
    startLoading('sourceDisplay', false);

    let promptStr = "";
    if (type === 'quiz') promptStr = `Create a quiz. Generate exactly ${count} questions. JSON ONLY: [{"question": "...", "options": ["...", "...", "...", "..."], "answer": "..."}]`;
    else if (type === 'summary') promptStr = "Summarize these files.";
    else if (type === 'studyplan') promptStr = "Create a study plan.";

    const formData = new FormData();
    formData.append("prompt", promptStr);
    formData.append("model", "Lumen VI");

    const blob = await (await fetch(selectedFiles[0].data)).blob();
    formData.append("file", blob, selectedFiles[0].name);

    try {
        const res = await fetch(API_URL, { method: "POST", body: formData });
        const data = await res.json();
        stopLoading();

        if (type === 'quiz') {
            const match = data.response.match(/\[[\s\S]*\]/);
            currentQuizData = JSON.parse(match[0]);
            renderQuiz(currentQuizData);
        } else {
            const html = marked.parse(data.response);
            display.innerHTML = html;
            subjects[activeSubject].workspace = html;
            saveData();
        }
    } catch (err) {
        stopLoading();
        display.innerHTML = "Error generating content.";
    }
}

function renderQuiz(quizData) {
    const display = document.getElementById('sourceDisplay');
    let html = '<div class="quiz-container">';
    quizData.forEach((q, index) => {
        html += `<div class="quiz-question"><b>Q${index + 1}: ${q.question}</b><br>` +
            q.options.map(opt => `<label class="quiz-option"><input type="radio" name="q-${index}" value="${opt.replace(/"/g, '&quot;')}">${opt}</label><br>`).join('') +
            `<div class="feedback" id="feedback-${index}"></div></div><hr>`;
    });
    html += `<button onclick="submitQuiz()" class="submit-btn">Submit Quiz</button></div>`;
    display.innerHTML = html;
}

function submitQuiz() {
    let score = 0;
    currentQuizData.forEach((q, index) => {
        const sel = document.querySelector(`input[name="q-${index}"]:checked`);
        const fb = document.getElementById(`feedback-${index}`);
        fb.style.display = 'block';
        if (sel && sel.value === q.answer) { fb.innerHTML = '<span class="correct">Correct!</span>'; score++; }
        else { fb.innerHTML = `<span class="incorrect">Incorrect. Answer: ${q.answer}</span>`; }
    });
    alert(`Score: ${score}/${currentQuizData.length}`);
}

async function sendMessage() {
    if(!activeSubject) return;
    const input = document.getElementById('userInput');
    const msg = input.value.trim();
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
