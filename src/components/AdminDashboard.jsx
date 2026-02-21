
import { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, Search, Phone, ChevronLeft, ChevronRight, User, Users, Clock, LogOut, CheckCircle2, Menu, ChefHat } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { it } from 'date-fns/locale';

// CSS for react-day-picker dark mode override
const css = `
  .rdp { --rdp-cell-size: 40px; --rdp-accent-color: #FF4081; --rdp-background-color: #1A202C; margin: 0; }
  .rdp-day_selected:not([disabled]) { font-weight: bold; background-color: var(--rdp-accent-color); }
  .rdp-day_selected:hover:not([disabled]) { background-color: var(--rdp-accent-color); }
  .rdp-button:hover:not([disabled]) { background-color: rgba(255,255,255,0.1); }
  .rdp-month_caption { color: white; font-weight: bold; }
  .rdp-head_cell { color: #A0AEC0; }
  .rdp-day { color: white; }
  .rdp-nav_button { color: white; }
`;

export default function AdminDashboard() {
    const [accessCode, setAccessCode] = useState('');
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [activeTab, setActiveTab] = useState('agenda'); // 'agenda' or 'crm'

    // Agenda State
    const [currentDate, setCurrentDate] = useState(new Date());
    const [agendaItems, setAgendaItems] = useState([]);

    // CRM State
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    // --- Resize Listener ---
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // --- Format Helpers ---
    // Fix: Use local date components to avoid timezone shifting when formatting for API YYYY-MM-DD
    const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    const formatDisplayDate = (date) => date.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
    const formatTime = (dateStr) => new Date(dateStr).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

    // --- Actions ---

    // 1. Login
    const handleLogin = (e) => {
        e.preventDefault();
        if (accessCode === 'admin123') {
            setIsAuthenticated(true);
            fetchAgenda(currentDate);
        } else {
            alert('Codice errato!');
        }
    };

    const handleLogout = () => {
        setIsAuthenticated(false);
        setAccessCode('');
        setAgendaItems([]);
        setSearchResults([]);
    };

    // 2. Fetch Agenda (By Date)
    const fetchAgenda = async (date) => {
        setLoading(true);
        setError(null);
        try {
            const payload = {
                action: 'list_reservations',
                password: accessCode
            };
            if (date) {
                payload.date = formatDate(date);
            }
            // else: api-admin handles missing date as "upcoming"

            const res = await callApi(payload);
            setAgendaItems(res.reservations || []);
        } catch (err) {
            console.error(err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // 3. Search CRM
    const handleSearch = async (e) => {
        const query = e ? e.target.value : searchQuery;
        setSearchQuery(query);

        if (!query || query.length < 2) {
            setSearchResults([]);
            return;
        }

        // Debounce? For now direct call is fine for MVP, but maybe waiting on Enter is better.
        // Let's stick to Submit for search to avoid too many calls
    };

    const submitSearch = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const res = await callApi({
                action: 'search_reservations',
                query: searchQuery,
                password: accessCode
            });
            setSearchResults(res.reservations || []);
        } catch (err) {
            console.error(err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    // API Helper
    const callApi = async (body) => {
        const response = await fetch("https://hkljqixkdkacbcudkoup.supabase.co/functions/v1/api-admin", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify(body),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `Error ${response.status}`);
        return data;
    };

    // --- Handlers ---
    const handleDayClick = (day) => {
        if (!day) return;
        setCurrentDate(day);
        fetchAgenda(day);
    };

    const changeDateMobile = (days) => {
        const newDate = new Date(currentDate);
        newDate.setDate(newDate.getDate() + days);
        setCurrentDate(newDate);
        fetchAgenda(newDate);
    };

    const goToToday = () => {
        const today = new Date();
        setCurrentDate(today);
        fetchAgenda(today);
    };

    // --- Login Screen ---
    if (!isAuthenticated) {
        return (
            <div className="fade-in" style={{
                minHeight: '100vh',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'radial-gradient(circle at center, #1e2535 0%, #0B1120 100%)',
                color: 'white'
            }}>
                <div className="logo-container" style={{ width: '150px', height: '150px', border: '2px solid rgba(255,255,255,0.1)', marginBottom: '2rem' }}>
                    <img src="/logo_aiutiti.png" alt="AIutiti" className="logo" />
                </div>

                <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold', marginBottom: '2rem' }}>AI<span style={{ color: '#FF4081' }}>utiti</span> Admin</h1>

                <form onSubmit={handleLogin} style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    width: '100%',
                    maxWidth: '320px',
                    padding: '2rem',
                    background: 'rgba(255,255,255,0.05)',
                    borderRadius: '24px',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255,255,255,0.05)'
                }}>
                    <input
                        type="password"
                        value={accessCode}
                        onChange={(e) => setAccessCode(e.target.value)}
                        placeholder="Inserisci Passcode"
                        style={{ padding: '1.2rem', borderRadius: '14px', border: 'none', background: 'rgba(0,0,0,0.3)', color: 'white', fontSize: '1.1rem', textAlign: 'center' }}
                    />
                    <button type="submit" style={{ padding: '1.2rem', borderRadius: '14px', background: 'linear-gradient(135deg, #FF4081, #d6004b)', border: 'none', color: 'white', fontWeight: 'bold', fontSize: '1.1rem', cursor: 'pointer' }}>ACCEDI</button>
                </form>
            </div>
        );
    }

    // --- Main Layout ---
    return (
        <div style={{ display: 'flex', minHeight: '100vh', background: '#0B1120', color: 'white' }}>
            <style>{css}</style>

            {/* --- SIDEBAR (Desktop) --- */}
            {!isMobile && (
                <div style={{
                    width: '320px',
                    borderRight: '1px solid rgba(255,255,255,0.05)',
                    padding: '2rem',
                    display: 'flex',
                    flexDirection: 'column',
                    background: 'rgba(11, 17, 32, 0.95)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '3rem' }}>
                        <div className="logo-container" style={{ width: '48px', height: '48px', padding: '0', background: 'transparent', border: 'none' }}>
                            <img src="/logo_aiutiti.png" alt="Logo" style={{ width: '100%', objectFit: 'contain' }} />
                        </div>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>AI<span style={{ color: '#FF4081' }}>utiti</span></h2>
                    </div>

                    {/* Desktop Navigation */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '3rem' }}>
                        <NavButtonDesktop icon={<CalendarIcon size={20} />} label="Agenda" active={activeTab === 'agenda'} onClick={() => setActiveTab('agenda')} />
                        <NavButtonDesktop icon={<Users size={20} />} label="Clienti" active={activeTab === 'crm'} onClick={() => setActiveTab('crm')} />
                        <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '1rem 0' }} />
                        <NavButtonDesktop
                            icon={<ChefHat size={20} color="#2DD4BF" />}
                            label={<span style={{ color: '#2DD4BF' }}>Live Ops</span>}
                            active={false}
                            onClick={() => window.location.hash = '#ops'}
                        />
                    </div>

                    {/* Inline Calendar (Only visible in Agenda tab on Desktop) */}
                    {activeTab === 'agenda' && (
                        <div className="fade-in" style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '16px', padding: '1rem' }}>
                            <DayPicker
                                mode="single"
                                selected={currentDate}
                                onSelect={handleDayClick}
                                locale={it}
                                showOutsideDays
                            />
                        </div>
                    )}

                    <div style={{ marginTop: 'auto' }}>
                        <button onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#ff4444', background: 'transparent', border: 'none', cursor: 'pointer', padding: '1rem', opacity: 0.8, transition: 'opacity 0.2s' }}>
                            <LogOut size={20} /> Logout
                        </button>
                    </div>
                </div>
            )}

            {/* --- MAIN CONTENT --- */}
            <div style={{ flex: 1, position: 'relative', overflowY: 'auto', maxHeight: '100vh' }}>

                {/* Mobile Header */}
                {isMobile && (
                    <div style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(11, 17, 32, 0.9)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                            <img src="/logo_aiutiti.png" alt="Logo" style={{ width: '32px' }} />
                            <span style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>AI<span style={{ color: '#FF4081' }}>utiti</span></span>
                        </div>
                        <button onClick={handleLogout} style={{ background: 'none', border: 'none', color: '#ff4444' }}><LogOut size={20} /></button>
                    </div>
                )}

                {/* Content Area */}
                <div style={{ padding: isMobile ? '1rem' : '3rem', paddingBottom: isMobile ? '100px' : '3rem', maxWidth: '800px', margin: '0 auto', boxSizing: 'border-box', overflowX: 'hidden' }}>

                    {activeTab === 'agenda' && (
                        <>
                            {/* Mobile Date Nav */}
                            {isMobile && (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', background: 'rgba(255,255,255,0.03)', padding: '0.5rem', borderRadius: '16px' }}>
                                    <button onClick={() => changeDateMobile(-1)} style={{ background: 'transparent', border: 'none', color: 'white', padding: '0.8rem' }}><ChevronLeft /></button>
                                    <div style={{ textAlign: 'center' }} onClick={goToToday}>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 'bold', textTransform: 'capitalize' }}>
                                            {currentDate ? formatDisplayDate(currentDate) : 'Prossime'}
                                        </div>
                                    </div>
                                    <button onClick={() => changeDateMobile(1)} style={{ background: 'transparent', border: 'none', color: 'white', padding: '0.8rem' }}><ChevronRight /></button>
                                </div>
                            )}

                            {/* Desktop Title */}
                            {!isMobile && (
                                <header style={{ marginBottom: '2rem', display: 'flex', alignItems: 'baseline', gap: '1rem' }}>
                                    <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold', margin: 0, textTransform: 'capitalize' }}>
                                        {currentDate ? formatDisplayDate(currentDate) : 'Prossime Prenotazioni'}
                                    </h1>
                                    {currentDate && currentDate.toDateString() === new Date().toDateString() && <span style={{ color: '#FF4081', fontWeight: 'bold', fontSize: '1.2rem' }}>OGGI</span>}

                                    <button
                                        onClick={() => { setCurrentDate(null); fetchAgenda(null); }}
                                        style={{
                                            marginLeft: 'auto',
                                            background: !currentDate ? 'rgba(255, 64, 129, 0.2)' : 'rgba(255,255,255,0.05)',
                                            color: !currentDate ? '#FF4081' : 'white',
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            padding: '0.8rem 1.5rem',
                                            borderRadius: '12px',
                                            cursor: 'pointer',
                                            fontWeight: 'bold',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        Mostra Prossime
                                    </button>
                                </header>
                            )}

                            {/* List */}
                            {loading ? (
                                <div style={{ textAlign: 'center', padding: '3rem', opacity: 0.5 }}>Caricamento...</div>
                            ) : agendaItems.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '4rem', opacity: 0.4, border: '2px dashed rgba(255,255,255,0.05)', borderRadius: '24px' }}>
                                    <CalendarIcon size={48} style={{ marginBottom: '1rem' }} />
                                    <p>Nessuna prenotazione per questa data.</p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {agendaItems.map((item, idx) => (
                                        <ReservationCard
                                            key={item.id}
                                            item={item}
                                            formatTime={formatTime}
                                            showDate={!currentDate} // If no specific day selected, show the date
                                            delay={idx * 0.05}
                                            isMobile={isMobile}
                                        />
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    {activeTab === 'crm' && (
                        <>
                            <h2 style={{ fontSize: isMobile ? '1.5rem' : '2rem', fontWeight: 'bold', marginBottom: isMobile ? '1.5rem' : '2rem' }}>Gestione Clienti</h2>
                            <form onSubmit={submitSearch} style={{ marginBottom: '2rem', position: 'relative' }}>
                                <Search size={20} style={{ position: 'absolute', top: '50%', left: isMobile ? '12px' : '20px', transform: 'translateY(-50%)', opacity: 0.5 }} />
                                <input
                                    autoFocus={!isMobile}
                                    type="text"
                                    value={searchQuery}
                                    onChange={handleSearch}
                                    placeholder="Cerca nome, telefono..."
                                    style={{
                                        width: '100%',
                                        padding: isMobile ? '1rem 1rem 1rem 36px' : '1.5rem 1.5rem 1.5rem 3.5rem',
                                        fontSize: isMobile ? '1rem' : '1.1rem',
                                        borderRadius: '20px',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        background: 'rgba(255,255,255,0.03)',
                                        color: 'white',
                                        outline: 'none',
                                        boxSizing: 'border-box'
                                    }}
                                />
                            </form>

                            {loading ? (
                                <div style={{ textAlign: 'center', padding: '3rem', opacity: 0.5 }}>Ricerca...</div>
                            ) : searchResults.length > 0 ? (
                                <div>
                                    <h3 style={{ marginBottom: '1rem', opacity: 0.7 }}>Trovati {searchResults.length} risultati</h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        {searchResults.map(item => <ReservationCard key={item.id} item={item} formatTime={formatTime} showDate={true} isMobile={isMobile} />)}
                                    </div>
                                </div>
                            ) : searchQuery && (
                                <div style={{ textAlign: 'center', opacity: 0.5 }}>Nessun risultato.</div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Mobile Bottom Nav */}
            {isMobile && (
                <div style={{ position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)', width: '90%', maxWidth: '350px', background: 'rgba(30,40,60,0.9)', backdropFilter: 'blur(20px)', borderRadius: '30px', padding: '0.4rem', display: 'flex', justifyContent: 'space-around', alignItems: 'center', boxShadow: '0 20px 40px rgba(0,0,0,0.5)', zIndex: 100 }}>
                    <NavButtonMobile icon={<CalendarIcon size={20} />} label="Agenda" active={activeTab === 'agenda'} onClick={() => setActiveTab('agenda')} />
                    <NavButtonMobile icon={<Users size={20} />} label="Clienti" active={activeTab === 'crm'} onClick={() => setActiveTab('crm')} />
                    <NavButtonMobile icon={<ChefHat size={20} color="#2DD4BF" />} label="Live" active={false} onClick={() => window.location.hash = '#ops'} />
                </div>
            )}
        </div>
    );
}

// --- Components ---

const NavButtonDesktop = ({ icon, label, active, onClick }) => (
    <button onClick={onClick} style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        width: '100%', padding: '1rem',
        borderRadius: '12px',
        background: active ? 'rgba(255, 64, 129, 0.15)' : 'transparent',
        color: active ? '#FF4081' : 'white',
        border: 'none', cursor: 'pointer',
        fontWeight: active ? '600' : 'normal',
        textAlign: 'left',
        transition: 'all 0.2s'
    }}>
        {icon} <span style={{ fontSize: '1.1rem' }}>{label}</span>
    </button>
);

const NavButtonMobile = ({ icon, label, active, onClick }) => (
    <button onClick={onClick} style={{ background: active ? 'rgba(255,255,255,0.1)' : 'transparent', border: 'none', color: active ? 'white' : 'rgba(255,255,255,0.5)', borderRadius: '20px', padding: '0.8rem 1.5rem', display: 'flex', gap: '8px', alignItems: 'center' }}>
        {icon} {active && <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>{label}</span>}
    </button>
);

// Improved Alignment Card
const ReservationCard = ({ item, formatTime, showDate = false, delay = 0, isMobile = false }) => (
    <div style={{
        background: 'rgba(255,255,255,0.03)',
        borderRadius: '16px',
        padding: isMobile ? '1rem' : '1.5rem',
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'flex-start' : 'center',
        justifyContent: 'space-between',
        gap: isMobile ? '1rem' : '0',
        border: '1px solid rgba(255,255,255,0.05)',
        animation: `fadeIn 0.5s ease forwards`,
        animationDelay: `${delay}s`,
        opacity: 0,
        width: '100%',
        boxSizing: 'border-box'
    }}>
        <style>{`@keyframes fadeIn { to { opacity: 1; } }`}</style>

        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '1rem' : '1.2rem', width: '100%' }}>
            {/* Party Size Badge */}
            <div style={{
                background: 'linear-gradient(135deg, #FF4081, #FF0055)',
                width: isMobile ? '48px' : '56px',
                height: isMobile ? '48px' : '56px',
                minWidth: isMobile ? '48px' : '56px',
                borderRadius: '16px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                color: 'white', fontWeight: 'bold',
                boxShadow: '0 8px 16px -4px rgba(255, 64, 129, 0.4)'
            }}>
                <span style={{ fontSize: isMobile ? '1.2rem' : '1.4rem', lineHeight: '1' }}>{item.party_size}</span>
                <span style={{ fontSize: '0.7rem', opacity: 0.9 }}>PERS</span>
            </div>

            {/* Details */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                <h3 style={{ margin: 0, fontSize: isMobile ? '1.1rem' : '1.2rem', fontWeight: '600', wordBreak: 'break-word' }}>{item.customer_name || 'Anonimo'}</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: '#A0AEC0', fontSize: '0.95rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Clock size={16} color="#FF4081" />
                        <span>{showDate ? new Date(item.start_at).toLocaleDateString() + ' ' : ''}{formatTime(item.start_at)}</span>
                    </div>
                </div>
            </div>
        </div>

        {/* Call Button */}
        {item.phone && (
            <a href={`tel:${item.phone}`} style={{
                background: 'rgba(45, 212, 191, 0.1)',
                color: '#2DD4BF',
                border: '1px solid rgba(45, 212, 191, 0.3)',
                padding: '0.8rem 1.2rem',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                textDecoration: 'none',
                fontWeight: '600',
                transition: 'all 0.2s',
                height: 'fit-content',
                marginLeft: isMobile ? '0' : '1.5rem',
                width: isMobile ? '100%' : 'auto',
                boxSizing: 'border-box'
            }}>
                <Phone size={18} />
                <span style={{ lineHeight: 1 }}>Chiama</span>
            </a>
        )}
    </div>
);
