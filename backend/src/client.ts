import {
    BedrockRuntimeClient,
    BedrockRuntimeClientConfig,
    InvokeModelWithBidirectionalStreamCommand,
    InvokeModelWithBidirectionalStreamInput,
} from "@aws-sdk/client-bedrock-runtime";
import {
    NodeHttp2Handler,
    NodeHttp2HandlerOptions,
} from "@smithy/node-http-handler";
import { Provider } from "@smithy/types";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { InferenceConfig } from "./types";
import { Subject } from 'rxjs';
import { take } from 'rxjs/operators';
import { firstValueFrom } from 'rxjs';
import {
    DefaultAudioInputConfiguration,
    DefaultAudioOutputConfiguration,
    DefaultSystemPrompt,
    DefaultTextConfiguration,
    VoiceInteractionSchema,
} from "./consts";

export interface NovaSonicBidirectionalStreamClientConfig {
    requestHandlerConfig?:
    | NodeHttp2HandlerOptions
    | Provider<NodeHttp2HandlerOptions | void>;
    clientConfig: Partial<BedrockRuntimeClientConfig>;
    inferenceConfig?: InferenceConfig;
}

export class StreamSession {
    private audioBufferQueue: Buffer[] = [];
    private maxQueueSize = 200; // Maximum number of audio chunks to queue
    private isProcessingAudio = false;
    private isActive = true;

    constructor(
        private sessionId: string,
        private client: NovaSonicBidirectionalStreamClient
    ) { }

    // Register event handlers for this specific session
    public onEvent(eventType: string, handler: (data: any) => void): StreamSession {
        this.client.registerEventHandler(this.sessionId, eventType, handler);
        return this; // For chaining
    }

    public async setupSessionAndPromptStart(): Promise<void> {
        this.client.setupSessionStartEvent(this.sessionId);
        this.client.setupPromptStartEvent(this.sessionId);
    }

    public async setupSystemPrompt(
        textConfig: typeof DefaultTextConfiguration = DefaultTextConfiguration,
        systemPromptContent: string = DefaultSystemPrompt): Promise<void> {
        this.client.setupSystemPromptEvent(this.sessionId, textConfig, systemPromptContent);
    }

    public async setupStartAudio(
        audioConfig: typeof DefaultAudioInputConfiguration = DefaultAudioInputConfiguration
    ): Promise<void> {
        this.client.setupStartAudioEvent(this.sessionId, audioConfig);
    }

    // public async sendText(text: string): Promise<void> {
    //     this.client.sendTextMessageEvent(this.sessionId, text);
    // }

    // Stream audio for this session
    public async streamAudio(audioData: Buffer): Promise<void> {
        // Check queue size to avoid memory issues
        if (this.audioBufferQueue.length >= this.maxQueueSize) {
            // Queue is full, drop oldest chunk
            this.audioBufferQueue.shift();
            console.log("Audio queue full, dropping oldest chunk");
        }

        // Queue the audio chunk for streaming
        this.audioBufferQueue.push(audioData);
        this.processAudioQueue();
    }

    // Process audio queue for continuous streaming
    private async processAudioQueue() {
        if (this.isProcessingAudio || this.audioBufferQueue.length === 0 || !this.isActive) return;

        this.isProcessingAudio = true;
        try {
            // Process all chunks in the queue, up to a reasonable limit
            let processedChunks = 0;
            const maxChunksPerBatch = 5; // Process max 5 chunks at a time to avoid overload

            while (this.audioBufferQueue.length > 0 && processedChunks < maxChunksPerBatch && this.isActive) {
                const audioChunk = this.audioBufferQueue.shift();
                if (audioChunk) {
                    await this.client.streamAudioChunk(this.sessionId, audioChunk);
                    processedChunks++;
                }
            }
        } finally {
            this.isProcessingAudio = false;

            // If there are still items in the queue, schedule the next processing using setTimeout
            if (this.audioBufferQueue.length > 0 && this.isActive) {
                setTimeout(() => this.processAudioQueue(), 0);
            }
        }
    }

    // Get session ID
    public getSessionId(): string {
        return this.sessionId;
    }

    public async endAudioContent(): Promise<void> {
        if (!this.isActive) return;
        await this.client.sendContentEnd(this.sessionId);
    }

    public async endPrompt(): Promise<void> {
        if (!this.isActive) return;
        await this.client.sendPromptEnd(this.sessionId);
    }

    public async close(): Promise<void> {
        if (!this.isActive) return;

        this.isActive = false;
        this.audioBufferQueue = []; // Clear any pending audio

        await this.client.sendSessionEnd(this.sessionId);
        console.log(`Session ${this.sessionId} close completed`);
    }
}

// Session data type
interface SessionData {
    queue: Array<any>;
    queueSignal: Subject<void>;
    closeSignal: Subject<void>;
    responseSubject: Subject<any>;
    toolUseContent: any;
    toolUseId: string;
    toolName: string;
    responseHandlers: Map<string, (data: any) => void>;
    promptName: string;
    inferenceConfig: InferenceConfig;
    isActive: boolean;
    isPromptStartSent: boolean;
    isAudioContentStartSent: boolean;
    audioContentId: string;
    isAudioContentActive: boolean;
    currentContentRole: 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL';
}

export class NovaSonicBidirectionalStreamClient {
    private bedrockRuntimeClient: BedrockRuntimeClient;
    private inferenceConfig: InferenceConfig;
    private activeSessions: Map<string, SessionData> = new Map();
    private sessionLastActivity: Map<string, number> = new Map();
    private sessionCleanupInProgress = new Set<string>();


    constructor(config: NovaSonicBidirectionalStreamClientConfig) {
        const nodeHttp2Handler = new NodeHttp2Handler({
            requestTimeout: 300000,
            sessionTimeout: 300000,
            disableConcurrentStreams: false,
            maxConcurrentStreams: 20,
            ...config.requestHandlerConfig,
        });

        if (!config.clientConfig.credentials) {
            throw new Error("No credentials provided");
        }

        this.bedrockRuntimeClient = new BedrockRuntimeClient({
            ...config.clientConfig,
            credentials: config.clientConfig.credentials,
            region: config.clientConfig.region || "us-east-1",
            requestHandler: nodeHttp2Handler
        });

        this.inferenceConfig = config.inferenceConfig ?? {
            maxTokens: 1024,
            temperature: 0.7,
            topP: 0.9,
        }
    }

    public isSessionActive(sessionId: string): boolean {
        const session = this.activeSessions.get(sessionId);
        return !!session && session.isActive;
    }

    public getActiveSessions(): string[] {
        return Array.from(this.activeSessions.keys());
    }

    public getLastActivityTime(sessionId: string): number {
        return this.sessionLastActivity.get(sessionId) || 0;
    }

    private updateSessionActivity(sessionId: string): void {
        this.sessionLastActivity.set(sessionId, Date.now());
    }

    public isCleanupInProgress(sessionId: string): boolean {
        return this.sessionCleanupInProgress.has(sessionId);
    }

    // Create a new streaming session
    public createStreamSession(sessionId: string = randomUUID(), config?: NovaSonicBidirectionalStreamClientConfig): StreamSession {
        if (this.activeSessions.has(sessionId)) {
            // Stale session — force close it and create fresh
            console.log(`Session ${sessionId} already exists in activeSessions, force-closing before recreate`);
            this.forceCloseSession(sessionId);
        }

        const session: SessionData = {
            queue: [],
            queueSignal: new Subject<void>(),
            closeSignal: new Subject<void>(),
            responseSubject: new Subject<any>(),
            toolUseContent: null,
            toolUseId: "",
            toolName: "",
            responseHandlers: new Map(),
            promptName: randomUUID(),
            inferenceConfig: config?.inferenceConfig ?? this.inferenceConfig,
            isActive: true,
            isPromptStartSent: false,
            isAudioContentStartSent: false,
            audioContentId: randomUUID(),
            isAudioContentActive: false,
            currentContentRole: 'USER'
        };

        this.activeSessions.set(sessionId, session);

        return new StreamSession(sessionId, this);
    }

    private async processToolUse(toolName: string, toolUseContent: any): Promise<Object> {
        const tool = toolName.toLowerCase();

        if (tool === "parsevoiceinteraction" || tool === "parse_voice_interaction") {
            console.log("Voice Interaction Parsed:", JSON.stringify(toolUseContent, null, 2));
            return {
                status: "success",
                type: toolUseContent.type,
                intent: toolUseContent.intent,
                reasoning: toolUseContent.reasoning,
                speech: toolUseContent.speech,
                next_step: toolUseContent.next_step,
                data: toolUseContent.data || {},
                constraints: toolUseContent.constraints || {},
                confidence: toolUseContent.confidence ?? 1.0,
            };
        }

        console.log(`Tool ${tool} not supported`);
        throw new Error(`Tool ${tool} not supported`);
    }

    // Stream audio for a specific session
    public async initiateBidirectionalStreaming(sessionId: string): Promise<void> {
        const session = this.activeSessions.get(sessionId);
        if (!session) {
            throw new Error(`Stream session ${sessionId} not found`);
        }

        try {

            console.log(`[${sessionId}] initiateBidirectionalStreaming: Creating asyncIterable...`);
            const asyncIterable = this.createSessionAsyncIterable(sessionId);

            console.log(`[${sessionId}] initiateBidirectionalStreaming: Calling bedrockRuntimeClient.send...`);
            const response = await this.bedrockRuntimeClient.send(
                new InvokeModelWithBidirectionalStreamCommand({
                    modelId: "amazon.nova-sonic-v1:0",
                    body: asyncIterable,
                })
            );

            console.log(`Stream established for session ${sessionId}, processing responses...`);

            // Process responses for this session
            await this.processResponseStream(sessionId, response);

        } catch (error: any) {
            console.error("❌ [TOP LEVEL ERROR]:", error);

            // This is the hidden Bedrock stream you want
            if (error.$response && error.$response.body) {
                try {
                    const chunks = [];
                    // Read the whole stream into a buffer using for-await since it's a Node.js stream
                    for await (const chunk of error.$response.body) {
                        chunks.push(chunk);
                    }

                    const bodyBytes = Buffer.concat(chunks);
                    const bodyText = bodyBytes.toString('utf8');

                    // Print the *entire* body; it may be long, but it contains the real error
                    console.log("🔓 FULL HIDDEN BEDROCK RESPONSE BODY:");
                    console.log(bodyText);

                    // Optional: if it looks like JSON, try to parse it
                    try {
                        const parsed = JSON.parse(bodyText);
                        console.log("🔍 PARSED JSON ERROR:");
                        console.log(parsed);
                    } catch (e) {
                        console.log("🔍 Body is not valid JSON, but raw text:");
                        console.log(bodyText);
                    }

                } catch (readError) {
                    console.error("Failed to read $response.body:", readError);
                }
            } else {
                console.log("No $response.body found on this error.");
            }

            // Your existing event dispatch:
            this.dispatchEventForSession(sessionId, 'error', {
                source: 'bidirectionalStream',
                message: error.message,
                error
            });

            if (session && session.isActive) {
                this.forceCloseSession(sessionId);
            }
        }
    }

    // Dispatch events to handlers for a specific session
    private dispatchEventForSession(sessionId: string, eventType: string, data: any): void {
        const session = this.activeSessions.get(sessionId);
        if (!session) return;

        const handler = session.responseHandlers.get(eventType);
        if (handler) {
            try {
                handler(data);
            } catch (e) {
                console.error(`Error in ${eventType} handler for session ${sessionId}: `, e);
            }
        }

        // Also dispatch to "any" handlers
        const anyHandler = session.responseHandlers.get('any');
        if (anyHandler) {
            try {
                anyHandler({ type: eventType, data });
            } catch (e) {
                console.error(`Error in 'any' handler for session ${sessionId}: `, e);
            }
        }
    }

    private createSessionAsyncIterable(sessionId: string): AsyncIterable<InvokeModelWithBidirectionalStreamInput> {

        if (!this.isSessionActive(sessionId)) {
            console.log(`Cannot create async iterable: Session ${sessionId} not active`);
            return {
                [Symbol.asyncIterator]: () => ({
                    next: async () => ({ value: undefined, done: true })
                })
            };
        }

        const session = this.activeSessions.get(sessionId);
        if (!session) {
            throw new Error(`Cannot create async iterable: Session ${sessionId} not found`);
        }

        let eventCount = 0;

        return {
            [Symbol.asyncIterator]: () => {
                console.log(`[${sessionId}] AsyncIterable iterator REQUESTED by Bedrock SDK.`);

                return {
                    next: async (): Promise<IteratorResult<InvokeModelWithBidirectionalStreamInput>> => {
                        try {
                            // Check if session is still active
                            if (!session.isActive || !this.activeSessions.has(sessionId)) {
                                console.log(`Iterator closing for session ${sessionId}, done = true`);
                                return { value: undefined, done: true };
                            }
                            // Wait for items in the queue or close signal
                            if (session.queue.length === 0) {
                                try {
                                    await Promise.race([
                                        firstValueFrom(session.queueSignal.pipe(take(1))),
                                        firstValueFrom(session.closeSignal.pipe(take(1))).then(() => {
                                            throw new Error("Stream closed");
                                        })
                                    ]);
                                } catch (error) {
                                    if (error instanceof Error) {
                                        if (error.message === "Stream closed" || !session.isActive) {
                                            // This is an expected condition when closing the session
                                            if (this.activeSessions.has(sessionId)) {
                                                console.log(`Session ${sessionId} closed during wait`);
                                            }
                                            return { value: undefined, done: true };
                                        }
                                    }
                                    else {
                                        console.error(`Error on event close`, error)
                                    }
                                }
                            }

                            // If queue is still empty or session is inactive, we're done
                            if (session.queue.length === 0 || !session.isActive) {
                                console.log(`Queue empty or session inactive: ${sessionId} `);
                                return { value: undefined, done: true };
                            }

                            // Get next item from the session's queue
                            const nextEvent = session.queue.shift();
                            eventCount++;

                            // Log every event sent to Bedrock (truncate audioInput base64)
                            const logStr = JSON.stringify(nextEvent);
                            const isAudio = logStr.includes('"audioInput"');
                            console.log(`[→ Bedrock] Event #${eventCount}: ${isAudio ? '(audioInput chunk)' : logStr.substring(0, 300)}`);

                            return {
                                value: {
                                    chunk: {
                                        bytes: new TextEncoder().encode(JSON.stringify(nextEvent))
                                    }
                                },
                                done: false
                            };
                        } catch (error) {
                            console.error(`Error in session ${sessionId} iterator: `, error);
                            session.isActive = false;
                            return { value: undefined, done: true };
                        }
                    },

                    return: async (): Promise<IteratorResult<InvokeModelWithBidirectionalStreamInput>> => {
                        console.log(`Iterator return () called for session ${sessionId}`);
                        session.isActive = false;
                        return { value: undefined, done: true };
                    },

                    throw: async (error: any): Promise<IteratorResult<InvokeModelWithBidirectionalStreamInput>> => {
                        console.log(`Iterator throw () called for session ${sessionId} with error: `, error);
                        session.isActive = false;
                        throw error;
                    }
                };
            }
        };
    }

    // Process the response stream from AWS Bedrock
    private async processResponseStream(sessionId: string, response: any): Promise<void> {
        const session = this.activeSessions.get(sessionId);
        if (!session) return;

        // Persistent parsing state for this session's stream to handle split chunks
        let braceCount = 0;
        let startIndex = -1;
        let accumulatedBuffer = "";

        try {
            console.log(`[${sessionId}] AWS Bedrock bidirectional stream initiating.`);

            for await (const event of response.body) {
                if (!session.isActive) break;

                // 1. Handle actual data chunks (standard case)
                if (event.chunk?.bytes) {
                    this.updateSessionActivity(sessionId);
                    const textResponse = new TextDecoder().decode(event.chunk.bytes);
                    accumulatedBuffer += textResponse;

                    // Parse JSON objects from the accumulated buffer
                    let i = 0;
                    while (i < accumulatedBuffer.length) {
                        const char = accumulatedBuffer[i];
                        if (char === '{') {
                            if (braceCount === 0) startIndex = i;
                            braceCount++;
                        } else if (char === '}') {
                            braceCount--;
                            if (braceCount === 0 && startIndex !== -1) {
                                const jsonStr = accumulatedBuffer.substring(startIndex, i + 1);
                                try {
                                    const jsonResponse = JSON.parse(jsonStr);
                                    const innerEvent = jsonResponse.event || jsonResponse;

                                    // Log all non-audio events
                                    const eventType = Object.keys(innerEvent)[0];
                                    if (eventType !== 'audioOutput' && eventType !== 'transcript') {
                                        console.log(`[Bedrock Event] ${eventType}:`, JSON.stringify(innerEvent).substring(0, 200));
                                    } else if (innerEvent.transcript) {
                                        console.log(`\x1b[32m[TRANSCRIPT]\x1b[0m ${innerEvent.transcript.text} (Final: ${!!innerEvent.transcript.final})`);
                                    }

                                    // Dispatch events with unique IDs to prevent duplication in UI
                                    const turnId = innerEvent.textOutput?.completionId || innerEvent.toolUse?.completionId || innerEvent.audioOutput?.completionId;

                                    if (innerEvent.transcript) {
                                        this.dispatchEventForSession(sessionId, 'transcript', {
                                            ...innerEvent.transcript,
                                            role: innerEvent.transcript.role || session.currentContentRole || 'USER',
                                            id: innerEvent.transcript.transcriptId || `user-${Date.now()}`
                                        });
                                    } else if (innerEvent.textOutput) {
                                        this.dispatchEventForSession(sessionId, 'textOutput', {
                                            ...innerEvent.textOutput,
                                            id: turnId
                                        });
                                    } else if (innerEvent.audioOutput) {
                                        this.dispatchEventForSession(sessionId, 'audioOutput', innerEvent.audioOutput);
                                    } else if (innerEvent.contentStart) {
                                        if (innerEvent.contentStart.role) {
                                            session.currentContentRole = innerEvent.contentStart.role;
                                        }
                                        this.dispatchEventForSession(sessionId, 'contentStart', innerEvent.contentStart);
                                    } else if (innerEvent.toolUse) {
                                        console.log(`[TOOL TRIGGERED] ${innerEvent.toolUse.toolName}:`, innerEvent.toolUse.content);
                                        this.dispatchEventForSession(sessionId, 'toolUse', innerEvent.toolUse);
                                        session.toolUseId = innerEvent.toolUse.toolUseId;
                                        session.toolName = innerEvent.toolUse.toolName;

                                        // Restore speech dispatch for UI with deduplication IDs
                                        try {
                                            const toolContent = JSON.parse(innerEvent.toolUse.content || "{}");
                                            session.toolUseContent = toolContent;
                                            if (toolContent.speech) {
                                                console.log(`[AI TOOL SPEECH] ${toolContent.speech}`);
                                                this.dispatchEventForSession(sessionId, 'transcript', {
                                                    text: toolContent.speech,
                                                    id: turnId || innerEvent.toolUse.toolUseId,
                                                    final: true,
                                                    role: "ASSISTANT"
                                                });
                                            }
                                        } catch (e) {
                                            session.toolUseContent = innerEvent.toolUse.content;
                                        }
                                    }
                                    else if (innerEvent.contentEnd) {
                                        this.dispatchEventForSession(sessionId, 'contentEnd', innerEvent.contentEnd);

                                        if (innerEvent.contentEnd.type === 'TOOL') {
                                            const toolResult = await this.processToolUse(session.toolName, session.toolUseContent);
                                            await this.sendToolResult(sessionId, session.toolUseId, toolResult);
                                            this.dispatchEventForSession(sessionId, 'toolResult', { toolUseId: session.toolUseId, result: toolResult });
                                        }
                                        if (innerEvent.contentEnd.type === 'AUDIO' || innerEvent.contentEnd.contentName === session.audioContentId) {
                                            console.log(`[MULTI-TURN] Bedrock closed audio block ${session.audioContentId}. Will re-open on next audio input.`);
                                            session.isAudioContentActive = false;
                                            session.isAudioContentStartSent = false;
                                        }
                                    }
                                } catch (e) {
                                    console.error(`Invalid JSON chunk in ${sessionId}:`, jsonStr);
                                }

                                // After successful object extraction, remove it from buffer and reset startIndex
                                accumulatedBuffer = accumulatedBuffer.substring(i + 1);
                                i = -1; // Reset to start of new buffer for next object
                                startIndex = -1;
                            }
                        }
                        i++;
                    }
                }
                // 2. Handle System-level Streaming Errors
                else if (event.modelStreamErrorException) {
                    console.error(`Model stream error for session ${sessionId}:`, event.modelStreamErrorException);
                    this.dispatchEventForSession(sessionId, 'error', {
                        type: 'modelStreamErrorException',
                        details: event.modelStreamErrorException
                    });
                } else if (event.internalServerException) {
                    console.error(`Internal server error for session ${sessionId}:`, event.internalServerException);
                    this.dispatchEventForSession(sessionId, 'error', {
                        type: 'internalServerException',
                        details: event.internalServerException
                    });
                }
            }

            console.log(`Response stream processing complete for session ${sessionId}`);
            this.dispatchEventForSession(sessionId, 'streamComplete', { timestamp: new Date().toISOString() });

        } catch (streamError) {
            console.error(`Critical error in response stream for ${sessionId}:`, streamError);
            this.dispatchEventForSession(sessionId, 'error', {
                source: 'responseStream',
                message: 'Error processing response stream',
                details: streamError instanceof Error ? streamError.message : String(streamError)
            });
        }
    }

    // Add an event to a session's queue
    private addEventToSessionQueue(sessionId: string, event: any): void {
        const session = this.activeSessions.get(sessionId);
        if (!session || !session.isActive) return;

        this.updateSessionActivity(sessionId);
        session.queue.push(event);
        session.queueSignal.next();
    }


    // Set up initial events for a session
    public setupSessionStartEvent(sessionId: string): void {
        console.log(`Setting up initial events for session ${sessionId}...`);
        const session = this.activeSessions.get(sessionId);
        if (!session) return;

        // Session start event
        this.addEventToSessionQueue(sessionId, {
            event: {
                sessionStart: {
                    inferenceConfiguration: session.inferenceConfig,
                }
            }
        });
    }

    public setupPromptStartEvent(sessionId: string): void {
        console.log(`Setting up prompt start event for session ${sessionId}...`);
        const session = this.activeSessions.get(sessionId);
        if (!session) return;
        // Prompt start event
        this.addEventToSessionQueue(sessionId, {
            event: {
                promptStart: {
                    promptName: session.promptName,
                    textOutputConfiguration: {
                        mediaType: "text/plain",
                    },
                    audioOutputConfiguration: {
                        audioType: "SPEECH",
                        mediaType: "audio/lpcm",
                        encoding: "base64",
                        sampleRateHertz: 24000,
                        sampleSizeBits: 16,
                        channelCount: 1,
                        voiceId: "matthew",
                    },
                    toolUseOutputConfiguration: {
                        mediaType: "application/json",
                    },
                    toolConfiguration: {
                        tools: [
                            {
                                toolSpec: {
                                    name: "parseVoiceInteraction",
                                    description: "Parse the user's voice input into a structured interaction object containing the intent, context, and the speech script to reply with.",
                                    inputSchema: {
                                        json: VoiceInteractionSchema
                                    }
                                }
                            }
                        ]
                    },
                }
            }
        });
        session.isPromptStartSent = true;
    }

    public setupSystemPromptEvent(sessionId: string,
        textConfig: typeof DefaultTextConfiguration = DefaultTextConfiguration,
        systemPromptContent: string = DefaultSystemPrompt
    ): void {
        console.log(`Setting up systemPrompt events for session ${sessionId}...`);
        const session = this.activeSessions.get(sessionId);
        if (!session) return;
        // Text content start
        const textPromptID = randomUUID();
        this.addEventToSessionQueue(sessionId, {
            event: {
                contentStart: {
                    promptName: session.promptName,
                    contentName: textPromptID,
                    type: "TEXT",
                    interactive: false,
                    role: "SYSTEM",
                    textInputConfiguration: DefaultTextConfiguration,
                },
            }
        });

        // Text input content
        this.addEventToSessionQueue(sessionId, {
            event: {
                textInput: {
                    promptName: session.promptName,
                    contentName: textPromptID,
                    content: systemPromptContent,
                },
            }
        });

        // Text content end
        this.addEventToSessionQueue(sessionId, {
            event: {
                contentEnd: {
                    promptName: session.promptName,
                    contentName: textPromptID,
                },
            }
        });
    }

    // public sendTextMessageEvent(sessionId: string, text: string): void {
    //     const session = this.activeSessions.get(sessionId);
    //     if (!session) return;

    //     const textInputID = crypto.randomUUID();

    //     // Text input start
    //     this.addEventToSessionQueue(sessionId, {
    //         event: {
    //             contentStart: {
    //                 promptName: session.promptName,
    //                 contentName: textInputID,
    //                 interactive: true,
    //                 type: "TEXT",
    //                 role: "USER",
    //                 textInputConfiguration: {
    //                     mediaType: "text/plain"
    //                 }
    //             }
    //         }
    //     });

    //     // Text input content
    //     this.addEventToSessionQueue(sessionId, {
    //         event: {
    //             textInput: {
    //                 promptName: session.promptName,
    //                 contentName: textInputID,
    //                 content: text
    //             }
    //         }
    //     });

    //     // Text content end
    //     this.addEventToSessionQueue(sessionId, {
    //         event: {
    //             contentEnd: {
    //                 promptName: session.promptName,
    //                 contentName: textInputID
    //             }
    //         }
    //     });
    // }

    public setupStartAudioEvent(
        sessionId: string,
        audioConfig: typeof DefaultAudioInputConfiguration = DefaultAudioInputConfiguration
    ): void {
        console.log(`Setting up startAudioContent event for session ${sessionId}...`);
        const session = this.activeSessions.get(sessionId);
        if (!session) return;

        console.log(`Using audio content ID: ${session.audioContentId}`);
        // Audio content start
        this.addEventToSessionQueue(sessionId, {
            event: {
                contentStart: {
                    promptName: session.promptName,
                    contentName: session.audioContentId,
                    type: "AUDIO",
                    interactive: true,
                    role: "USER",
                    audioInputConfiguration: {
                        audioType: "SPEECH",
                        mediaType: "audio/lpcm",
                        encoding: "base64",
                        sampleRateHertz: 16000,
                        sampleSizeBits: 16,
                        channelCount: 1
                    },
                }
            }
        });
        session.isAudioContentStartSent = true;
        session.isAudioContentActive = true;
        console.log(`Initial events setup complete for session ${sessionId}`);
    }

    // Stream an audio chunk for a session
    public async streamAudioChunk(sessionId: string, audioData: Buffer): Promise<void> {
        const session = this.activeSessions.get(sessionId);
        if (!session || !session.isActive) return;

        // Reactive Multi-Turn: If audio block is closed, open a new one before sending chunks
        if (!session.isAudioContentActive || !session.audioContentId) {
            session.audioContentId = randomUUID();
            console.log(`[MULTI-TURN] Opening new audio block ${session.audioContentId} on demand`);

            this.addEventToSessionQueue(sessionId, {
                event: {
                    contentStart: {
                        promptName: session.promptName,
                        contentName: session.audioContentId,
                        type: "AUDIO",
                        interactive: true,
                        role: "USER",
                        audioInputConfiguration: {
                            audioType: "SPEECH",
                            mediaType: "audio/lpcm",
                            encoding: "base64",
                            sampleRateHertz: 16000,
                            sampleSizeBits: 16,
                            channelCount: 1
                        },
                    }
                }
            });
            session.isAudioContentStartSent = true;
            session.isAudioContentActive = true;
        }

        // Convert audio to base64
        const base64Data = audioData.toString('base64');

        this.addEventToSessionQueue(sessionId, {
            event: {
                audioInput: {
                    promptName: session.promptName,
                    contentName: session.audioContentId,
                    content: base64Data
                },
            }
        });
    }

    // Send tool result back to the model
    private async sendToolResult(sessionId: string, toolUseId: string, result: any): Promise<void> {
        const session = this.activeSessions.get(sessionId);
        console.log("inside tool result")
        if (!session || !session.isActive) return;

        console.log(`Sending tool result for session ${sessionId}, tool use ID: ${toolUseId}`);
        const contentId = randomUUID();

        // Tool content start
        this.addEventToSessionQueue(sessionId, {
            event: {
                contentStart: {
                    promptName: session.promptName,
                    contentName: contentId,
                    interactive: false,
                    type: "TOOL",
                    role: "TOOL",
                    toolResultInputConfiguration: {
                        toolUseId: toolUseId,
                        type: "TEXT",
                        textInputConfiguration: {
                            mediaType: "text/plain"
                        }
                    }
                }
            }
        });

        // Tool content input
        const resultContent = typeof result === 'string' ? result : JSON.stringify(result);
        this.addEventToSessionQueue(sessionId, {
            event: {
                toolResult: {
                    promptName: session.promptName,
                    contentName: contentId,
                    content: resultContent
                }
            }
        });

        // Tool content end
        this.addEventToSessionQueue(sessionId, {
            event: {
                contentEnd: {
                    promptName: session.promptName,
                    contentName: contentId
                },
            }
        });

        console.log(`Tool result sent for session ${sessionId}`);
    }

    public async sendContentEnd(sessionId: string): Promise<void> {
        const session = this.activeSessions.get(sessionId);
        if (!session || !session.isAudioContentStartSent) return;

        await this.addEventToSessionQueue(sessionId, {
            event: {
                contentEnd: {
                    promptName: session.promptName,
                    contentName: session.audioContentId,
                },
            }
        });

        // Wait to ensure it's processed
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    public async sendPromptEnd(sessionId: string): Promise<void> {
        const session = this.activeSessions.get(sessionId);
        if (!session || !session.isPromptStartSent) return;

        this.addEventToSessionQueue(sessionId, {
            event: {
                promptEnd: {
                    promptName: session.promptName
                }
            }
        });

        // Wait to ensure it's processed
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    public async sendSessionEnd(sessionId: string): Promise<void> {
        const session = this.activeSessions.get(sessionId);
        if (!session) return;

        await this.addEventToSessionQueue(sessionId, {
            event: {
                sessionEnd: {}
            }
        });

        // Wait to ensure it's processed
        await new Promise(resolve => setTimeout(resolve, 300));

        // Now it's safe to clean up
        session.isActive = false;
        session.closeSignal.next();
        session.closeSignal.complete();
        this.activeSessions.delete(sessionId);
        this.sessionLastActivity.delete(sessionId);
        console.log(`Session ${sessionId} closed and removed from active sessions`);
    }

    // Register an event handler for a session
    public registerEventHandler(sessionId: string, eventType: string, handler: (data: any) => void): void {
        const session = this.activeSessions.get(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }
        session.responseHandlers.set(eventType, handler);
    }

    // Dispatch an event to registered handlers
    private dispatchEvent(sessionId: string, eventType: string, data: any): void {
        const session = this.activeSessions.get(sessionId);
        if (!session) return;

        const handler = session.responseHandlers.get(eventType);
        if (handler) {
            try {
                handler(data);
            } catch (e) {
                console.error(`Error in ${eventType} handler for session ${sessionId}:`, e);
            }
        }

        // Also dispatch to "any" handlers
        const anyHandler = session.responseHandlers.get('any');
        if (anyHandler) {
            try {
                anyHandler({ type: eventType, data });
            } catch (e) {
                console.error(`Error in 'any' handler for session ${sessionId}:`, e);
            }
        }
    }

    public async closeSession(sessionId: string): Promise<void> {
        if (this.sessionCleanupInProgress.has(sessionId)) {
            console.log(`Cleanup already in progress for session ${sessionId}, skipping`);
            return;
        }
        this.sessionCleanupInProgress.add(sessionId);
        try {
            console.log(`Starting close process for session ${sessionId}`);
            await this.sendContentEnd(sessionId);
            await this.sendPromptEnd(sessionId);
            await this.sendSessionEnd(sessionId);
            console.log(`Session ${sessionId} cleanup complete`);
        } catch (error) {
            console.error(`Error during closing sequence for session ${sessionId}:`, error);

            // Ensure cleanup happens even if there's an error
            const session = this.activeSessions.get(sessionId);
            if (session) {
                session.isActive = false;
                this.activeSessions.delete(sessionId);
                this.sessionLastActivity.delete(sessionId);
            }
        } finally {
            // Always clean up the tracking set
            this.sessionCleanupInProgress.delete(sessionId);
        }
    }

    // Same for forceCloseSession:
    public forceCloseSession(sessionId: string): void {
        if (this.sessionCleanupInProgress.has(sessionId) || !this.activeSessions.has(sessionId)) {
            console.log(`Session ${sessionId} already being cleaned up or not active`);
            return;
        }

        this.sessionCleanupInProgress.add(sessionId);
        try {
            const session = this.activeSessions.get(sessionId);
            if (!session) return;

            console.log(`Force closing session ${sessionId}`);

            // Immediately mark as inactive and clean up resources
            session.isActive = false;
            session.closeSignal.next();
            session.closeSignal.complete();
            this.activeSessions.delete(sessionId);
            this.sessionLastActivity.delete(sessionId);

            console.log(`Session ${sessionId} force closed`);
        } finally {
            this.sessionCleanupInProgress.delete(sessionId);
        }
    }

}