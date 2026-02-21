
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { action, password, date, query } = await req.json()
        console.log(`DEBUG ADMIN: Action=${action} Date=${date} Query=${query}`);

        // Simple Auth Check (Server-side)
        if (password !== 'admin123') {
            return new Response(JSON.stringify({ error: 'Unauthorized: invalid password' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        const adminSupabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        if (action === 'list_reservations') {
            let queryBuilder = adminSupabase
                .from('reservations')
                .select('*')
                .order('start_at', { ascending: true }); // Ascending for agenda (earliest first)

            // Date Filter (Agenda View)
            if (date) {
                // Filter strictly for that day (UTC handling might be tricky, assuming inputs are YYYY-MM-DD)
                // We'll use ISO string comparison for specific day
                const startOfDay = `${date}T00:00:00`;
                const endOfDay = `${date}T23:59:59`;
                queryBuilder = queryBuilder.gte('start_at', startOfDay).lte('start_at', endOfDay);
            } else {
                // Default: Show upcoming (from today) for overview
                queryBuilder = queryBuilder.gte('start_at', new Date().toISOString().split('T')[0]);
            }

            const { data, error } = await queryBuilder.limit(50);

            if (error) {
                console.error("DB List Error:", error);
                // Fallback for missing table
                if (error.code === '42P01') {
                    const { data: pending } = await adminSupabase.from('pending_reservations').select('*').limit(10);
                    return new Response(JSON.stringify({ reservations: pending || [], note: "Fallback (No Table)" }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
                }
                throw error;
            }

            return new Response(JSON.stringify({ reservations: data }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        if (action === 'search_reservations') {
            if (!query || query.length < 2) {
                return new Response(JSON.stringify({ reservations: [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }

            // Search in Name OR Phone
            // Syntax: .or(`customer_name.ilike.%${query}%,phone.ilike.%${query}%`)
            const { data, error } = await adminSupabase
                .from('reservations')
                .select('*')
                .or(`customer_name.ilike.%${query}%,phone.ilike.%${query}%`)
                .order('start_at', { ascending: false }) // Show newest first for history
                .limit(50);

            if (error) {
                console.error("DB Search Error:", error);
                throw error;
            }

            return new Response(JSON.stringify({ reservations: data }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error) {
        console.error("Global Admin Error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
})
