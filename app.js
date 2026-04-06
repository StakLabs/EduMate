const API_URL = "https://lumen-ai.onrender.com/ask";
let selectedFile = null;

function uploadFiles() {
  const input = document.getElementById('fileInput');
  const list = document.getElementById('fileList');
  const activeTitle = document.getElementById('activeDocTitle');
  const sourceDisplay = document.getElementById('sourceDisplay');

  selectedFile = input.files[0];
  if (!selectedFile) return;

  list.innerHTML = `<div class="active">📄 ${selectedFile.name}</div>`;
  activeTitle.innerText = selectedFile.name;
  
  sourceDisplay.innerHTML = `
    <p style="font-weight: 500; color: #1a73e8;">Document securely loaded.</p>
    <p>The contents of <strong>${selectedFile.name}</strong> are ready for analysis.</p>
    <div style="margin-top: 30px; padding: 24px; background: #f8f9fa; border-radius: 8px; border: 1px dashed #dadce0;">
      <p style="text-align: center; color: #80868b; margin: 0; font-size: 14px;">[Document rendering placeholder]</p>
    </div>
  `;
}

async function sendMessage() {
  const input = document.getElementById('userInput');
  const chatBox = document.getElementById('chatBox');
  const msg = input.value.trim();

  if (!msg && !selectedFile) return;

  chatBox.innerHTML += `<div class="msg user">${msg || "[File Upload]"}</div>`;
  input.value = "";
  chatBox.scrollTop = chatBox.scrollHeight;

  const formData = new FormData();
  formData.append("prompt", msg);
  formData.append("model", "Lumen VI");
  if (selectedFile) formData.append("file", selectedFile);

  const loadingId = "loading-" + Date.now();
  chatBox.innerHTML += `<div class="msg ai" id="${loadingId}">Thinking...</div>`;
  chatBox.scrollTop = chatBox.scrollHeight;

  try {
    const res = await fetch(API_URL, { method: "POST", body: formData });
    const data = await res.json();
    const reply = data.response || data.error || "No response";

    document.getElementById(loadingId).innerHTML = marked.parse(reply);
    chatBox.scrollTop = chatBox.scrollHeight;
  } catch (err) {
    document.getElementById(loadingId).innerText = "Error connecting to AI.";
  }
}

document.getElementById('userInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
