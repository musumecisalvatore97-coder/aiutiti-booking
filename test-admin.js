const VITE_SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || "";

fetch("https://hkljqixkdkacbcudkoup.supabase.co/functions/v1/api-admin", {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${VITE_SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify({
        action: "set_offer",
        password: "admin123",
        offer: "Test offer from script"
    })
}).then(async res => {
    console.log("Status:", res.status);
    const text = await res.text();
    console.log("Body:", text);
}).catch(e => console.error(e));
