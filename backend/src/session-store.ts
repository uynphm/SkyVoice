import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = path.join(__dirname, '../data');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

export interface ChatMessage {
    role: 'USER' | 'ASSISTANT' | 'SYSTEM';
    text: string;
    timestamp: string;
    metadata?: any;
}

export interface SessionRecord {
    chromeId: string;
    sessionId: string;
    status: 'ACTIVE' | 'COMPLETED' | 'PAUSED';
    history: ChatMessage[];
    createdAt: string;
    updatedAt: string;
    lastState?: any;
}

export class SessionStore {
    private sessions: Map<string, SessionRecord> = new Map();

    async init() {
        try {
            const data = await fs.readFile(SESSIONS_FILE, 'utf-8');
            const parsed = JSON.parse(data);
            Object.keys(parsed).forEach(chromeId => {
                this.sessions.set(chromeId, parsed[chromeId]);
            });
            console.log(`[SessionStore] Loaded ${this.sessions.size} sessions from disk.`);
        } catch (error) {
            console.log('[SessionStore] No existing sessions found, starting fresh.');
            await this.save();
        }
    }

    async getSession(chromeId: string): Promise<SessionRecord | null> {
        return this.sessions.get(chromeId) || null;
    }

    async saveSession(record: SessionRecord): Promise<void> {
        this.sessions.set(record.chromeId, {
            ...record,
            updatedAt: new Date().toISOString()
        });
        await this.save();
    }

    async addMessage(chromeId: string, message: ChatMessage): Promise<void> {
        const session = this.sessions.get(chromeId);
        if (session) {
            session.history.push(message);
            session.updatedAt = new Date().toISOString();
            await this.save();
        }
    }

    private async save() {
        const obj: Record<string, SessionRecord> = {};
        this.sessions.forEach((val, key) => {
            obj[key] = val;
        });
        await fs.writeFile(SESSIONS_FILE, JSON.stringify(obj, null, 2));
    }
}
