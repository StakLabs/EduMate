import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Multer setup for handling multipart/form-data (file uploads in memory)
const upload = multer({ storage: multer.memoryStorage() });

// CORS configuration to allow your frontend to connect
const corsOptions = {
  origin: '*', // For production, replace '*' with your frontend URL (e.g., 'https://staklabs.github.io')
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());

// Initialize the new Google Gen AI SDK
const ai = new GoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });

// Helper to determine the correct Gemini model
function getModelName(model) {
  const modelMap = {
    'Lumen VI': 'gemini-2.5-flash',
    'Lumen V': 'gemini-2.5-flash-8b',
    // Fallback to the model you specified in your first snippet if needed
    'Lumen Pro': 'gemini-3-flash-preview' 
  };
  return modelMap[model] || 'gemini-2.5-flash';
}

// Helper to reliably get mime types for GenAI
function getMimeType(file) {
  if (file.mimetype && file.mimetype !== 'application/octet-stream') {
    return file.mimetype;
  }
  const ext = file.originalname.split('.').pop().toLowerCase();
  switch (ext) {
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'pdf': return 'application/pdf';
    case 'txt': return 'text/plain';
    case 'csv': return 'text/csv';
    default: return 'text/plain'; // Default fallback for raw parsing
  }
}

// Main generation endpoint matching your frontend's API_URL structure
app.post('/ask', upload.single('file'), async (req, res) => {
  try {
    const { prompt = '', model = 'Lumen VI' } = req.body;
    const modelToUse = getModelName(model);

    const parts = [];

    // 1. Process the uploaded file if it exists
    if (req.file) {
      const mimeType = getMimeType(req.file);
      
      parts.push({
        inlineData: {
          data: req.file.buffer.toString('base64'),
          mimeType: mimeType
        }
      });
    }

    // 2. Process the text prompt
    if (prompt) {
      parts.push({ text: prompt });
    }

    if (parts.length === 0) {
      return res.status(400).json({ error: 'Please provide a prompt or a file.' });
    }

    // 3. Optional: Set a system instruction if it's a JSON/Quiz request based on the prompt text
    let systemInstruction = "You are an expert educational assistant helping a user study based on the provided context.";
    let responseMimeType = "text/plain";

    if (prompt.includes('[CRITICAL: RETURN ONLY JSON]')) {
      systemInstruction += " Return ONLY a valid JSON array as requested. Do not use markdown blocks outside the JSON.";
      // Note: if you want strict JSON mode uncomment the line below. 
      // However, your frontend uses regex to extract JSON from text, so text/plain is safer for your current UI logic.
      // responseMimeType = "application/json"; 
    }

    // 4. Generate content using the new SDK
    const response = await ai.models.generateContent({
      model: modelToUse,
      contents: { parts },
      config: {
        systemInstruction,
        responseMimeType,
      },
    });

    const replyText = response.text || 'Error: No text generated.';

    // 5. Send response matching what the frontend expects: { response: "..." }
    return res.json({ response: replyText });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ 
      error: 'Failed to process request.', 
      details: error.message 
    });
  }
});

// Health check endpoint
app.get('/ping', (req, res) => {
  res.status(200).send('Pong');
});

app.listen(PORT, () => {
  console.log(`EduMate Backend running on port ${PORT}`);
});
