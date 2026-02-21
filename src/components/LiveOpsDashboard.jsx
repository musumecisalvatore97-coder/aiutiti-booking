import { useState, useEffect } from 'react';
import {
    Unlock,
    ChefHat,
    LogOut,
    PlayCircle,
    StopCircle,
    LayoutGrid,
    Receipt,
    Users,
    AlertCircle,
    Minus,
    Plus
} from 'lucide-react';
import Modal from './ui/Modal';

function CloseShiftModal({ isOpen, onClose, onConfirm, tables }) {
    const [cash, setCash] = useState('');
    const occupiedCount = tables.filter(t => t.session_status && t.session_status !== 'closed').length;

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Chiusura Turno">
            {occupiedCount > 0 && (
                <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', padding: '1rem', borderRadius: '12px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.8rem', fontSize: '0.9rem' }}>
                    <AlertCircle size={20} />
                    Ci sono {occupiedCount} tavoli ancora aperti. Chiudendo il turno forzerai la chiusura o li ignorerai, verifica bene!
                </div>
            )}

            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#94A3B8', fontWeight: '600' }}>Fondo cassa contato (€)</label>
            <input
                type="number"
                step="0.01"
                value={cash}
                onChange={(e) => setCash(e.target.value)}
                placeholder="0.00"
                style={{
                    width: '100%', padding: '1rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px', color: 'white', fontSize: '1.2rem', marginBottom: '1.5rem', outline: 'none',
                    boxSizing: 'border-box'
                }}
                autoFocus
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button onClick={onClose} style={{ background: 'transparent', color: '#94A3B8', border: 'none', padding: '0.8rem 1.5rem', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}>Annulla</button>
                <button onClick={() => onConfirm(cash)} style={{ background: '#EF4444', color: 'white', border: 'none', padding: '0.8rem 1.5rem', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}>Conferma Chiusura</button>
            </div>
        </Modal>
    );
}

function OpenTableModal({ isOpen, onClose, onConfirm, table }) {
    const [pax, setPax] = useState(table?.capacity || 2);

    useEffect(() => {
        if (isOpen && table) {
            setPax(table.capacity || 2);
        }
    }, [isOpen, table]);

    if (!isOpen || !table) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Apri Tavolo ${table.label}`}>
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                <div style={{ color: '#94A3B8', marginBottom: '1rem', fontWeight: '600' }}>Numero di persone</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1.5rem' }}>
                    <button
                        onClick={() => setPax(Math.max(1, pax - 1))}
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', width: '50px', height: '50px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                        <Minus size={20} />
                    </button>
                    <span style={{ fontSize: '3rem', fontWeight: 'bold', width: '60px' }}>{pax}</span>
                    <button
                        onClick={() => setPax(pax + 1)}
                        style={{ background: '#2DD4BF', border: 'none', color: '#0F172A', width: '50px', height: '50px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                        <Plus size={20} />
                    </button>
                </div>
                {pax > table.capacity && (
                    <div style={{ color: '#F59E0B', fontSize: '0.9rem', marginTop: '1rem' }}>
                        Nota: superiore alla capienza standard ({table.capacity}).
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button onClick={onClose} style={{ background: 'transparent', color: '#94A3B8', border: 'none', padding: '0.8rem 1.5rem', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}>Annulla</button>
                <button onClick={() => onConfirm(table.table_id, pax)} style={{ background: '#2DD4BF', color: '#0F172A', border: 'none', padding: '0.8rem 1.5rem', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}>Apri Tavolo</button>
            </div>
        </Modal>
    );
}

function CheckoutModal({ isOpen, onClose, onConfirm, table }) {
    const [amount, setAmount] = useState('');

    useEffect(() => {
        if (isOpen) {
            setAmount('');
        }
    }, [isOpen]);

    if (!isOpen || !table) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Conto Tavolo ${table.label}`}>
            <div style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.8rem', color: '#94A3B8' }}>
                    <span>Coperti (PAX)</span>
                    <span style={{ color: 'white', fontWeight: 'bold' }}>{table.pax}</span>
                </div>

                <label style={{ display: 'block', marginBottom: '0.5rem', color: '#94A3B8', fontWeight: '600' }}>Importo Pagato (€) - Opzionale</label>
                <input
                    type="number"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    style={{
                        width: '100%', padding: '1rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '12px', color: 'white', fontSize: '1.2rem', outline: 'none',
                        boxSizing: 'border-box'
                    }}
                    autoFocus
                />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button onClick={onClose} style={{ background: 'transparent', color: '#94A3B8', border: 'none', padding: '0.8rem 1.5rem', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}>Annulla</button>
                <button onClick={() => onConfirm(table.table_id, amount)} style={{ background: '#EF4444', color: 'white', border: 'none', padding: '0.8rem 1.5rem', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}>Chiudi Tavolo</button>
            </div>
        </Modal>
    );
}

export default function LiveOpsDashboard() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [pin, setPin] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Data State
    const [shiftState, setShiftState] = useState(null); // { active: bool, shift: obj }
    const [tenantId, setTenantId] = useState(null);
    const [tables, setTables] = useState([]); // Floor plan state
    const [reservations, setReservations] = useState([]); // Today's reservations

    // Modal State
    const [modalConfig, setModalConfig] = useState({ isOpen: false, type: null, data: null });
    const closeModal = () => setModalConfig({ isOpen: false, type: null, data: null });
    const openAlertModal = (title, message) => setModalConfig({ isOpen: true, type: 'alert', data: { title, message } });

    // --- Actions ---

    const handleLogin = (e) => {
        e.preventDefault();
        // MVP: Hardcoded Pin
        if (pin === 'admin123') {
            setIsAuthenticated(true);
            fetchShiftStatus();
        } else {
            setError('PIN Errato');
            setTimeout(() => setError(null), 2000);
        }
    };

    const callApi = async (action, payload = {}) => {
        setLoading(true);
        try {
            const res = await fetch('https://hkljqixkdkacbcudkoup.supabase.co/functions/v1/api-ops', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify({
                    action,
                    password: 'admin123', // Internal service auth
                    payload
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'API Error');
            return data;
        } catch (err) {
            console.error(err);
            setError(err.message);
            throw err;
        } finally {
            setLoading(false);
        }
    };

    const fetchShiftStatus = async () => {
        try {
            const res = await callApi('get_active_shift');
            console.log("Shift Status:", res);
            setShiftState(res);
            if (res.tenant_id) setTenantId(res.tenant_id);
        } catch (err) {
            console.error("Fetch Shift Error:", err);
            // Don't swallow error completely, show retry
            setShiftState(null);
            // We use shiftState=null as 'loading' or 'error' state effectively if not handled
        }
    };

    const handleOpenShift = async () => {
        if (!tenantId) return;
        try {
            await callApi('open_shift', { tenant_id: tenantId });
            fetchShiftStatus(); // Refresh
        } catch (err) {
            openAlertModal('Errore Apertura Turno', err.message);
        }
    };

    const handleCloseShiftClick = () => {
        setModalConfig({ isOpen: true, type: 'closeShift', data: null });
    };

    const confirmCloseShift = async (cash) => {
        if (!shiftState?.shift?.id) return;
        try {
            await callApi('close_shift', {
                shift_id: shiftState.shift.id,
                actual_cash: parseFloat(cash) || 0,
                notes: 'Chiusura da dashboard'
            });
            fetchShiftStatus();
            closeModal();
        } catch (err) {
            openAlertModal('Errore Chiusura', err.message);
        }
    };

    // --- Table & Floor Logic ---

    const fetchTables = async () => {
        if (!shiftState?.active || !tenantId) return;
        try {
            const res = await callApi('get_floor_plan', {
                tenant_id: tenantId,
                shift_id: shiftState.shift.id
            });
            setTables(res.tables || []);
        } catch (err) {
            console.error("Error fetching tables:", err);
        }
    };

    const fetchReservations = async () => {
        if (!shiftState?.active || !tenantId) return;
        try {
            const res = await callApi('get_todays_reservations', { tenant_id: tenantId });
            setReservations(res.reservations || []);
        } catch (err) {
            console.error("Error fetching reservations:", err);
        }
    };

    // Poll for tables and reservations when shift is active
    useEffect(() => {
        if (shiftState?.active) {
            fetchTables();
            fetchReservations();
            const interval = setInterval(() => {
                fetchTables();
                fetchReservations();
            }, 5000); // Realtime-ish
            return () => clearInterval(interval);
        }
    }, [shiftState, tenantId]);

    const handleTableClick = async (table) => {
        if (table.session_status && table.session_status !== 'closed') {
            // Occupied
            setModalConfig({ isOpen: true, type: 'occupiedTable', data: { table } });
        } else {
            // Free
            setModalConfig({ isOpen: true, type: 'openTable', data: { table } });
        }
    };

    const confirmOpenTable = async (tableId, pax) => {
        try {
            await callApi('open_table', {
                table_id: tableId,
                shift_id: shiftState.shift.id,
                pax: parseInt(pax)
            });
            fetchTables();
            closeModal();
        } catch (err) {
            openAlertModal('Errore Apertura Tavolo', err.message);
        }
    };

    const confirmCloseTable = async (tableId, amount) => {
        try {
            await callApi('close_table', {
                table_id: tableId,
                shift_id: shiftState.shift.id,
                actual_amount: parseFloat(amount) || 0
            });
            fetchTables();
            closeModal();
        } catch (err) {
            openAlertModal('Errore Chiusura Tavolo', err.message);
        }
    };

    // Poll for status if null (maybe lost connection)
    useEffect(() => {
        if (isAuthenticated && !shiftState) {
            fetchShiftStatus();
        }
    }, [isAuthenticated, shiftState]);

    // --- Render ---

    if (!isAuthenticated) {
        return (
            <div style={{
                height: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#0F172A',
                color: 'white',
                fontFamily: 'Outfit, sans-serif'
            }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem' }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ width: '150px', margin: '0 auto 1.5rem auto' }}>
                            <img src="/logo_aiutiti.png" alt="AIutiti" style={{ width: '100%' }} />
                        </div>
                        <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Live Ops</h1>
                        <p style={{ color: '#94A3B8', fontSize: '1.2rem' }}>Inserisci PIN Operativo</p>
                    </div>

                    <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '300px' }}>
                        <input
                            type="password"
                            value={pin}
                            onChange={(e) => setPin(e.target.value)}
                            placeholder="••••"
                            style={{
                                fontSize: '2rem',
                                textAlign: 'center',
                                padding: '1rem',
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '16px',
                                color: 'white',
                                letterSpacing: '0.5rem',
                                outline: 'none'
                            }}
                            autoFocus
                        />
                        <button
                            type="submit"
                            disabled={loading}
                            style={{
                                background: 'linear-gradient(135deg, #2DD4BF, #0D9488)',
                                color: '#0F172A',
                                border: 'none',
                                padding: '1rem',
                                fontSize: '1.2rem',
                                fontWeight: 'bold',
                                borderRadius: '16px',
                                cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
                            }}
                        >
                            {loading ? '...' : <><Unlock size={20} /> Accedi</>}
                        </button>
                        {error && <p style={{ color: '#EF4444', textAlign: 'center' }}>{error}</p>}
                    </form>
                </div>
            </div>
        );
    }

    // --- Main Dashboard Layout (Sidebar + Main) ---

    return (
        <div style={{
            height: '100vh',
            display: 'flex',
            background: '#0B1120',
            color: 'white',
            fontFamily: 'Outfit, sans-serif'
        }}>

            {/* SIDEBAR */}
            <div style={{
                width: '280px',
                background: '#1E293B',
                borderRight: '1px solid rgba(255,255,255,0.05)',
                display: 'flex',
                flexDirection: 'column',
                padding: '2rem',
                justifyContent: 'space-between',
                flexShrink: 0
            }}>
                {/* Top Section */}
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '3rem' }}>
                        <img src="/logo_aiutiti.png" alt="AIutiti" style={{ height: '40px', width: 'auto' }} />
                        <span style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>AI<span style={{ color: '#FF4081' }}>utiti</span></span>
                    </div>

                    {/* Status Widget */}
                    <div style={{
                        background: 'rgba(255,255,255,0.03)',
                        padding: '1.5rem',
                        borderRadius: '20px',
                        border: '1px solid rgba(255,255,255,0.05)',
                        marginBottom: '2rem'
                    }}>
                        <div style={{ color: '#94A3B8', fontSize: '0.85rem', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold' }}>Stato Turno</div>
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '0.8rem',
                            fontSize: '1.2rem', fontWeight: 'bold',
                            color: shiftState?.active ? '#2DD4BF' : '#EF4444'
                        }}>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: shiftState?.active ? '#2DD4BF' : '#EF4444', boxShadow: `0 0 10px ${shiftState?.active ? '#2DD4BF' : '#EF4444'}` }} />
                            {shiftState?.active ? 'APERTO' : 'CHIUSO'}
                        </div>
                    </div>

                    {/* Quick Stats */}
                    {shiftState?.active && (
                        <div>
                            <div style={{ color: '#94A3B8', fontSize: '0.85rem', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold' }}>Panoramica</div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                                <span>Tavoli</span>
                                <span style={{ fontWeight: 'bold', color: 'white' }}>
                                    {tables.filter(t => t.session_status && t.session_status !== 'closed').length} / {tables.length}
                                </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                                <span>Coperti</span>
                                <span style={{ fontWeight: 'bold', color: 'white' }}>
                                    {tables.reduce((acc, t) => acc + (t.session_status && t.session_status !== 'closed' ? (t.pax || 0) : 0), 0)}
                                </span>
                            </div>

                            {/* RESERVATIONS */}
                            <div style={{ color: '#94A3B8', fontSize: '0.85rem', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
                                <span>In Arrivo Oggi</span>
                                <span style={{ background: '#3B82F6', color: 'white', padding: '0.1rem 0.5rem', borderRadius: '10px', fontSize: '0.75rem' }}>{reservations.length}</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', maxHeight: '250px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                                {reservations.length === 0 ? (
                                    <div style={{ color: '#64748B', fontSize: '0.9rem', textAlign: 'center', padding: '1rem 0', fontStyle: 'italic' }}>Nessuna prenotazione</div>
                                ) : (
                                    reservations.map(res => (
                                        <div key={res.reservation_id} style={{ background: 'rgba(255,255,255,0.03)', padding: '0.8rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                                                <strong style={{ fontSize: '0.95rem' }}>{res.customer_name}</strong>
                                                <span style={{ color: '#3B82F6', fontWeight: 'bold', fontSize: '0.9rem' }}>
                                                    {new Date(res.start_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#94A3B8', fontSize: '0.85rem' }}>
                                                <Users size={14} /> {res.party_size} pax
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Bottom Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {shiftState?.active ? (
                        <button
                            onClick={handleCloseShiftClick}
                            style={{
                                width: '100%', padding: '1rem', borderRadius: '12px', border: 'none',
                                background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', fontWeight: 'bold', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem',
                                transition: 'background 0.2s'
                            }}
                            onMouseEnter={(e) => e.target.style.background = 'rgba(239, 68, 68, 0.2)'}
                            onMouseLeave={(e) => e.target.style.background = 'rgba(239, 68, 68, 0.1)'}
                        >
                            <StopCircle size={20} /> CHIUDI TURNO
                        </button>
                    ) : (
                        <button
                            onClick={handleOpenShift}
                            disabled={!tenantId}
                            style={{
                                width: '100%', padding: '1rem', borderRadius: '12px', border: 'none',
                                background: '#2DD4BF', color: '#0F172A', fontWeight: 'bold', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem'
                            }}
                        >
                            <PlayCircle size={20} /> APRI TURNO
                        </button>
                    )}

                    <button
                        onClick={() => setIsAuthenticated(false)}
                        style={{
                            background: 'transparent',
                            color: '#64748B',
                            padding: '0.8rem',
                            borderRadius: '12px',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', border: 'none'
                        }}
                    >
                        <LogOut size={16} /> Esci
                    </button>
                </div>
            </div>

            {/* MAIN CONTENT */}
            <div style={{ flex: 1, padding: '2rem 3rem', overflowY: 'auto' }}>

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem', width: '100%', gap: '2rem' }}>
                    <div>
                        <h2 style={{ fontSize: '2.5rem', fontWeight: 'bold', margin: 0 }}>Sala Principale</h2>
                        <div style={{ color: '#94A3B8', marginTop: '0.5rem' }}>Gestione in tempo reale</div>
                    </div>
                    <div style={{
                        background: '#1E293B', padding: '0.8rem 1.5rem', borderRadius: '100px',
                        fontSize: '0.9rem', color: '#94A3B8', border: '1px solid rgba(255,255,255,0.05)',
                        marginLeft: 'auto' // Force right
                    }}>
                        {new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </div>
                </div>

                {/* Error Banner */}
                {error && (
                    <div style={{ marginBottom: '2rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #EF4444', color: '#EF4444', padding: '1rem', borderRadius: '12px', display: 'flex', gap: '1rem' }}>
                        <AlertCircle /> {error}
                    </div>
                )}

                {/* Empty / Loading State */}
                {(!shiftState || !shiftState.active) && (
                    <div style={{ height: '50vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#64748B', gap: '1.5rem' }}>
                        {loading ? <div className="spinner" /> : <LayoutGrid size={64} opacity={0.3} />}
                        <div style={{ textAlign: 'center' }}>
                            <h3 style={{ fontSize: '1.5rem', color: '#94A3B8', marginBottom: '0.5rem' }}>
                                {loading ? 'Caricamento sala...' : 'Sala Chiusa'}
                            </h3>
                            <p>{!shiftState ? 'Errore di connessione' : 'Apri il turno dal menu laterale per visualizzare i tavoli.'}</p>
                        </div>
                    </div>
                )}

                {/* TABLE GRID */}
                {shiftState?.active && (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                        gap: '2rem',
                        paddingBottom: '4rem'
                    }}>
                        {tables.map(table => {
                            const isOccupied = table.session_status && table.session_status !== 'closed';
                            return (
                                <button
                                    key={table.table_id}
                                    onClick={() => handleTableClick(table)}
                                    style={{
                                        aspectRatio: '1.2',
                                        borderRadius: '24px',
                                        background: isOccupied
                                            ? 'linear-gradient(145deg, #1E293B, #0F172A)'
                                            : 'linear-gradient(135deg, rgba(30, 41, 59, 1), rgba(15, 23, 42, 1))',
                                        border: isOccupied ? '2px solid #EF4444' : '1px solid rgba(45, 212, 191, 0.3)',
                                        color: 'white',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                        position: 'relative',
                                        boxShadow: isOccupied
                                            ? '0 10px 25px -5px rgba(239, 68, 68, 0.3)'
                                            : '0 4px 6px -1px rgba(0, 0, 0, 0.2)',
                                        transform: 'translateY(0)',
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.transform = 'translateY(-5px)';
                                        e.currentTarget.style.boxShadow = isOccupied
                                            ? '0 20px 30px -5px rgba(239, 68, 68, 0.4)'
                                            : '0 10px 15px -3px rgba(45, 212, 191, 0.2)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.transform = 'translateY(0)';
                                        e.currentTarget.style.boxShadow = isOccupied
                                            ? '0 10px 25px -5px rgba(239, 68, 68, 0.3)'
                                            : '0 4px 6px -1px rgba(0, 0, 0, 0.2)';
                                    }}
                                >
                                    <div style={{
                                        fontSize: '2rem',
                                        fontWeight: '800',
                                        color: isOccupied ? '#EF4444' : 'white',
                                        marginBottom: '0.8rem',
                                        fontFamily: 'Outfit, sans-serif'
                                    }}>
                                        {table.label}
                                    </div>

                                    <div style={{
                                        background: isOccupied ? 'rgba(239, 68, 68, 0.1)' : 'rgba(45, 212, 191, 0.1)',
                                        padding: '0.5rem 1rem',
                                        borderRadius: '12px',
                                        fontSize: '1rem',
                                        fontWeight: '600',
                                        color: isOccupied ? '#EF4444' : '#2DD4BF',
                                        display: 'flex', alignItems: 'center', gap: '0.5rem'
                                    }}>
                                        <Users size={16} />
                                        {isOccupied ? `${table.pax}` : table.capacity}
                                    </div>

                                    {isOccupied && (
                                        <div style={{
                                            position: 'absolute', top: 15, right: 15,
                                            width: 12, height: 12, borderRadius: '50%', background: '#EF4444',
                                            boxShadow: '0 0 15px #EF4444'
                                        }} />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* MODALS */}
            {modalConfig.type === 'alert' && (
                <Modal isOpen={modalConfig.isOpen} onClose={closeModal} title={modalConfig.data.title}>
                    <p style={{ color: '#94A3B8', marginBottom: '1.5rem', lineHeight: '1.5' }}>{modalConfig.data.message}</p>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button onClick={closeModal} style={{ background: '#334155', color: 'white', border: 'none', padding: '0.8rem 1.5rem', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}>Chiudi</button>
                    </div>
                </Modal>
            )}

            {modalConfig.type === 'closeShift' && (
                <CloseShiftModal
                    isOpen={modalConfig.isOpen}
                    onClose={closeModal}
                    onConfirm={confirmCloseShift}
                    tables={tables}
                />
            )}

            {modalConfig.type === 'openTable' && (
                <OpenTableModal
                    isOpen={modalConfig.isOpen}
                    onClose={closeModal}
                    onConfirm={confirmOpenTable}
                    table={modalConfig.data.table}
                />
            )}

            {modalConfig.type === 'occupiedTable' && (
                <CheckoutModal
                    isOpen={modalConfig.isOpen}
                    onClose={closeModal}
                    onConfirm={confirmCloseTable}
                    table={modalConfig.data.table}
                />
            )}

        </div>
    );
}
