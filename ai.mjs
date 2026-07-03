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

if (!process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is missing.');
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

function getModelName() {
    return 'gemini-2.5-flash';
}

function getMimeType(file) {
    if (file.mimetype && file.mimetype !== 'application/octet-stream') {
        return file.mimetype;
    }

    const ext = file.originalname.split('.').pop().toLowerCase();

    switch (ext) {
        case 'png':
            return 'image/png';
        case 'jpg':
        case 'jpeg':
            return 'image/jpeg';
        case 'webp':
            return 'image/webp';
        case 'pdf':
            return 'application/pdf';
        case 'txt':
            return 'text/plain';
        case 'csv':
            return 'text/csv';
        case 'json':
            return 'application/json';
        default:
            return 'application/octet-stream';
    }
}

async function generate(parts, systemInstruction, generationConfig = {}) {
    const model = genAI.getGenerativeModel({
        model: getModelName(),
        systemInstruction
    });

    const result = await model.generateContent({
        contents: [{ role: 'user', parts }],
        generationConfig
    });

    const response = result.response;

    if (!response) {
        throw new Error('No response returned.');
    }

    if (!response.candidates || response.candidates.length === 0) {
        throw new Error('No candidates returned.');
    }

    const text = response.text().trim();

    if (!text) {
        throw new Error('Gemini returned an empty response.');
    }

    return {
        text,
        response
    };
}

app.post('/ask', upload.single('file'), async (req, res) => {
    try {
        const { prompt = '' } = req.body;

        if (!prompt && !req.file) {
            return res.status(400).json({
                error: 'Please provide a prompt or a file.'
            });
        }

        const parts = [];

        if (req.file) {
            parts.push({
                inlineData: {
                    data: req.file.buffer.toString('base64'),
                    mimeType: getMimeType(req.file)
                }
            });

            parts.push({
                text: 'Use the uploaded file as the primary source of information. Answer only using its contents whenever possible.'
            });
        }

        if (prompt) {
            parts.push({ text: prompt });
        }

        let systemInstruction = 'You are an expert educational assistant helping students learn from uploaded study material.';
        const generationConfig = {};

        if (prompt.includes('[CRITICAL: RETURN ONLY JSON]')) {
            systemInstruction += ' Return ONLY valid raw JSON with no markdown.';
            generationConfig.responseMimeType = 'application/json';
        }

        const { text } = await generate(parts, systemInstruction, generationConfig);

        res.json({
            response: text
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: 'Failed to process request.',
            details: error.message
        });
    }
});

app.post('/websearch', async (req, res) => {
    try {
        const { prompt } = req.body;

        if (!prompt) {
            return res.status(400).json({
                error: 'Please provide a search prompt.'
            });
        }

        const model = genAI.getGenerativeModel({
            model: getModelName(),
            tools: [{ googleSearch: {} }]
        });

        const result = await model.generateContent(prompt);
        const response = result.response;

        if (!response) {
            throw new Error('No response returned.');
        }

        const text = response.text().trim();

        if (!text) {
            throw new Error('Gemini returned an empty response.');
        }

        res.json({
            response: text,
            sources: response.candidates?.[0]?.groundingMetadata?.searchEntryPoint?.htmlContent || null
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: 'Failed to perform web search.',
            details: error.message
        });
    }
});

app.get('/ping', (req, res) => {
    res.send('Pong');
});

app.listen(PORT, () => {
    console.log(`EduMate Backend running on port ${PORT}`);
});
