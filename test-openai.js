

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

async function run() {
    const text = "si";
    const today = "2026-02-22 10:50";
    const timezone = "Europe/Rome";
    const activeContext = `MARKETING INSTRUCTION: The restaurant has an active special offer: "Spaghetti all'astice con calice in omaggio a 25€".
                    - You MUST mention this offer IF AND ONLY IF you have just confirmed a reservation or if the user asks for the menu/offers.
                    - Example of confirmation reply with offer: "Prenotazione confermata per le 20:30! 🎉 PS: Ti ricordo che stasera abbiamo la Fiorentina scontata del 20%, richiedila al cameriere!"
                    - Make it sound natural, polite, and enthusiatic as a brief P.S. at the end of your message.
                    - DO NOT mention the offer if you are still asking for missing booking details (like time or people).`;

    const systemPrompt = `
    You are a helpful restaurant booking assistant.
    Today is ${today} (Timezone: ${timezone}).
    
    ${activeContext}

    Your goal is to extract booking details from the user's message.
    Return a JSON object with the following fields:
    - intent: "upsert" (if user wants to book/modify), "cancel" (if user wants to cancel), "confirm" (if user confirms), "waitlist" (if user asks to join the waitlist or replies yes to waitlist proposal), "availability" (if asking for availability), "bho" (if unclear/chitchat).
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
    - If the user says "si in lista", "mettimi in attesa", "lista d'attesa", intent is "waitlist".
    - If the user says "disdico", "annulla", intent is "cancel".
    - If the user says "ciao", "buonasera", "salve", intent is "bho" and reply "Ciao! Vuoi prenotare un tavolo? Dimmi per quante persone e quando.".
    - If the user input is short and looks like a name or data (e.g. "4 persone", "ore 21"), treat as intent "upsert".
    - ALWAYS provide a 'reply' field. If intent is 'bho', the reply MUST be a helpful question to guide the user.
    `;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: text }
            ],
            temperature: 0.0,
            response_format: { type: "json_object" }
        })
    });

    const data = await response.json();
    console.log(JSON.stringify(data, null, 2));
}

run();
