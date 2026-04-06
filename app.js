const API_URL = "https://your-lumen-url.onrender.com/ask";

// Navigation
document.querySelectorAll('.nav').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById(btn.dataset.tab).classList.add('active');
  };
});

// FILE STORAGE
let selectedFile = null;

function uploadFiles() {
  const input = document.getElementById('fileInput');
  const list = document.getElementById('fileList');

  selectedFile = input.files[0]; // ONLY ONE FILE (matches backend)

  if (!selectedFile) return;

  list.innerHTML = `<div>${selectedFile.name}</div>`;
}

// SEND MESSAGE (CORRECT FORMAT)
async function sendMessage() {
  const input = document.getElementById('userInput');
  const chatBox = document.getElementById('chatBox');

  const msg = input.value;
  if (!msg && !selectedFile) return;

  chatBox.innerHTML += `<div class="msg user">You: ${msg || "[File only]"}</div>`;
  input.value = "";

  const formData = new FormData();

  // ✅ MATCH BACKEND
  formData.append("prompt", msg);
  formData.append("model", "Lumen 3.5"); // you can change this dynamically later

  if (selectedFile) {
    formData.append("file", selectedFile); // MUST be "file"
  }

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      body: formData
    });

    const data = await res.json();

    const reply = data.response || data.error || "No response";

    chatBox.innerHTML += `<div class="msg ai">AI: ${reply}</div>`;
    chatBox.scrollTop = chatBox.scrollHeight;

  } catch (err) {
    chatBox.innerHTML += `<div class="msg ai">Error connecting to AI</div>`;
  }
}

// TASKS
function addTask() {
  const input = document.getElementById('taskInput');
  const list = document.getElementById('taskList');

  if (!input.value) return;

  const div = document.createElement('div');
  div.textContent = input.value;

  list.appendChild(div);
  input.value = "";
}