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
        const { action, password, payload } = await req.json()

        // MVP Security: Shared Password
        if (password !== 'admin123') {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // --- SHIFT MANAGEMENT ---

        if (action === 'get_active_shift') {
            // For MVP, we just pick the first tenant if not specified (or hardcode one if we had it)
            // We need a tenant_id. Let's assume we fetch the first one or pass it.
            // For now, let's fetch the first tenant available.
            const { data: tenants } = await supabase.from('tenants').select('id').limit(1);
            if (!tenants || tenants.length === 0) {
                // Create default tenant if none exists
                const { data: newTenant, error } = await supabase.from('tenants').insert({ name: 'Default Restaurant' }).select().single();
                if (error) throw error;

                // Now call RPC
                const { data: rpcData, error: rpcError } = await supabase.rpc('get_active_shift', { p_tenant_id: newTenant.id });
                if (rpcError) throw rpcError;
                return new Response(JSON.stringify(rpcData), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
            }

            const tenantId = tenants[0].id;
            const { data, error } = await supabase.rpc('get_active_shift', { p_tenant_id: tenantId });
            if (error) throw error;

            // Inject tenant_id into response for frontend storage
            const responseData = { ...data, tenant_id: tenantId };

            return new Response(JSON.stringify(responseData), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        if (action === 'open_shift') {
            const { tenant_id } = payload;
            const { data, error } = await supabase.rpc('open_shift', { p_tenant_id: tenant_id });
            if (error) throw error;
            return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        if (action === 'close_shift') {
            const { shift_id, actual_cash, notes } = payload;
            const { data, error } = await supabase.rpc('close_shift', {
                p_shift_id: shift_id,
                p_actual_cash: actual_cash,
                p_notes: notes
            });
            if (error) throw error;
            return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // --- TABLE MANAGEMENT ---

        if (action === 'get_floor_plan') {
            const { tenant_id, shift_id } = payload;
            const { data, error } = await supabase.rpc('get_floor_state', {
                p_tenant_id: tenant_id,
                p_shift_id: shift_id
            });
            if (error) throw error;
            return new Response(JSON.stringify({ tables: data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        if (action === 'open_table') {
            const { table_id, shift_id, pax } = payload;
            const { data, error } = await supabase.rpc('open_table_session', {
                p_table_id: table_id,
                p_shift_id: shift_id,
                p_pax: pax || 2
            });
            if (error) throw error;
            return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        if (action === 'close_table') {
            const { table_id, shift_id, actual_amount } = payload;
            const { data, error } = await supabase.rpc('close_table_session', {
                p_table_id: table_id,
                p_shift_id: shift_id,
                p_actual_amount: actual_amount || 0
            });
            if (error) throw error;
            return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // --- RESERVATIONS ---

        if (action === 'get_todays_reservations') {
            const { tenant_id } = payload;
            const { data, error } = await supabase.rpc('get_todays_reservations', {
                p_tenant_id: tenant_id
            });
            if (error) throw error;
            return new Response(JSON.stringify({ reservations: data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
})
