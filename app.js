const API_URL = "https://lumen-ai.onrender.com/ask";
let selectedFile = null;
let chatHistory = [];
let currentQuizData = null;
let loadingInterval = null;

const loadingMessages = [
  "Analyzing document",
  "Synthesizing information",
  "Connecting the dots",
  "Generating content",
  "Formatting output",
  "Almost ready"
];

function toggleTools() {
  document.getElementById('toolsMenu').classList.toggle('active');
}

function uploadFiles() {
  const input = document.getElementById('fileInput');
  const list = document.getElementById('fileList');
  selectedFile = input.files[0];
  if (selectedFile) list.innerHTML = `<div>📄 ${selectedFile.name}</div>`;
}

function startLoading(elementId, isChat = false) {
  const el = document.getElementById(elementId);
  let index = 0;
  
  if (!isChat) {
    el.innerHTML = `
      <div class="loader-container">
        <div class="spinner"></div>
        <div id="loader-text" class="loader-text">${loadingMessages[0]}</div>
      </div>
    `;
  } else {
    el.innerText = loadingMessages[0];
  }

  loadingInterval = setInterval(() => {
    index = (index + 1) % loadingMessages.length;
    if (isChat) {
      el.innerText = loadingMessages[index];
    } else {
      const textEl = document.getElementById('loader-text');
      if (textEl) textEl.innerText = loadingMessages[index];
    }
  }, 2500);
}

function stopLoading() {
  if (loadingInterval) {
    clearInterval(loadingInterval);
    loadingInterval = null;
  }
}

async function runTool(type) {
  if (!selectedFile) return alert("Upload a file first");
  toggleTools();
  
  const display = document.getElementById('sourceDisplay');
  startLoading('sourceDisplay', false);

  const prompts = {
    quiz: 'Create a quiz based on this file. You must generate a minimum of 5 questions and a maximum of 10 questions. Output ONLY valid JSON in this exact format: [{"question": "...", "options": ["...", "...", "...", "..."], "answer": "..."}]. Do not include any markdown formatting, code blocks, or extra text.',
    summary: "Summarize this file briefly.",
    studyplan: "Create a study plan for this file."
  };

  const formData = new FormData();
  formData.append("prompt", prompts[type]);
  formData.append("model", "Lumen VI");
  formData.append("file", selectedFile);

  try {
    const res = await fetch(API_URL, { method: "POST", body: formData });
    const data = await res.json();
    stopLoading();
    
    if (type === 'quiz') {
      let jsonStr = data.response.replace(/```json/gi, '').replace(/```/g, '').trim();
      currentQuizData = JSON.parse(jsonStr);
      renderQuiz(currentQuizData);
    } else {
      display.innerHTML = marked.parse(data.response);
    }
  } catch (err) {
    stopLoading();
    display.innerHTML = "Error generating content. Please try again.";
  }
}

function renderQuiz(quizData) {
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
  
  html += `<button onclick="submitQuiz()" class="submit-btn">Submit Quiz</button>`;
  html += '</div>';
  display.innerHTML = html;
}

function submitQuiz() {
  if (!currentQuizData) return;
  let score = 0;
  
  currentQuizData.forEach((q, index) => {
    const selected = document.querySelector(`input[name="question-${index}"]:checked`);
    const feedback = document.getElementById(`feedback-${index}`);
    feedback.style.display = 'block';
    
    if (selected && selected.value === q.answer) {
      feedback.innerHTML = '<span class="correct">Correct!</span>';
      score++;
    } else {
      feedback.innerHTML = `<span class="incorrect">Incorrect. Correct answer: ${q.answer}</span>`;
    }
  });
  
  alert(`You scored ${score} out of ${currentQuizData.length}`);
}

async function sendMessage() {
  const input = document.getElementById('userInput');
  const chatBox = document.getElementById('chatBox');
  const workspaceContent = document.getElementById('sourceDisplay').innerText;

  const msg = input.value;
  if (!msg) return;

  chatBox.innerHTML += `<div class="msg user"><b>You:</b> ${msg}</div>`;
  input.value = "";
  
  const thinkingId = "thinking-" + Date.now();
  chatBox.innerHTML += `
    <div class="msg ai thinking" id="${thinkingId}">
      <i id="${thinkingId}-status">Starting up...</i>
    </div>
  `;
  chatBox.scrollTop = chatBox.scrollHeight;

  startLoading(`${thinkingId}-status`, true);

  const fullPrompt = `
    CURRENT WORKSPACE CONTENT:
    "${workspaceContent}"
    
    CONVERSATION HISTORY:
    ${chatHistory.map(h => `${h.role}: ${h.text}`).join("\n")}
    
    USER QUESTION:
    ${msg}
  `;

  const formData = new FormData();
  formData.append("prompt", fullPrompt);
  
  const modelToUse = selectedFile ? "Lumen VI" : "Lumen V";
  formData.append("model", modelToUse);
  
  if (selectedFile) formData.append("file", selectedFile);

  try {
    const res = await fetch(API_URL, { method: "POST", body: formData });
    stopLoading();
    
    const data = await res.json();
    const reply = data.response || "No response";

    chatHistory.push({ role: "user", text: msg });
    chatHistory.push({ role: "ai", text: reply });

    const aiMsgEl = document.getElementById(thinkingId);
    aiMsgEl.classList.remove('thinking');
    aiMsgEl.innerHTML = `<b>AI:</b> ${marked.parse(reply)}`;
    chatBox.scrollTop = chatBox.scrollHeight;
  } catch (err) {
    stopLoading();
    const aiMsgEl = document.getElementById(thinkingId);
    if(aiMsgEl) aiMsgEl.innerHTML = `<div class="msg ai">Error connecting to AI</div>`;
  }
}
