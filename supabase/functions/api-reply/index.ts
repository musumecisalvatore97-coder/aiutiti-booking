
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { fromZonedTime, toZonedTime } from 'npm:date-fns-tz@3.1.3';
import { addDays, parse, addHours, setHours, setMinutes, startOfDay, format } from 'npm:date-fns@4.1.0';

// Types
interface ParsingResult {
    intent: 'bho' | 'upsert' | 'confirm' | 'cancel' | 'availability';
    date: string | null;  // YYYY-MM-DD
    time: string | null;  // HH:MM
    people: number | null;
    customer_name: string | null;
    phone: string | null;
    confidence: number;
    reply?: string;
    start_at?: string;
    party_size?: number;
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// --- 1. Robust Heuristic Parser (Mock LLM) ---
// Handles people, date (relative), time (loose), name, phone
// --- 1. Robust AI Parser (OpenAI) ---
async function parseMessageOpenAI(text: string, today: string, timezone: string, apiKey: string): Promise<ParsingResult> {
    const systemPrompt = `
    You are a helpful restaurant booking assistant.
    Today is ${today} (Timezone: ${timezone}).
    
    Your goal is to extract booking details from the user's message.
    Return a JSON object with the following fields:
    - intent: "upsert" (if user wants to book/modify), "cancel" (if user wants to cancel), "confirm" (if user confirms), "availability" (if asking for availability), "bho" (if unclear/chitchat).
    - date: YYYY-MM-DD (Calculate relative dates like "next friday" based on today). If not specified, null.
    - time: HH:MM (24h format). If not specified, null.
    - people: number (party size). If not specified, null.
    - customer_name: string (if provided).
    - phone: string (if provided).
    - reply: (Optional) A short, friendly, natural language reply in Italian asking for missing details (e.g. "Per quante persone?", "A che ora?"). only if intent is 'upsert' and data is missing.
    - confidence: number (0.0 to 1.0).

    Rules:
    - If the user says "venerdì", assume the *upcoming* Friday.
    - If the user says "domani", it is today + 1 day.
    - If the user provides a name like "sono Mario", extract "Mario".
    - If the user provides just a name (e.g., "Carmelo", "Giulia"), treat it as intent "upsert" with customer_name set.
    - If the user provides a phone number, extract it.
    - If the user says "confermo", "si", "si grazie", "va bene", "ok", intent is "confirm".
    - If the user says "disdico", "annulla", intent is "cancel".
    - If the user says "ciao", "buonasera", "salve", intent is "bho" and reply "Ciao! Vuoi prenotare un tavolo? Dimmi per quante persone e quando.".
    - If the user input is short and looks like a name or data (e.g. "4 persone", "ore 21"), treat as intent "upsert".
    - ALWAYS provide a 'reply' field. If intent is 'bho', the reply MUST be a helpful question to guide the user.
    `;

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o', // Or gpt-3.5-turbo if 4o is not available
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: text }
                ],
                temperature: 0.0,
                response_format: { type: "json_object" }
            })
        });

        if (!response.ok) {
            console.error("OpenAI Error:", await response.text());
            throw new Error("OpenAI API Error");
        }

        const data = await response.json();
        const content = data.choices[0].message.content;
        return JSON.parse(content);
    } catch (e) {
        console.error("AI Parse failed, falling back to basic heuristic (limited):", e);
        // Fallback: minimal heuristic to avoid total crash
        return {
            intent: 'bho',
            date: null,
            time: null,
            people: null,
            customer_name: null,
            phone: null,
            confidence: 0,
            reply: "Scusa, ho avuto un problema tecnico momentaneo. Riprova più tardi."
        };
    }
}


// --- 2. Timezone Helper ---
function parseToIso(dateStr: string | null, timeStr: string | null, timezone: string): string | null {
    if (!dateStr || !timeStr) return null;
    try {
        const combined = `${dateStr} ${timeStr}`;
        const localDate = parse(combined, 'yyyy-MM-dd HH:mm', new Date());
        if (isNaN(localDate.getTime())) return null;
        const utcDate = fromZonedTime(localDate, timezone);
        return utcDate.toISOString();
    } catch (e) {
        return null;
    }
}


// --- 3. Notification Helpers ---
async function sendTelegramMessage(text: string) {
    const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const chatId = Deno.env.get('TELEGRAM_CHAT_ID');

    if (!token || !chatId) {
        console.error("Missing Telegram Config");
        return;
    }

    try {
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: text,
                parse_mode: 'Markdown'
            })
        });
        if (!resp.ok) {
            console.error("Telegram Error:", await resp.text());
        }
    } catch (e) {
        console.error("Telegram Exception:", e);
    }
}

// --- Serve Handler ---
Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const body = await req.json();
        const { message, session_id, chat_id, source } = body;

        // Initialize Supabase Clients
        // Admin client is REQUIRED for service_role access to RLS-protected tables
        const adminSupabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // 1. Config & State
        const { data: configData } = await adminSupabase.from('app_config').select('value').eq('key', 'timezone').single();
        const timezone = configData?.value || 'Europe/Rome';

        // Normalize Inputs
        const cleanSource = (source || 'web').trim().toLowerCase();
        const cleanSessionId = session_id ? session_id.trim() : undefined;
        let cleanChatId = chat_id ? chat_id.trim() : undefined;

        if (cleanSource === 'web' && cleanSessionId) {
            cleanChatId = cleanSessionId; // Web uses session_id as chat_id
        }

        // 2. Parse Intent (Robust AI)
        const openAiKey = Deno.env.get('OPENAI_API_KEY') ?? '';

        if (!openAiKey) {
            console.error("Missing OPENAI_API_KEY");
            return new Response(JSON.stringify({ reply: "Errore configurazione server: Manca API Key." }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Fix: Force 'today' to be the Timezone-aware local time string for the AI
        // This prevents the AI from thinking it's "Yesterday" if server is UTC and it's late night
        // 'today' variable in parseMessageOpenAI signature is strictly a Date object, but we want to pass a string description.
        // Let's modify the signature of parseMessageOpenAI effectively or pass the adjusted date.
        // Actually, let's just calculate the local date string here and pass it.
        const now = new Date();
        const localDate = toZonedTime(now, timezone); // date-fns-tz
        // We pass localDate (Date object representing local time) to the function. 
        // NOTE: The function parseMessageOpenAI takes a Date and calls .toISOString(). 
        // If we pass a "shifted" Date, toISOString() will trigger UTC conversion again which might be confusing.
        // BETTER APPROACH: Pass the formatted string directly to the prompt inside the function.
        // Let's assume we change `parseMessageOpenAI` to take `dateTimeStr` instead of `Date`.
        // For now, let's format it here and update the function call.

        const localDateTimeStr = format(localDate, "yyyy-MM-dd HH:mm"); // e.g. 2026-02-17 18:40
        const result = await parseMessageOpenAI(message || '', localDateTimeStr, timezone, openAiKey);

        // If AI generated a direct reply for missing info (e.g. "Per quando?"), use it as default.
        let replyText = result.reply || "Non ho capito 😅 Dimmi per quante persone e a che ora vuoi prenotare.";

        // 3. Format Date for RPC
        let p_start_at = undefined;
        if (result.date && result.time) {
            const iso = parseToIso(result.date, result.time, timezone);
            if (iso) p_start_at = iso;
        }

        // --- LOGIC FLOW ---

        if (result.intent === 'upsert' || result.intent === 'availability') {

            // Construct Payload
            const rpcPayload: any = {
                p_chat_id: cleanChatId,
                p_source: cleanSource,
                p_session_id: cleanSessionId,
                p_customer_name: result.customer_name, // Can be null
                p_phone: result.phone // Can be null
            };

            // Add extracted core params if available
            if (result.people) rpcPayload.p_party_size = result.people;
            if (p_start_at) rpcPayload.p_start_at = p_start_at;

            // Call Upsert (ADMIN)
            let { data: pendingRowRaw, error } = await adminSupabase.rpc('web_upsert_pending', rpcPayload);

            // Normalize result (handle array vs object)
            let pendingRow = pendingRowRaw;
            if (Array.isArray(pendingRowRaw)) {
                pendingRow = pendingRowRaw.length > 0 ? pendingRowRaw[0] : null;
            }

            console.log("DEBUG: Pending Row from DB:", JSON.stringify(pendingRow));


            if (error) {
                console.error("Upsert Error", error);
                replyText = "Errore tecnico (DB): " + (error.message || JSON.stringify(error));
            } else if (!pendingRow || !pendingRow.pending_id) {
                // If returns null or empty object, we didn't find/create row.
                // Session lost or expired or invalid params.

                // If AI already gave a good reply (e.g. asking for missing fields), use it.
                // Otherwise fallback to generic.
                if (!result.reply) {
                    if (!result.people) replyText = "Per quante persone?";
                    else if (!result.time) replyText = "A che ora?";
                    else replyText = "Non riesco a creare la prenotazione. Riprova indicando 'tavolo per X alle Y'.";
                }
            } else {
                // We have a pending row. Check state.
                if (pendingRow.assigned_option_id) {
                    // Have Option
                    if (!pendingRow.customer_name) {
                        replyText = "Disponibilità confermata! A che nome prenoto?";
                    } else if (!pendingRow.phone) {
                        replyText = `Grazie ${pendingRow.customer_name}, mi lasci un recapito telefonico?`;
                    } else {
                        // Make it clear we have the data
                        replyText = `Tutto pronto! Confermi per ${pendingRow.party_size} persone a nome ${pendingRow.customer_name}?`;
                    }
                } else {
                    // No Option (Full)
                    replyText = "Non ho disponibilità per quella data/ora. Prova a cambiare orario.";
                }
            }

        } else if (result.intent === 'confirm') {
            // CONFIRM FLOW
            const { data: confirmData, error: confirmError } = await adminSupabase.rpc('web_confirm', {
                p_chat_id: cleanChatId,
                p_source: cleanSource,
                p_session_id: cleanSessionId
            });

            if (confirmError) {
                console.error("Confirm RPC Error", confirmError);
                replyText = "Si è verificato un errore tecnico. Riprova più tardi.";
            } else {
                const status = confirmData.status;
                const reason = confirmData.reason;

                if (status === 'OK') {
                    replyText = `Prenotazione Confermata! Numero prenotazione: ${confirmData.reservation_id}`;

                    // --- ADMIN NOTIFICATION ---
                    console.log(`[NOTIFY] Sending Telegram for ID: ${confirmData.reservation_id}`);

                    // Fallback: If `api-reply` is used with an older RPC that doesn't return details, fetch them.
                    let notifyName = confirmData.customer_name;
                    let notifyPhone = confirmData.phone;
                    let notifySize = confirmData.party_size;
                    let notifyStart = confirmData.start_at;

                    if (!notifyName || !notifySize || !notifyStart) {
                        try {
                            console.log("DEBUG: Missing data in confirm response, fetching from DB...");
                            // Add a small delay to ensure DB propagation if using eventual consistency (unlikely in single Node but safe)
                            await new Promise(r => setTimeout(r, 500));

                            const { data: resRow, error: fetchError } = await adminSupabase
                                .from('reservations')
                                .select('customer_name, phone, party_size, start_at')
                                .eq('reservation_id', confirmData.reservation_id)
                                .single();

                            if (fetchError) {
                                console.error("Error fetching reservation details:", fetchError);
                            } else if (resRow) {
                                console.log("DEBUG: Fetched data:", JSON.stringify(resRow));
                                notifyName = resRow.customer_name;
                                notifyPhone = resRow.phone;
                                notifySize = resRow.party_size;
                                notifyStart = resRow.start_at
                            }
                        } catch (e) {
                            console.error("Error fetching reservation details for notification:", e);
                        }
                    }

                    // Don't await strictly if you want speed, but for reliability we await here or use Promise.allSettled logic elsewhere
                    // Simple awaiting is fine for this traffic volume.
                    // Format Date for Telegram: dd/MM/yy ore HH:mm
                    let formattedDate = notifyStart;
                    try {
                        if (notifyStart) {
                            const dateObj = new Date(notifyStart);
                            const zonedDate = toZonedTime(dateObj, timezone);
                            formattedDate = format(zonedDate, "dd/MM/yy 'ore' HH:mm");
                        }
                    } catch (e) {
                        console.error("Error formatting date:", e);
                    }

                    const appUrl = Deno.env.get('APP_URL') || 'http://localhost:5173';
                    const msg = `🔔 *Nuova Prenotazione!* 🔔\n\n🆔 ID: \`${confirmData.reservation_id}\`\n👤 Nome: *${notifyName || 'N/A'}*\n👥 Persone: *${notifySize}*\n📅 Quando: *${formattedDate}*\n📞 Tel: \`${notifyPhone || 'N/A'}\`\n\n👉 [Apri Dashboard](${appUrl}/#admin)`;

                    await sendTelegramMessage(msg);

                } else if (reason === 'NO_PENDING_FOUND') {
                    replyText = "Non ho trovato nessuna prenotazione in sospeso da confermare.";
                } else if (reason === 'MISSING_ASSIGNMENT') {
                    replyText = "Mancano dei dati. Per quando vuoi prenotare?";
                } else if (reason === 'NO_AVAIL_CONFLICT') {
                    replyText = "Ops! Il tavolo è stato appena prenotato da qualcun altro 😔";
                } else {
                    replyText = "Impossibile confermare: " + (reason || 'Errore sconosciuto');
                }
            }

        } else if (result.intent === 'cancel') {
            // CANCEL FLOW
            const { error } = await adminSupabase.rpc('web_cancel', {
                p_chat_id: cleanChatId,
                p_source: cleanSource,
                p_session_id: cleanSessionId
            });
            replyText = error ? "Errore cancellazione." : "Prenotazione cancellata.";
        } else if (result.intent === 'bho') {
            // AI didn't understand -> use its reply or default
        }

        return new Response(JSON.stringify({ reply: replyText }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
})
