

const VITE_SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || "";
const url = "https://hkljqixkdkacbcudkoup.supabase.co/functions/v1/api-reply";

async function run() {
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${VITE_SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify({
                message: "cancellala",
                session_id: "test-user-dev",
                source: "web"
            })
        });

        console.log("Status:", res.status);
        const text = await res.text();
        console.log("Response:", text);
    } catch (e) {
        console.error(e);
    }
}

run();
