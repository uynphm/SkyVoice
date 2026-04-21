import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NovaSonicBidirectionalStreamClient } from './client.js';
// 1. Updated import to match your specific variable name in consts.ts
import {
    DefaultAudioInputConfiguration,
    DefaultSystemPrompt,
    DefaultInferenceConfiguration
} from './consts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultAudioDir = path.join(__dirname, '../data');

async function runAudioTest() {
    const audioFilePath = process.argv[2] || path.join(defaultAudioDir, 'seat-test.raw');

    if (!fs.existsSync(audioFilePath)) {
        console.error(`Error: Audio file not found at ${audioFilePath}`);
        process.exit(1);
    }

    console.log(`--- Starting SkyVoice Audio Test ---`);
    console.log(`Audio Source: ${path.basename(audioFilePath)}`);

    const client = new NovaSonicBidirectionalStreamClient({
        clientConfig: {
            region: process.env.AWS_REGION || 'us-east-1',
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
            }
        },
        // 2. Pass the inference config from your consts
        inferenceConfig: DefaultInferenceConfiguration
    });

    const sessionId = `test-audio-${Date.now()}`;
    const session = client.createStreamSession(sessionId);

    let fullTranscript = "";

    // 3. Enhanced Event Handlers
    session.onEvent('textOutput', (data) => {
        const content = data.text || '';
        process.stdout.write(`\n[ASSISTANT]: ${content}`);
    });

    // This handles the transcript sent back by the model for your voice
    session.onEvent('transcript', (data) => {
        if (data.text) {
            fullTranscript += data.text + " ";
            process.stdout.write(`\n[USER TRANSCRIPT]: ${data.text}`);
        }
    });

    session.onEvent('toolUse', (data) => {
        console.log('\n\n[MODEL TRIGGERED TOOL]:', data.toolName);
        console.log('--- Input Received ---');
        console.log(JSON.stringify(data.input || data, null, 2));
    });

    session.onEvent('error', (err) => {
        console.error('\n[STREAM ERROR]:', err);
    });

    try {
        const streamPromise = client.initiateBidirectionalStreaming(sessionId);

        // 4. Using your exact setup sequence
        await session.setupSessionAndPromptStart();

        // Use the variable name from your consts.ts
        await session.setupSystemPrompt(undefined, DefaultSystemPrompt);

        await session.setupStartAudio(DefaultAudioInputConfiguration);

        // 🛑 ADD THIS DELAY (approx 500ms)
        await new Promise(r => setTimeout(r, 500));

        const audioBuffer = fs.readFileSync(audioFilePath);

        // 5. Precise WAV Header Slicing
        let pcmData = audioBuffer;
        if (audioBuffer.toString('utf8', 0, 4) === 'RIFF') {
            console.log("Detected WAV header, slicing 44 bytes...");
            pcmData = audioBuffer.subarray(44);
        }


        const CHUNK_SIZE = 32768; // 32KB
        console.log(`Streaming ${pcmData.length} bytes in ${Math.ceil(pcmData.length / CHUNK_SIZE)} chunks...`);
        const delayPerChunk = 1000;

        for (let i = 0; i < pcmData.length; i += CHUNK_SIZE) {
            const chunk = pcmData.subarray(i, i + CHUNK_SIZE);
            await session.streamAudio(chunk);
            // Throttle slightly to simulate real-time speech cadence
            await new Promise(r => setTimeout(r, delayPerChunk));
        }

        console.log('\nFinishing audio content...');
        await session.endAudioContent();

        // 6. Wait for Tool Execution
        // Nova Sonic needs a moment to reason and generate the tool call JSON
        console.log('Waiting for Assistant/Tool response (8s)...');
        await new Promise(r => setTimeout(r, 8000));

        await session.endPrompt();
        await streamPromise;

        console.log('\n--- Full Captured User Transcript ---');
        console.log(fullTranscript.trim() || '(No transcript captured)');
        console.log('--------------------------------\n');

        await session.close();
        console.log('--- Test Completed ---');

    } catch (error) {
        console.error('Test Execution Failed:', error);
    }
}

runAudioTest();