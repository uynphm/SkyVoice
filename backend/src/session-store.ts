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

// ── Supabase client (lazy init) ───────────────────────────────────────────────
let _supabase: any = null;
async function getSupabase() {
    if (_supabase) return _supabase;
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    const { createClient } = await import('@supabase/supabase-js');
    _supabase = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false }
    });
    return _supabase;
}

export class SessionStore {
    private sessions: Map<string, SessionRecord> = new Map();
    private useSupabase = false;

    async init() {
        const sb = await getSupabase();
        if (sb) {
            this.useSupabase = true;
            console.log('[SessionStore] ✅ Supabase backend ready.');
            return;
        }
        console.log('[SessionStore] ⚠️  Supabase not configured — using local JSON file.');
        try {
            await fs.mkdir(DATA_DIR, { recursive: true });
            const data = await fs.readFile(SESSIONS_FILE, 'utf-8');
            const parsed = JSON.parse(data);
            Object.keys(parsed).forEach(k => this.sessions.set(k, parsed[k]));
            console.log(`[SessionStore] Loaded ${this.sessions.size} sessions from disk.`);
        } catch {
            console.log('[SessionStore] No existing sessions — starting fresh.');
            await this.persistFile();
        }
    }

    async getSession(chromeId: string): Promise<SessionRecord | null> {
        if (this.useSupabase) return this.sbGetSession(chromeId);
        return this.sessions.get(chromeId) || null;
    }

    async saveSession(record: SessionRecord): Promise<void> {
        if (this.useSupabase) return this.sbSaveSession(record);
        this.sessions.set(record.chromeId, { ...record, updatedAt: new Date().toISOString() });
        await this.persistFile();
    }

    async addMessage(chromeId: string, message: ChatMessage): Promise<void> {
        if (this.useSupabase) return this.sbAddMessage(chromeId, message);
        const s = this.sessions.get(chromeId);
        if (s) {
            s.history.push(message);
            s.updatedAt = new Date().toISOString();
            await this.persistFile();
        }
    }

    private async persistFile() {
        const obj: Record<string, SessionRecord> = {};
        this.sessions.forEach((v, k) => { obj[k] = v; });
        await fs.mkdir(DATA_DIR, { recursive: true });
        await fs.writeFile(SESSIONS_FILE, JSON.stringify(obj, null, 2));
    }

    // ── Supabase implementations ──────────────────────────────────────────────
    private async sbGetSession(chromeId: string): Promise<SessionRecord | null> {
        const sb = await getSupabase();
        const { data: session } = await sb
            .from('sessions').select('*')
            .eq('chrome_id', chromeId)
            .order('created_at', { ascending: false })
            .limit(1).single();
        if (!session) return null;
        const { data: msgs } = await sb
            .from('messages').select('*')
            .eq('session_id', session.id)
            .order('created_at', { ascending: true });
        return {
            chromeId: session.chrome_id,
            sessionId: session.id,
            status: session.status,
            history: (msgs || []).map((m: any) => ({
                role: m.role, text: m.text,
                timestamp: m.created_at, metadata: m.metadata
            })),
            createdAt: session.created_at,
            updatedAt: session.updated_at,
            lastState: session.preferences,
        };
    }

    private async sbSaveSession(record: SessionRecord): Promise<void> {
        const sb = await getSupabase();
        const { data: ex } = await sb
            .from('sessions').select('id')
            .eq('chrome_id', record.chromeId).limit(1).single();
        if (ex) {
            await sb.from('sessions')
                .update({ status: record.status, preferences: record.lastState || {} })
                .eq('id', ex.id);
        } else {
            await sb.from('sessions').insert({
                chrome_id: record.chromeId,
                status: record.status,
                preferences: record.lastState || {}
            });
        }
    }

    private async sbAddMessage(chromeId: string, message: ChatMessage): Promise<void> {
        const sb = await getSupabase();
        const { data: session } = await sb
            .from('sessions').select('id')
            .eq('chrome_id', chromeId).limit(1).single();
        if (!session) return;
        await sb.from('messages').insert({
            session_id: session.id,
            role: message.role,
            text: message.text,
            metadata: message.metadata || {}
        });
    }
}