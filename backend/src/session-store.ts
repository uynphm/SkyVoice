import { supabase } from './supabase';

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
    
    async init() {
        console.log('[SessionStore] Initialized with Supabase backend.');
    }

    async getSession(chromeId: string): Promise<SessionRecord | null> {
        try {
            const { data, error } = await supabase
                .from('sessions')
                .select('*')
                .eq('chrome_id', chromeId)
                .single();

            if (error) {
                if (error.code === 'PGRST116') return null; // Not found
                console.error('[SessionStore] Error fetching session:', error);
                return null;
            }

            if (!data) return null;

            // Map DB snake_case to TS camelCase
            return {
                chromeId: data.chrome_id,
                sessionId: data.session_id,
                status: data.status,
                history: data.history || [],
                createdAt: data.created_at,
                updatedAt: data.updated_at,
                lastState: data.last_state
            };
        } catch (err) {
            console.error('[SessionStore] Unexpected error in getSession:', err);
            return null;
        }
    }

    async saveSession(record: SessionRecord): Promise<void> {
        try {
            const payload = {
                chrome_id: record.chromeId,
                session_id: record.sessionId,
                status: record.status,
                history: record.history,
                created_at: record.createdAt,
                updated_at: new Date().toISOString(),
                last_state: record.lastState
            };

            const { error } = await supabase
                .from('sessions')
                .upsert(payload, { onConflict: 'chrome_id' });

            if (error) {
                console.error('[SessionStore] Error saving session:', error);
                throw error;
            }
        } catch (err) {
            console.error('[SessionStore] Unexpected error in saveSession:', err);
        }
    }

    async addMessage(chromeId: string, message: ChatMessage): Promise<void> {
        try {
            // 1. Fetch current history
            const session = await this.getSession(chromeId);
            if (!session) {
                console.warn(`[SessionStore] Cannot add message: Session ${chromeId} not found.`);
                return;
            }

            // 2. Append new message
            const updatedHistory = [...session.history, message];

            // 3. Update DB
            const { error } = await supabase
                .from('sessions')
                .update({ 
                    history: updatedHistory,
                    updated_at: new Date().toISOString()
                })
                .eq('chrome_id', chromeId);

            if (error) {
                console.error('[SessionStore] Error adding message:', error);
            }
        } catch (err) {
            console.error('[SessionStore] Unexpected error in addMessage:', err);
        }
    }

    async addContentEndEvent(chromeId: string, eventData: any): Promise<void> {
        try {
            const payload = {
                chrome_id: chromeId,
                completion_id: eventData.completionId,
                content_id: eventData.contentId,
                prompt_name: eventData.promptName,
                session_id: eventData.sessionId,
                stop_reason: eventData.stopReason,
                type: eventData.type,
                created_at: new Date().toISOString()
            };

            const { error } = await supabase
                .from('content_end_events')
                .insert(payload);

            if (error) {
                console.error('[SessionStore] Error adding content end event:', error);
            }
        } catch (err) {
            console.error('[SessionStore] Unexpected error in addContentEndEvent:', err);
        }
    }
}
