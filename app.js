const API_URL = "https://lumen-ai.onrender.com/ask";
let selectedFile = null;

// --- FILE UPLOAD & CANVAS UPDATE ---
function uploadFiles() {
  const input = document.getElementById('fileInput');
  const list = document.getElementById('fileList');
  const activeTitle = document.getElementById('activeDocTitle');
  const sourceDisplay = document.getElementById('sourceDisplay');

  selectedFile = input.files[0]; // ONLY ONE FILE (matches backend)

  if (!selectedFile) return;

  // 1. Update the Left Sidebar (Sources List)
  list.innerHTML = `<div class="source-item active">📄 ${selectedFile.name}</div>`;

  // 2. Update the Middle Canvas (Document Viewer)
  activeTitle.innerText = selectedFile.name;
  
  // This simulates the document being loaded onto the "desk"
  sourceDisplay.innerHTML = `
    <p style="font-weight: 500; color: #1a73e8;">Document securely loaded.</p>
    <p>The contents of <strong>${selectedFile.name}</strong> are ready for analysis.</p>
    <div style="margin-top: 30px; padding: 24px; background: #f8f9fa; border-radius: 8px; border: 1px dashed #dadce0;">
      <p style="text-align: center; color: #80868b; margin: 0; font-size: 14px;">
        [ In a full production environment, the parsed PDF/Text would render here ]
      </p>
    </div>
    <p style="color: #5f6368; font-size: 0.9rem; margin-top: 20px;">
      Use the AI Chat on the right to summarize, extract data, or ask questions about this document.
    </p>
  `;
}

// --- SEND MESSAGE & AI CHAT ---
async function sendMessage() {
  const input = document.getElementById('userInput');
  const chatBox = document.getElementById('chatBox');

  const msg = input.value.trim();
  if (!msg && !selectedFile) return;

  // 1. Append User Message
  chatBox.innerHTML += `<div class="msg user">${msg || "[ File Uploaded ]"}</div>`;
  input.value = "";
  
  // Auto-scroll to bottom
  chatBox.scrollTop = chatBox.scrollHeight;

  // 2. Prepare Data for Backend (Matching your exact original format)
  const formData = new FormData();
  formData.append("prompt", msg);
  formData.append("model", "Lumen VI"); 

  if (selectedFile) {
    formData.append("file", selectedFile); // MUST be "file"
  }

  // 3. Add a temporary "Thinking..." bubble for better UX
  const loadingId = "loading-" + Date.now();
  chatBox.innerHTML += `<div class="msg ai" id="${loadingId}">Thinking...</div>`;
  chatBox.scrollTop = chatBox.scrollHeight;

  try {
    // 4. Fetch from Backend
    const res = await fetch(API_URL, {
      method: "POST",
      body: formData
    });

    const data = await res.json();
    const reply = data.response || data.error || "No response received.";

    // 5. Replace "Thinking..." with the actual response
    const loadingBubble = document.getElementById(loadingId);
    if (loadingBubble) {
      loadingBubble.innerText = reply;
    } else {
      // Fallback just in case
      chatBox.innerHTML += `<div class="msg ai">${reply}</div>`;
    }
    
    chatBox.scrollTop = chatBox.scrollHeight;

  } catch (err) {
    const loadingBubble = document.getElementById(loadingId);
    if (loadingBubble) {
      loadingBubble.innerText = "Error connecting to AI. Please check your connection or server.";
    }
    chatBox.scrollTop = chatBox.scrollHeight;
  }
}

// --- UX ENHANCEMENTS ---
// Allow Enter key to send messages (Shift+Enter for a new line)
document.getElementById('userInput').addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault(); // Prevents the default new line in the textarea
    sendMessage();
  }
});
