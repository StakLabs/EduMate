import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const upload = multer({ storage: multer.memoryStorage() });

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

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

function getModelName(model) {
    const modelMap = {
        'Lumen VI': 'gemini-3-flash',
        'Lumen V': 'gemini-2.5-flash'
    };
    return modelMap[model] || 'gemini-2.5-flash';
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
        case 'pdf': return 'application/pdf';
        case 'txt': return 'text/plain';
        case 'csv': return 'text/csv';
        default: return 'text/plain';
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
            return res.status(400).json({ error: 'Please provide a prompt or a file.' });
        }

        const result = await model.generateContent({
            contents: [{ role: "user", parts }],
            generationConfig
        });

        const response = await result.response;
        const replyText = response.text();

        return res.json({ response: replyText });

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ 
            error: 'Failed to process request.', 
            details: error.message 
        });
    }
});

app.get('/ping', (req, res) => {
    res.status(200).send('Pong');
});

app.listen(PORT, () => {
    console.log(`EduMate Backend running on port ${PORT}`);
});
