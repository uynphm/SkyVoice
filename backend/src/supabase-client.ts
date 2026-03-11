
/**
 * Singleton Supabase client cho backend.
 * Import file này ở bất kỳ đâu cần dùng Supabase.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient {
    if (_client) return _client

    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !key) {
        throw new Error(
            '❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — check your .env file'
        )
    }

    _client = createClient(url, key, {
        auth: {
            // Service role key → bỏ qua RLS
            persistSession: false,
            autoRefreshToken: false,
        },
    })

    return _client
}