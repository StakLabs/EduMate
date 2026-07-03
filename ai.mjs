import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 25 * 1024 * 1024
    }
});

const corsOptions = {
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
    optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
    console.log('\n================================================');
    console.log(new Date().toISOString());
    console.log(req.method, req.originalUrl);
    console.log('IP:', req.ip);

    if (Object.keys(req.query).length) {
        console.log('Query:', req.query);
    }

    next();
});

if (!process.env.GEMINI_API_KEY) {
    console.error('ERROR: GEMINI_API_KEY is missing.');
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

function getModelName() {
    return 'gemini-2.5-flash';
}

function getMimeType(file) {
    if (file.mimetype && file.mimetype !== 'application/octet-stream') {
        return file.mimetype;
    }

    const ext = (file.originalname.split('.').pop() || '').toLowerCase();

    switch (ext) {
        case 'png': return 'image/png';
        case 'jpg':
        case 'jpeg': return 'image/jpeg';
        case 'webp': return 'image/webp';
        case 'pdf': return 'application/pdf';
        case 'txt': return 'text/plain';
        case 'csv': return 'text/csv';
        case 'json': return 'application/json';
        default: return 'application/octet-stream';
    }
}

app.post('/ask', upload.single('file'), async (req, res) => {
    try {
        console.log('----- /ask REQUEST -----');

        const prompt = req.body.prompt || '';
        const requestedModel = req.body.model || 'Lumen VI';

        console.log('Requested model:', requestedModel);
        console.log('Prompt length:', prompt.length);
        console.log('Prompt preview:', prompt.substring(0, 300));

        if (req.file) {
            console.log('File name:', req.file.originalname);
            console.log('Mime type:', req.file.mimetype);
            console.log('Detected mime:', getMimeType(req.file));
            console.log('Size:', req.file.size, 'bytes');
        } else {
            console.log('No file uploaded.');
        }

        const parts = [];

        if (req.file) {
            parts.push({
                inlineData: {
                    data: req.file.buffer.toString('base64'),
                    mimeType: getMimeType(req.file)
                }
            });
        }

        if (prompt) {
            parts.push({
                text: prompt
            });
        }

        console.log('Parts:', parts.length);

        const generationConfig = {};
        let systemInstruction = 'You are an expert educational assistant helping users study from uploaded material.';

        if (prompt.includes('[CRITICAL: RETURN ONLY JSON]')) {
            generationConfig.responseMimeType = 'application/json';
            systemInstruction += ' Return only valid JSON.';
        }

        console.log('Creating Gemini model...');

        const model = genAI.getGenerativeModel({
            model: getModelName(requestedModel),
            systemInstruction
        });

        console.log('Calling Gemini...');

        const result = await model.generateContent({
            contents: [
                {
                    role: 'user',
                    parts
                }
            ],
            generationConfig
        });

        console.log('Gemini request completed.');

        const response = result.response;

        console.log('Response exists:', !!response);
        console.log('Candidates:', response?.candidates?.length || 0);

        let text = '';

        try {
            text = response.text();
        } catch (e) {
            console.error('response.text() failed');
            console.error(e);
        }

        console.log('Response length:', text.length);
        console.log('Response preview:');
        console.log(text.substring(0, 500));

        res.json({
            response: text
        });

        console.log('Response sent.');
    } catch (error) {
        console.error('\n===== GEMINI ERROR =====');
        console.error(error);

        if (error.stack) {
            console.error(error.stack);
        }

        if (error.response) {
            console.error('API Response:', error.response);
        }

        if (error.status) {
            console.error('Status:', error.status);
        }

        if (error.code) {
            console.error('Code:', error.code);
        }

        if (error.details) {
            console.error('Details:', error.details);
        }

        res.status(500).json({
            error: 'Failed to process request.',
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

app.post('/websearch', async (req, res) => {
    try {
        console.log('----- /websearch REQUEST -----');

        const prompt = req.body.prompt || '';

        console.log('Prompt:', prompt);

        const model = genAI.getGenerativeModel({
            model: getModelName(),
            tools: [{ googleSearch: {} }]
        });

        console.log('Calling Gemini Search...');

        const result = await model.generateContent(prompt);

        console.log('Gemini Search completed.');

        const response = result.response;
        const text = response.text();

        console.log('Search response length:', text.length);

        res.json({
            response: text,
            sources: response.candidates?.[0]?.groundingMetadata?.searchEntryPoint?.htmlContent || null
        });
    } catch (error) {
        console.error('\n===== SEARCH ERROR =====');
        console.error(error);

        if (error.stack) {
            console.error(error.stack);
        }

        res.status(500).json({
            error: 'Failed to perform web search.',
            details: error.message
        });
    }
});

app.get('/ping', (req, res) => {
    console.log('/ping');
    res.send('Pong');
});

app.use((err, req, res, next) => {
    console.error('\n===== EXPRESS ERROR =====');
    console.error(err);

    res.status(500).json({
        error: err.message
    });
});

process.on('uncaughtException', err => {
    console.error('\n===== UNCAUGHT EXCEPTION =====');
    console.error(err);
});

process.on('unhandledRejection', err => {
    console.error('\n===== UNHANDLED REJECTION =====');
    console.error(err);
});

app.listen(PORT, () => {
    console.log('======================================');
    console.log('EduMate Backend Started');
    console.log('Port:', PORT);
    console.log('Node:', process.version);
    console.log('Gemini Key Loaded:', !!process.env.GEMINI_API_KEY);
    console.log('======================================');
});
