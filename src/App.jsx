import { useState, useEffect, useRef } from 'react';
import './App.css';
import WelcomeScreen from './components/WelcomeScreen';
import AdminDashboard from './components/AdminDashboard';
import LiveOpsDashboard from './components/LiveOpsDashboard';

function App() {
  // State
  const [messages, setMessages] = useState([
    { id: 'init', text: "Ciao! Sono l'assistente di AIutiti. Come posso aiutarti oggi?", isUser: false }
  ]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [showWelcome, setShowWelcome] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const messagesEndRef = useRef(null);

  // Check for Admin Mode
  useEffect(() => {
    const checkHash = () => {
      if (window.location.hash === '#admin') {
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
      }
    };
    checkHash();
    window.addEventListener('hashchange', checkHash);
    return () => window.removeEventListener('hashchange', checkHash);
  }, []);

  // Initialize Session
  useEffect(() => {
    let stored = localStorage.getItem('chat_session_id');
    if (!stored) {
      stored = "sess_" + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('chat_session_id', stored);
    }
    setSessionId(stored);
  }, []);

  // Scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, showWelcome]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputText.trim() || isLoading) return;

    const userText = inputText.trim();
    const userMessage = { id: Date.now(), text: userText, isUser: true };

    setMessages((prev) => [...prev, userMessage]);
    setInputText("");
    setIsLoading(true);

    try {
      // Hardcoded for stability in prototype, can extract to env later
      const API_URL = "https://hkljqixkdkacbcudkoup.supabase.co/functions/v1/api-reply";
      const apiKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      console.log("DEBUG: Using API Key:", apiKey ? apiKey.substring(0, 10) + "..." : "UNDEFINED");

      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          message: userText,
          session_id: sessionId,
          source: 'web'
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API Error ${response.status}: ${errText}`);
      }

      const data = await response.json();

      const botMessage = {
        id: Date.now() + 1,
        text: data.reply || "Errore di connessione.",
        isUser: false
      };
      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      console.error("Error:", error);
      setMessages((prev) => [...prev, { id: Date.now() + 1, text: `Errore: ${error.message}`, isUser: false }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (isAdmin) {
    return <AdminDashboard />;
  }

  if (window.location.hash === '#ops') {
    return <LiveOpsDashboard />;
  }

  return (
    <>
      <WelcomeScreen onStart={() => setShowWelcome(false)} />

      {!showWelcome && (
        <div className="chat-container fade-in">
          <div className="chat-header">
            <div className="logo-container">
              <img src="/logo_aiutiti.png" alt="AIutiti" className="logo" />
            </div>
            <h1>AI<span>utiti</span> Booking</h1>
          </div>

          <div className="messages-area" style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {messages.map((msg) => (
              <div key={msg.id} className={`message ${msg.isUser ? "user" : "bot"}`} style={{ alignSelf: msg.isUser ? 'flex-end' : 'flex-start', maxWidth: '80%', padding: '0.8rem 1.2rem', borderRadius: '16px' }}>
                {msg.text}
              </div>
            ))}
            {isLoading && (
              <div className="message bot" style={{ alignSelf: 'flex-start', padding: '0.8rem 1.2rem', borderRadius: '16px' }}>
                <span className="typing-dot">.</span>
                <span className="typing-dot">.</span>
                <span className="typing-dot">.</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form className="input-form" onSubmit={handleSendMessage} style={{ padding: '1rem', display: 'flex', gap: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <input
              type="text"
              className="chat-input"
              style={{ flex: 1, padding: '0.8rem', borderRadius: '24px', border: 'none', outline: 'none' }}
              placeholder="Scrivi qui..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={isLoading}
            />
            <button type="submit" className="send-button" disabled={isLoading} style={{ padding: '0 1.5rem', borderRadius: '24px', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
              INVIA
            </button>
          </form>
        </div>
      )}
    </>
  );
}

export default App;
