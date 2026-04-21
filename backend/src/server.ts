import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { NovaSonicBidirectionalStreamClient, StreamSession } from './client';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { dirname, join as pathJoin } from 'node:path';
import { SessionStore, SessionRecord } from './session-store';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TICKETMASTER_BASE = 'https://app.ticketmaster.com/discovery/v2';

type BookingField = 'concert_name' | 'concert_datetime' | 'num_tickets' | 'budget' | 'position_preference';
type BookingSlots = Partial<Record<BookingField, string>>;

const bookingStateBySocket = new Map<string, BookingSlots>();
const ticketSearchInProgress = new Map<string, boolean>();
const processedToolUseIdsBySocket = new Map<string, Set<string>>();

/** Remove all per-socket tracking state. */
function clearSocketState(socketId: string): void {
    socketSessions.delete(socketId);
    sessionStates.delete(socketId);
    cleanupInProgress.delete(socketId);
    bookingStateBySocket.delete(socketId);
    ticketSearchInProgress.delete(socketId);
    processedToolUseIdsBySocket.delete(socketId);
}

function getChromeId(socket: any): string {
    return socket?.handshake?.auth?.chromeId || socket.id;
}

function sanitizeString(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const cleaned = value.trim();
    return cleaned.length > 0 ? cleaned : undefined;
}

function extractBookingSlots(payload: any): BookingSlots {
    const data = payload?.data ?? {};
    const entities = data?.entities ?? payload?.entities ?? data ?? {};

    const concertName =
        sanitizeString(entities?.concert_name) ||
        sanitizeString(entities?.concertName) ||
        sanitizeString(entities?.name_of_concert) ||
        sanitizeString(entities?.event_name) ||
        sanitizeString(entities?.artist);

    const dateTime =
        sanitizeString(entities?.concert_datetime) ||
        sanitizeString(entities?.concertDateTime) ||
        sanitizeString(entities?.date_time) ||
        sanitizeString(entities?.datetime) ||
        sanitizeString(entities?.event_datetime) ||
        (() => {
            const date = sanitizeString(entities?.date);
            const time = sanitizeString(entities?.time);
            if (!date) return undefined;
            return time ? `${date} ${time}` : date;
        })();

    const budgetEach =
        sanitizeString(entities?.budget) ||
        sanitizeString(entities?.budget_each) ||
        sanitizeString(entities?.max_budget) ||
        sanitizeString(entities?.price_limit) ||
        sanitizeString(entities?.max_price);

    const numTickets =
        sanitizeString(entities?.num_tickets) ||
        sanitizeString(entities?.number_of_ticket) ||
        sanitizeString(entities?.ticket_count) ||
        sanitizeString(entities?.quantity);

    const positionPreference =
        sanitizeString(entities?.position_preference) ||
        sanitizeString(entities?.position_preferences) ||
        sanitizeString(entities?.seat_preference) ||
        sanitizeString(entities?.seatPreference);

    return {
        concert_name: concertName,
        concert_datetime: dateTime,
        num_tickets: numTickets,
        budget: budgetEach,
        position_preference: positionPreference,
    };
}

function mergeBookingSlots(previous: BookingSlots, next: BookingSlots): BookingSlots {
    return {
        concert_name: next.concert_name || previous.concert_name,
        concert_datetime: next.concert_datetime || previous.concert_datetime,
        num_tickets: next.num_tickets || previous.num_tickets,
        budget: next.budget || previous.budget,
        position_preference: next.position_preference || previous.position_preference,
    };
}

function getMissingFields(slots: BookingSlots): BookingField[] {
    const missing: BookingField[] = [];
    if (!sanitizeString(slots.concert_name)) missing.push('concert_name');
    const dateTime = sanitizeString(slots.concert_datetime);
    if (!dateTime || !hasTimeInfo(dateTime)) missing.push('concert_datetime');
    if (!sanitizeString(slots.num_tickets)) missing.push('num_tickets');
    if (!sanitizeString(slots.budget)) missing.push('budget');
    if (!sanitizeString(slots.position_preference)) missing.push('position_preference');
    return missing;
}

function hasTimeInfo(value: string): boolean {
    const lower = value.toLowerCase();
    if (/\b\d{1,2}:\d{2}\b/.test(lower)) return true;
    if (/\b\d{1,2}\s*(am|pm)\b/.test(lower)) return true;
    if (/\b(morning|afternoon|evening|night|tonight|noon|midnight)\b/.test(lower)) return true;
    return false;
}

export interface TicketResult {
    name: string;
    date: string;
    venue: string;
    city: string;
    priceMin?: number;
    priceMax?: number;
    url: string;
}

async function searchTickets(slots: BookingSlots): Promise<TicketResult[]> {
    const apiKey = process.env.TICKETMASTER_API_KEY;
    if (!apiKey) throw new Error('TICKETMASTER_API_KEY is not set in environment');

    const params = new URLSearchParams({
        apikey: apiKey,
        keyword: slots.concert_name || '',
        size: '5',
        sort: 'date,asc',
    });

    if (slots.concert_datetime) {
        // Parse a loose date hint — just attach as keyword if we can't parse it cleanly
        const dateHint = slots.concert_datetime.toLowerCase();
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        if (dateHint.includes('tomorrow')) {
            const d = tomorrow.toISOString().split('T')[0];
            params.set('startDateTime', `${d}T00:00:00Z`);
            params.set('endDateTime', `${d}T23:59:59Z`);
        }
    }

    const url = `${TICKETMASTER_BASE}/events.json?${params.toString()}`;
    console.log(`[Ticketmaster] GET ${url}`);

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Ticketmaster API error: ${res.status} ${res.statusText}`);

    const json = await res.json() as any;
    const events: any[] = json?._embedded?.events ?? [];

    return events.slice(0, 3).map((ev: any) => {
        const venue = ev._embedded?.venues?.[0];
        const priceRange = ev.priceRanges?.[0];
        return {
            name: ev.name,
            date: ev.dates?.start?.localDate ?? 'TBD',
            venue: venue?.name ?? 'Unknown venue',
            city: venue?.city?.name ?? 'Unknown city',
            priceMin: priceRange?.min,
            priceMax: priceRange?.max,
            url: ev.url,
        };
    });
}

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Create the AWS Bedrock client
if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.warn('⚠️ WARNING: AWS credentials (AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY) are NOT defined in environment variable or .env file');
}

const bedrockClient = new NovaSonicBidirectionalStreamClient({
    requestHandlerConfig: {
        maxConcurrentStreams: 10,
    },
    clientConfig: {
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
        }
    }
});


// Track active sessions per socket
const socketSessions = new Map<string, StreamSession>();
const sessionStore = new SessionStore();
await sessionStore.init();

async function ensureSessionRecord(chromeId: string, sessionId: string): Promise<void> {
    const existing = await sessionStore.getSession(chromeId);
    if (existing) return;
    await sessionStore.saveSession({
        chromeId,
        sessionId,
        status: 'ACTIVE',
        history: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    });
}

// Session states
enum SessionState {
    INITIALIZING = 'initializing',
    READY = 'ready',
    ACTIVE = 'active',
    CLOSED = 'closed'
}

const sessionStates = new Map<string, SessionState>();
const cleanupInProgress = new Map<string, boolean>();

// Periodically check for and close inactive sessions (every minute)
// Sessions with no activity for over 5 minutes will be force closed
setInterval(() => {
    console.log("Session cleanup check");
    const now = Date.now();

    // Check all active sessions
    bedrockClient.getActiveSessions().forEach(sessionId => {
        const lastActivity = bedrockClient.getLastActivityTime(sessionId);

        // If no activity for 5 minutes, force close
        if (now - lastActivity > 5 * 60 * 1000) {
            console.log(`Closing inactive session ${sessionId} after 5 minutes of inactivity`);
            try {
                bedrockClient.forceCloseSession(sessionId);
            } catch (error) {
                console.error(`Error force closing inactive session ${sessionId}:`, error);
            }
        }
    });
}, 60000);

// Serve static files from the public directory
app.use(express.static(pathJoin(__dirname, '../public')));

// Helper function to create and initialize a new session
async function createNewSession(socket: any): Promise<StreamSession> {
    const sessionId = socket.id;

    try {
        console.log(`Creating new session for client: ${sessionId}`);
        sessionStates.set(sessionId, SessionState.INITIALIZING);

        // Create session with the correct API
        const session = bedrockClient.createStreamSession(sessionId);

        // Set up event handlers
        setupSessionEventHandlers(session, socket);

        // Store the session (don't initiate AWS Bedrock connection yet)
        socketSessions.set(sessionId, session);
        sessionStates.set(sessionId, SessionState.READY);

        console.log(`Session ${sessionId} created and ready, stored in maps`);
        console.log(`Session map size: ${socketSessions.size}, States map size: ${sessionStates.size}`);
        console.log(`Stored session for ${sessionId}:`, !!socketSessions.get(sessionId));

        return session;
    } catch (error) {
        console.error(`Error creating session for ${sessionId}:`, error);
        sessionStates.set(sessionId, SessionState.CLOSED);
        throw error;
    }
}

// Helper function to set up event handlers for a session
function setupSessionEventHandlers(session: StreamSession, socket: any) {


    session.onEvent('usageEvent', (data) => {
        console.log('usageEvent:', data);
        socket.emit('usageEvent', data);
    });

    session.onEvent('completionStart', (data) => {
        console.log('completionStart:', data);
        socket.emit('completionStart', data);
    });

    session.onEvent('contentStart', (data) => {
        console.log('contentStart:', data);
        socket.emit('contentStart', data);
    });

    session.onEvent('textOutput', (data: any) => {
        console.log('Text output:', data);
        socket.emit('textOutput', data);
    });

    session.onEvent('transcript', async (data: any) => {
        console.log(`[${socket.id}] Transcript received from Bedrock: "${data.text}" (final=${!!data.final})`);
        socket.emit('transcript', data);

        if (data.final) {
            const chromeId = getChromeId(socket);
            await ensureSessionRecord(chromeId, socket.id);
            await sessionStore.addMessage(chromeId, {
                role: 'USER',
                text: data.text,
                timestamp: new Date().toISOString()
            });
        }
    });

    session.onEvent('audioOutput', (data) => {
        socket.emit('audioOutput', data);
    });

    // Record AI response when tool is used (which contains speech)
    session.onEvent('toolUse', async (data) => {
        console.log('Tool use detected:', data.toolName);
        socket.emit('toolUse', data);
        try {
            const toolUseId = sanitizeString(data?.toolUseId || data?.toolUseID || data?.id);
            if (toolUseId) {
                const processedIds = processedToolUseIdsBySocket.get(socket.id) || new Set<string>();
                if (processedIds.has(toolUseId)) {
                    console.log(`[${socket.id}] Duplicate toolUseId ${toolUseId} ignored.`);
                    return;
                }
                processedIds.add(toolUseId);
                // Keep memory bounded
                if (processedIds.size > 200) {
                    const oldIds = Array.from(processedIds).slice(0, 100);
                    oldIds.forEach((id) => processedIds.delete(id));
                }
                processedToolUseIdsBySocket.set(socket.id, processedIds);
            }

            const content = typeof data.content === 'string' ? JSON.parse(data.content) : data.content;
            if (content?.speech) {
                const chromeId = getChromeId(socket);
                await ensureSessionRecord(chromeId, socket.id);
                await sessionStore.addMessage(chromeId, {
                    role: 'ASSISTANT',
                    text: content.speech,
                    timestamp: new Date().toISOString()
                });
            }

            const extractedSlots = extractBookingSlots(content);
            const previousSlots = bookingStateBySocket.get(socket.id) || {};
            const mergedSlots = mergeBookingSlots(previousSlots, extractedSlots);
            bookingStateBySocket.set(socket.id, mergedSlots);

            const missingFields = getMissingFields(mergedSlots);
            socket.emit('bookingDataUpdate', {
                entities: mergedSlots,
                missingFields,
                ready: missingFields.length === 0
            });

            if (missingFields.length > 0) {
                console.log(`[${socket.id}] Waiting for missing booking fields: ${missingFields.join(', ')}`);
                return;
            }

            const nextStep = sanitizeString(content?.next_step);
            const intent = sanitizeString(content?.intent);
            const bookingReady = content?.data?.booking_ready === true;
            const declaredMissing = Array.isArray(content?.data?.missing_fields) ? content.data.missing_fields : [];
            const isExecuteAction = nextStep === 'execute_action';
            const isActionIntent = intent === 'start_booking_action' || intent === 'confirm_booking_info';
            const shouldSearch =
                bookingReady &&
                declaredMissing.length === 0 &&
                missingFields.length === 0 &&
                isActionIntent &&
                isExecuteAction;

            if (!shouldSearch) {
                console.log(`[${socket.id}] Booking data received but not ready for search yet.`);
                return;
            }

            if (ticketSearchInProgress.get(socket.id)) {
                console.log(`[${socket.id}] Ticket search already in progress, skipping duplicate trigger.`);
                return;
            }

            ticketSearchInProgress.set(socket.id, true);
            socket.emit('ticketSearchStatus', { status: 'searching', payload: mergedSlots });
            console.log(`[${socket.id}] All fields collected — querying Ticketmaster...`);

            try {
                const tickets = await searchTickets(mergedSlots);
                console.log(`[${socket.id}] Ticketmaster returned ${tickets.length} result(s).`);

                // Build a readable summary for Nova Sonic to read back
                let speechSummary: string;
                if (tickets.length === 0) {
                    speechSummary = `I searched Ticketmaster for ${mergedSlots.concert_name} and couldn't find any matching events. Would you like to try different dates or a different artist?`;
                } else {
                    const top = tickets[0];
                    const priceStr = top.priceMin != null
                        ? `starting at $${top.priceMin}`
                        : 'price not listed';
                    speechSummary = `I found ${tickets.length} event${tickets.length > 1 ? 's' : ''} for ${mergedSlots.concert_name}. The top result is ${top.name} on ${top.date} at ${top.venue} in ${top.city}, ${priceStr}. I'm sending the full list to your screen now.`;
                }

                socket.emit('ticketSearchStatus', { status: 'completed', results: tickets, summary: speechSummary });
                bookingStateBySocket.delete(socket.id);
            } catch (searchErr: any) {
                console.error(`[${socket.id}] Ticketmaster search failed:`, searchErr.message);
                socket.emit('ticketSearchStatus', { status: 'failed', error: searchErr.message });
            }
        } catch (e) {
            console.error(`[${socket.id}] Failed to process toolUse payload:`, e);
        } finally {
            ticketSearchInProgress.delete(socket.id);
        }
    });

    session.onEvent('toolResult', (data) => {
        console.log('Tool result received');
        socket.emit('toolResult', data);
    });

    session.onEvent('contentEnd', async (data) => {
        console.log('Content end received: ', data);
        socket.emit('contentEnd', data);

        try {
            const chromeId = getChromeId(socket);
            await ensureSessionRecord(chromeId, socket.id);
            await sessionStore.addContentEndEvent(chromeId, data);
        } catch (e) {
            console.error('Error saving contentEnd event:', e);
        }
    });

    session.onEvent('streamComplete', () => {
        console.log('Stream completed for client:', socket.id);
        socket.emit('streamComplete');
        sessionStates.set(socket.id, SessionState.CLOSED);
    });
}

// Socket.IO connection handler
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    // Don't create session immediately - wait for client to request it
    sessionStates.set(socket.id, SessionState.CLOSED);

    // Connection count logging (only set up once per connection)
    const connectionInterval = setInterval(() => {
        const connectionCount = Object.keys(io.sockets.sockets).length;
        console.log(`Active socket connections: ${connectionCount}`);
    }, 60000);

    // Handle session initialization request
    socket.on('initializeConnection', async (payloadOrCallback, maybeCallback) => {
        const callback = typeof payloadOrCallback === 'function' ? payloadOrCallback : maybeCallback;
        const payload = typeof payloadOrCallback === 'function' ? undefined : payloadOrCallback;
        try {
            const currentState = sessionStates.get(socket.id);
            console.log(`Initializing session for ${socket.id}, current state: ${currentState}`);

            // 0. Handle Persistence
            const chromeId = sanitizeString(payload?.chromeId) || getChromeId(socket);
            const existingRecord = await sessionStore.getSession(chromeId);

            if (existingRecord) {
                console.log(`[Session] Found existing session for ${chromeId}, sending history...`);
                socket.emit('sessionHistory', existingRecord.history);
            } else {
                await sessionStore.saveSession({
                    chromeId,
                    sessionId: socket.id,
                    status: 'ACTIVE',
                    history: [],
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                });
            }

            // If ACTIVE, just return success (microphone already streaming)

            // Clean up any stale session before creating a new one
            const existingSession = socketSessions.get(socket.id);
            if (existingSession) {
                console.log(`Cleaning up stale session for ${socket.id}`);
                try { bedrockClient.forceCloseSession(socket.id); } catch { }
                clearSocketState(socket.id);
            }

            await createNewSession(socket);

            // 1. Establish the AWS Bedrock connection
            console.log(`[${socket.id}] Starting AWS Bedrock connection...`);
            const streamPromise = bedrockClient.initiateBidirectionalStreaming(socket.id);

            // 2. Perform the atomic setup sequence
            console.log(`[${socket.id}] Performing atomic setup sequence (setupSessionAndPromptStart, setupSystemPrompt, setupStartAudio)...`);
            const session = socketSessions.get(socket.id);
            if (!session) {
                throw new Error(`Session not found after creation for ${socket.id}`);
            }
            await session.setupSessionAndPromptStart();
            console.log(`[${socket.id}] setupSessionAndPromptStart completed.`);
            await session.setupSystemPrompt();
            console.log(`[${socket.id}] setupSystemPrompt completed.`);
            await session.setupStartAudio();
            console.log(`[${socket.id}] setupStartAudio completed.`);

            // Start the stream but DON'T await it - it's a long-lived bidirectional stream
            // Awaiting it would block forever until the stream closes
            streamPromise.then(() => {
                console.log(`[${socket.id}] Stream completed.`);
                sessionStates.set(socket.id, SessionState.CLOSED);
            }).catch(err => {
                console.error(`[${socket.id}] Stream error:`, err.message);
                sessionStates.set(socket.id, SessionState.CLOSED);
                socket.emit('error', { message: 'Bedrock stream error', details: err.message });
            });

            // Give stream a moment to initiate then mark as ACTIVE
            await new Promise(resolve => setTimeout(resolve, 500));
            console.log(`[${socket.id}] AWS Bedrock bidirectional stream initiating.`);

            // 3. Update state to active
            sessionStates.set(socket.id, SessionState.ACTIVE);
            console.log(`[${socket.id}] Session ACTIVE. Audio streaming can begin.`);

            if (callback) callback({ success: true });

        } catch (error) {
            console.error('Error initializing session:', error);
            sessionStates.set(socket.id, SessionState.CLOSED);
            if (callback) callback({ success: false, error: error instanceof Error ? error.message : String(error) });
            socket.emit('error', {
                message: 'Failed to initialize session',
                details: error instanceof Error ? error.message : String(error)
            });
        }
    });

    // Handle starting a new chat (after stopping previous one)
    socket.on('startNewChat', async () => {
        try {
            const currentState = sessionStates.get(socket.id);
            console.log(`Starting new chat for ${socket.id}, current state: ${currentState}`);

            // Clean up existing session if any
            const existingSession = socketSessions.get(socket.id);
            if (existingSession && bedrockClient.isSessionActive(socket.id)) {
                console.log(`Cleaning up existing session for ${socket.id}`);
                try {
                    await existingSession.endAudioContent();
                    await existingSession.endPrompt();
                    await existingSession.close();
                } catch (cleanupError) {
                    console.error(`Error during cleanup for ${socket.id}:`, cleanupError);
                    bedrockClient.forceCloseSession(socket.id);
                }
                socketSessions.delete(socket.id);
            }
            clearSocketState(socket.id);

            // Create new session
            await createNewSession(socket);
        } catch (error) {
            console.error('Error starting new chat:', error);
            socket.emit('error', {
                message: 'Failed to start new chat',
                details: error instanceof Error ? error.message : String(error)
            });
        }
    });

    // Simple echo handler for frontend diagnostics
    socket.on('ping', (callback: any) => {
        console.log(`[PING] from ${socket.id}`);
        if (typeof callback === 'function') callback({ pong: true });
        else socket.emit('pong');
    });

    // Audio input handler with session validation
    socket.on('audioInput', async (audioData) => {
        try {
            const session = socketSessions.get(socket.id);
            const currentState = sessionStates.get(socket.id);

            // console.log(`Audio input received for ${socket.id}, session exists: ${!!session}, state: ${currentState}`);

            if (!session || currentState !== SessionState.ACTIVE) {
                // Only log if we have a session but it's not active yet
                if (session && currentState !== SessionState.ACTIVE) {
                    // console.log(`Audio dropped: session is still ${currentState}`);
                }
                return;
            }

            // Convert base64 string to Buffer
            const audioBuffer = typeof audioData === 'string'
                ? Buffer.from(audioData, 'base64')
                : Buffer.from(audioData);

            // 🔍 DEBUG: Check volume level
            let maxVal = 0;
            for (let i = 0; i < audioBuffer.length; i += 2) {
                const sample = audioBuffer.readInt16LE(i);
                maxVal = Math.max(maxVal, Math.abs(sample));
            }
            if (maxVal > 10) {
                console.log(`Streaming ${audioBuffer.length} bytes for ${socket.id} (Peak: ${maxVal})`);
            } else {
                // Keep log quiet for silence
            }

            // Stream the audio
            await session.streamAudio(audioBuffer);

        } catch (error) {
            console.error('Error processing audio:', error);
            socket.emit('error', {
                message: 'Error processing audio',
                details: error instanceof Error ? error.message : String(error)
            });
        }
    });

    socket.on('promptStart', async () => {
        try {
            const session = socketSessions.get(socket.id);
            const currentState = sessionStates.get(socket.id);
            console.log(`Prompt start received for ${socket.id}, session exists: ${!!session}, state: ${currentState}`);

            if (!session) {
                console.error(`No session found for promptStart: ${socket.id}`);
                socket.emit('error', { message: 'No active session for prompt start' });
                return;
            }

            await session.setupSessionAndPromptStart();
            await session.setupSystemPrompt(); // Add system prompt as FIRST content
            console.log(`Prompt start and system prompt setup for ${socket.id}`);
        } catch (error) {
            console.error('Error processing prompt start:', error);
            socket.emit('error', {
                message: 'Error processing prompt start',
                details: error instanceof Error ? error.message : String(error)
            });
        }
    });

    socket.on('systemPrompt', async (data) => {
        try {
            const session = socketSessions.get(socket.id);
            const currentState = sessionStates.get(socket.id);
            console.log(`System prompt received for ${socket.id}, session exists: ${!!session}, state: ${currentState}`);

            if (!session) {
                console.error(`No session found for systemPrompt: ${socket.id}`);
                socket.emit('error', { message: 'No active session for system prompt' });
                return;
            }

            await session.setupSystemPrompt(undefined, data);
            console.log(`System prompt completed for ${socket.id}`);
        } catch (error) {
            console.error('Error processing system prompt:', error);
            socket.emit('error', {
                message: 'Error processing system prompt',
                details: error instanceof Error ? error.message : String(error)
            });
        }
    });

    socket.on('audioStart', async (data) => {
        try {
            const session = socketSessions.get(socket.id);
            const currentState = sessionStates.get(socket.id);
            console.log(`Audio start received for ${socket.id}, session exists: ${!!session}, state: ${currentState}`);

            if (!session) {
                console.error(`No session found for audioStart: ${socket.id}`);
                socket.emit('error', { message: 'No active session for audio start' });
                return;
            }

            // Set up audio configuration
            await session.setupStartAudio();
            console.log(`Audio start setup completed for ${socket.id}`);

            // Emit confirmation that session is fully ready for audio
            socket.emit('audioReady');
        } catch (error) {
            console.error('Error processing audio start:', error);
            sessionStates.set(socket.id, SessionState.CLOSED);
            socket.emit('error', {
                message: 'Error processing audio start',
                details: error instanceof Error ? error.message : String(error)
            });
        }
    });

    socket.on('stopAudio', async () => {
        try {
            const session = socketSessions.get(socket.id);
            if (!session || cleanupInProgress.get(socket.id)) {
                console.log('No active session to stop or cleanup already in progress');
                return;
            }

            // Immediately set session state to CLOSED to stop processing incoming audio chunks
            sessionStates.set(socket.id, SessionState.CLOSED);

            console.log('Stop audio requested, beginning proper shutdown sequence');
            cleanupInProgress.set(socket.id, true);

            // Chain the closing sequence with timeout protection
            const cleanupPromise = Promise.race([
                (async () => {
                    await session.endAudioContent();
                    await session.endPrompt();
                    await session.close();
                    console.log('Session cleanup complete');
                })(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Session cleanup timeout')), 5000)
                )
            ]);

            await cleanupPromise;

            // Remove from tracking
            clearSocketState(socket.id);

            // Notify client that session is closed and ready for new chat
            socket.emit('sessionClosed');

        } catch (error) {
            console.error('Error processing streaming end events:', error);

            // Force cleanup on error
            try {
                bedrockClient.forceCloseSession(socket.id);
                clearSocketState(socket.id);
            } catch (forceError) {
                console.error('Error during force cleanup:', forceError);
            }

            socket.emit('error', {
                message: 'Error processing streaming end events',
                details: error instanceof Error ? error.message : String(error)
            });
        }
    });

    // Handle disconnection
    socket.on('disconnect', async () => {
        console.log('Client disconnected abruptly:', socket.id);

        // Clear the connection interval
        clearInterval(connectionInterval);

        const session = socketSessions.get(socket.id);
        const sessionId = socket.id;

        if (session && bedrockClient.isSessionActive(sessionId) && !cleanupInProgress.get(socket.id)) {
            try {
                console.log(`Beginning cleanup for abruptly disconnected session: ${socket.id}`);
                cleanupInProgress.set(socket.id, true);

                // Add explicit timeouts to avoid hanging promises
                const cleanupPromise = Promise.race([
                    (async () => {
                        await session.endAudioContent();
                        await session.endPrompt();
                        await session.close();
                    })(),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Session cleanup timeout')), 3000)
                    )
                ]);

                await cleanupPromise;
                console.log(`Successfully cleaned up session after abrupt disconnect: ${socket.id}`);
            } catch (error) {
                console.error(`Error cleaning up session after disconnect: ${socket.id}`, error);
                try {
                    bedrockClient.forceCloseSession(sessionId);
                    console.log(`Force closed session: ${sessionId}`);
                } catch (e) {
                    console.error(`Failed even force close for session: ${sessionId}`, e);
                }
            }
        }

        // Clean up tracking maps
        clearSocketState(socket.id);

        console.log(`Cleanup complete for disconnected client: ${socket.id}`);
    });
});

// Health check endpoint
app.get('/health', (_req, res) => {
    const activeSessions = bedrockClient.getActiveSessions().length;
    const socketConnections = Object.keys(io.sockets.sockets).length;

    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        activeSessions,
        socketConnections
    });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser to access the application`);
});

process.on('SIGINT', async () => {
    console.log('Shutting down server...');

    const forceExitTimer = setTimeout(() => {
        console.error('Forcing server shutdown after timeout');
        process.exit(1);
    }, 5000);

    try {
        // First close Socket.IO server which manages WebSocket connections
        await new Promise(resolve => io.close(resolve));
        console.log('Socket.IO server closed');

        // Then close all active sessions
        const activeSessions = bedrockClient.getActiveSessions();
        console.log(`Closing ${activeSessions.length} active sessions...`);

        await Promise.all(activeSessions.map(async (sessionId) => {
            if (cleanupInProgress.get(sessionId)) {
                console.log(`Skipping close for ${sessionId} (cleanup already in progress)`);
                return;
            }
            try {
                await bedrockClient.closeSession(sessionId);
                console.log(`Closed session ${sessionId} during shutdown`);
            } catch (error) {
                console.error(`Error closing session ${sessionId} during shutdown:`, error);
                bedrockClient.forceCloseSession(sessionId);
            }
        }));

        // Now close the HTTP server with a promise
        await new Promise(resolve => server.close(resolve));
        clearTimeout(forceExitTimer);
        console.log('Server shut down');
        process.exit(0);
    } catch (error) {
        console.error('Error during server shutdown:', error);
        process.exit(1);
    }
});