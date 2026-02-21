const sessions = {};

export default function mockApiPlugin() {
    return {
        name: 'mock-api-plugin',
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                if (req.url === '/api/reply' && req.method === 'POST') {
                    let body = '';
                    req.on('data', chunk => {
                        body += chunk.toString();
                    });
                    req.on('end', () => {
                        try {
                            if (!body) {
                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify({ reply: "Ciao! Non ho sentito, puoi scrivere qualcosa?" }));
                                return;
                            }

                            const { message, session_id } = JSON.parse(body);
                            const text = (message || '').toLowerCase();

                            // Initialize session if not exists
                            if (!sessions[session_id]) {
                                sessions[session_id] = { step: 'greeting', booking: {} };
                            }
                            const session = sessions[session_id];
                            let reply = "Non ho capito, puoi ripetere?";

                            // Reset command
                            if (text.includes('reset') || text.includes('cancella') || text.includes('ricomincia')) {
                                sessions[session_id] = { step: 'greeting', booking: {} };
                                reply = "D'accordo, ricominciamo. Ciao! Per quando vorresti prenotare?";
                            } else {
                                // 1. Entity Extraction (Simple Regex to catch entities anywhere in text)
                                // Date: numeric dates (12/05) or words (domani, oggi, weekdays)
                                const dateMatch = text.match(/(\d{1,2}(\/|-)\d{1,2})|(\d{1,2}\s+(gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic))|domani|stasera|venerd|sabato|domenica|luned|marted|mercoled|gioved|oggi/i);

                                // Time: HH:MM or "ore X" or "X di sera"
                                const timeMatch = text.match(/(\d{1,2}[:.]\d{2})|(\d{1,2}\s*(di|in)?\s*sera)|(alle\s*\d{1,2})|ore \d{1,2}/i);

                                // People: "X persone", "per X", "siamo in X", or just a number IF valid context
                                const peopleMatch = text.match(/(\d+)\s*(persone|pers|pax)|siamo in (\d+)|per (\d+)/i);
                                const numberMatch = text.match(/\b\d+\b/);

                                // Update Session with found entities
                                if (dateMatch) session.booking.date = dateMatch[0];
                                if (timeMatch) session.booking.time = timeMatch[0];

                                // People Logic: explicit mention OR raw number if we are asking for people
                                if (peopleMatch) {
                                    session.booking.people = peopleMatch[1] || peopleMatch[2] || peopleMatch[3] || peopleMatch[4];
                                } else if (session.step === 'people' && numberMatch && !timeMatch && !dateMatch) {
                                    // If we are specifically asking for people and only a number is given 
                                    // (and it's not part of a date/time), assume it's people count
                                    session.booking.people = numberMatch[0];
                                }

                                // 2. State Resolution (What is missing?)
                                if (!session.booking.date) {
                                    session.step = 'date';
                                    if (session.booking.time || session.booking.people) {
                                        reply = "Ho capito l'orario/persone, ma per quale giorno?";
                                    } else if (text.match(/ciao|salve|prenotare|benvenuto/)) {
                                        reply = "Benvenuto da DL FOOD AND DRINK! Per quando vorresti prenotare un tavolo?";
                                    } else {
                                        reply = "Scusa, non ho capito la data. Per quando vorresti prenotare? (es. Domani, Venerdì)";
                                    }
                                } else if (!session.booking.time) {
                                    session.step = 'time';
                                    reply = `Perfetto per ${session.booking.date}. A che ora preferiresti?`;
                                } else if (!session.booking.people) {
                                    session.step = 'people';
                                    reply = `Ok, ${session.booking.date} alle ${session.booking.time}. Per quante persone?`;
                                } else {
                                    session.step = 'confirmed';
                                    reply = `Perfetto, prenotazione confermata per ${session.booking.people} persone, ${session.booking.date} alle ${session.booking.time}. Ti aspettiamo da DL FOOD AND DRINK!`;
                                }
                            }

                            res.setHeader('Content-Type', 'application/json');
                            res.end(JSON.stringify({ reply }));
                        } catch (e) {
                            console.error('Mock server error:', e);
                            res.statusCode = 400;
                            res.end(JSON.stringify({ error: 'Invalid Request' }));
                        }
                    });
                } else {
                    next();
                }
            });
        }
    };
}
