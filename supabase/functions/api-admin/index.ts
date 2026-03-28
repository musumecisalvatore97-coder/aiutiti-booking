
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
        const body = await req.json()
        const { action, password, date, query, offer } = body
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

        if (action === 'get_offer') {
            const { data: tenantData } = await adminSupabase.from('tenants').select('id').limit(1).single();
            if (!tenantData) throw new Error("No tenant found");

            const { data, error } = await adminSupabase
                .from('tenant_settings')
                .select('active_offer_text')
                .eq('tenant_id', tenantData.id)
                .maybeSingle();

            if (error) {
                console.error("DB Get Offer Error:", error);
                throw error;
            }

            // Fetch history
            const { data: historyData } = await adminSupabase
                .from('marketing_history')
                .select('promo_text')
                .eq('tenant_id', tenantData.id)
                .order('created_at', { ascending: false })
                .limit(10);

            return new Response(JSON.stringify({
                offer: data?.active_offer_text || "",
                history: historyData ? historyData.map(item => item.promo_text) : []
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        if (action === 'set_offer') {
            const { data: tenantData } = await adminSupabase.from('tenants').select('id').limit(1).single();
            if (!tenantData) throw new Error("No tenant found");

            // Use the RPC to update setting and save to history
            const { error } = await adminSupabase.rpc('admin_update_offer', {
                p_tenant_id: tenantData.id,
                p_offer_text: offer
            });

            if (error) {
                console.error("DB Set Offer Error:", error);
                throw error;
            }

            return new Response(JSON.stringify({ success: true, message: "Offer updated successfully" }), {
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
