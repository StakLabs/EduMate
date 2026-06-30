import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const upload = multer({ storage: multer.memoryStorage() });

// Verify API Key exists on startup
if (!process.env.GEMINI_API_KEY) {
    console.warn("WARNING: GEMINI_API_KEY is not defined in the environment variables!");
}

const corsOptions = {
    origin: '*', 
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
    optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

function getModelName(model) {
    // Fallback to a highly reliable stable baseline model if needed
    return 'gemini-2.5-flash'; 
}

function getMimeType(file) {
    if (file.mimetype && file.mimetype !== 'application/octet-stream') {
        return file.mimetype;
    }
    const ext = file.originalname.split('.').pop().toLowerCase();
    switch (ext) {
        case 'png': return 'image/png';
        case 'jpg':
        case 'jpeg': return 'image/jpeg';
        case 'webp': return 'image/webp';
        case 'pdf': return 'application/pdf';
        case 'txt': return 'text/plain';
        case 'csv': return 'text/csv';
        case 'json': return 'application/json';
        default: return file.mimetype || 'application/octet-stream'; 
    }
}

app.post('/ask', upload.single('file'), async (req, res) => {
    try {
        const { prompt = '', model: requestedModel = 'Lumen VI' } = req.body;
        const modelToUse = getModelName(requestedModel);

        let systemInstruction = "You are an expert educational assistant helping a user study based on the provided context.";
        let generationConfig = {};

        if (prompt.includes('[CRITICAL: RETURN ONLY JSON]')) {
            systemInstruction += " When generating a quiz, return ONLY a valid JSON array. Do not include any intro, outro, or markdown code blocks like ```json. Your response must be parseable as raw JSON.";
            generationConfig.responseMimeType = "application/json";
        }

        const model = genAI.getGenerativeModel({ 
            model: modelToUse,
            systemInstruction: systemInstruction 
        });

        const parts = [];

        if (req.file) {
            const mimeType = getMimeType(req.file);
            parts.push({
                inlineData: {
                    data: req.file.buffer.toString('base64'),
                    mimeType: mimeType
                }
            });
        }

        if (prompt) {
            parts.push({ text: prompt });
        }

        if (parts.length === 0) {
            return res.status(400).json({ error: 'Bad Request', reason: 'Please provide a prompt or a file.' });
        }

        const result = await model.generateContent({
            contents: [{ role: "user", parts }],
            generationConfig
        });

        const response = await result.response;
        
        // Safety guard against blocked content configurations
        if (!response.candidates || response.candidates.length === 0) {
            throw new Error("No response candidates returned. The prompt or file content may have triggered Google's safety filters.");
        }

        const replyText = response.text();
        return res.json({ response: replyText });

    } catch (error) {
        console.error('\n❌ /ask API Error details:', error);
        
        // Extract the most readable reason for the failure
        const reason = error?.response?.text() || error.message || 'An unknown error occurred while contacting the AI.';

        return res.status(500).json({ 
            error: 'Failed to process request.', 
            reason: reason,
            status: error.status || 500
        });
    }
});

app.post('/websearch', upload.single('file'), async (req, res) => {
    try {
        const { prompt, model: requestedModel = 'Lumen VI' } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: 'Bad Request', reason: 'Please provide a search prompt.' });
        }

        const modelToUse = getModelName(requestedModel);
        
        const model = genAI.getGenerativeModel({ 
            model: modelToUse,
            tools: [{ googleSearch: {} }] 
        });

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const replyText = response.text();

        return res.json({ 
            response: replyText,
            sources: response.candidates[0]?.groundingMetadata?.searchEntryPoint?.htmlContent || null
        });

    } catch (error) {
        console.error('\n❌ /websearch Search API Error:', error);

        // Extract the most readable reason for the failure
        const reason = error?.response?.text() || error.message || 'An unknown error occurred during web search.';

        return res.status(500).json({ 
            error: 'Failed to perform web search.', 
            reason: reason,
            status: error.status || 500
        });
    }
});

app.get('/ping', (req, res) => {
    res.status(200).send('Pong');
});

// Global error handler for malformed requests (e.g., body too large, bad JSON)
app.use((err, req, res, next) => {
    console.error('\n❌ Global Server Error:', err);
    res.status(err.status || 500).json({
        error: 'Server Error',
        reason: err.message || 'An unexpected server error occurred.'
    });
});

app.listen(PORT, () => {
    console.log(`EduMate Backend running on port ${PORT}`);
});
