import { useState, useEffect } from 'react';
import {
    Unlock,
    LayoutGrid,
    Users,
    AlertCircle,
    Minus,
    Plus,
    Timer,
    Euro,
    UserPlus,
    CheckCircle,
    PlayCircle,
    StopCircle,
    LogOut
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

function OccupiedTableModal({ isOpen, onClose, onConfirm, onUpdateStatus, table }) {
    const [amount, setAmount] = useState('');

    useEffect(() => {
        if (isOpen) setAmount('');
    }, [isOpen]);

    if (!isOpen || !table) return null;

    const statuses = [
        { id: 'seated', label: '🪑 Seduti', color: '#3B82F6' },
        { id: 'ordering', label: '📝 In Ordine', color: '#F59E0B' },
        { id: 'eating', label: '🍝 In Pasto', color: '#D946EF' },
        { id: 'bill_requested', label: '💸 Chiesto Conto', color: '#EF4444' }
    ];

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Gestione Tavolo ${table.label}`}>
            <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', color: '#94A3B8', fontSize: '1.1rem' }}>
                <span>Coperti: <strong style={{ color: 'white' }}>{table.pax}</strong></span>
                {table.session_notes && <span style={{ color: '#2DD4BF', fontWeight: 'bold' }}>{table.session_notes.replace('Reservation: ', '')}</span>}
            </div>

            <div style={{ marginBottom: '2rem' }}>
                <label style={{ display: 'block', marginBottom: '0.8rem', color: '#94A3B8', fontWeight: '600', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Stato Attuale</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                    {statuses.map(s => (
                        <button
                            key={s.id}
                            onClick={() => onUpdateStatus(table.session_id, s.id)}
                            style={{
                                padding: '1rem 0.5rem', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', border: 'none',
                                background: table.session_status === s.id ? s.color : 'rgba(255,255,255,0.05)',
                                color: table.session_status === s.id ? '#fff' : '#94A3B8',
                                boxShadow: table.session_status === s.id ? `0 4px 15px -3px ${s.color}66` : 'none',
                                transition: 'all 0.2s', fontSize: '0.95rem'
                            }}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>
            </div>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1.5rem', marginBottom: '2rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: '#94A3B8', fontWeight: '600' }}>Incasso per liberare tavolo (€)</label>
                <input
                    type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00"
                    style={{ width: '100%', padding: '1rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: 'white', fontSize: '1.2rem', outline: 'none', boxSizing: 'border-box' }}
                />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button onClick={onClose} style={{ background: 'transparent', color: '#94A3B8', border: 'none', padding: '0.8rem 1.5rem', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}>Chiudi Finestra</button>
                <button onClick={() => onConfirm(table.table_id, amount)} style={{ background: '#10B981', color: 'white', border: 'none', padding: '0.8rem 1.5rem', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <CheckCircle size={18} /> Libera Tavolo
                </button>
            </div>
        </Modal>
    );
}

function AssignReservationModal({ isOpen, onClose, onConfirm, reservation, tables }) {
    if (!isOpen || !reservation) return null;
    const freeTables = tables.filter(t => !t.session_status || t.session_status === 'closed');

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Assegna ${reservation.customer_name}`}>
            <div style={{ color: '#94A3B8', marginBottom: '1.5rem', fontSize: '1.1rem' }}>
                Persone: <strong style={{ color: 'white' }}>{reservation.party_size}</strong>
            </div>

            <label style={{ display: 'block', marginBottom: '1rem', color: '#94A3B8', fontWeight: '600', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Scegli un tavolo libero</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '1rem', marginBottom: '2rem', maxHeight: '300px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                {freeTables.length === 0 ? (
                    <div style={{ color: '#EF4444', gridColumn: '1 / -1', padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '12px' }}>
                        Nessun tavolo libero disponibile.
                    </div>
                ) : freeTables.map(t => (
                    <button
                        key={t.table_id}
                        onClick={() => onConfirm(reservation.reservation_id, t.table_id)}
                        style={{
                            padding: '1rem', background: 'linear-gradient(135deg, rgba(45, 212, 191, 0.1), rgba(15, 23, 42, 0.4))',
                            border: '1px solid rgba(45, 212, 191, 0.3)', borderRadius: '12px',
                            color: '#2DD4BF', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(45, 212, 191, 0.2)'; e.currentTarget.style.transform = 'scale(1.02)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(45, 212, 191, 0.1), rgba(15, 23, 42, 0.4))'; e.currentTarget.style.transform = 'scale(1)'; }}
                    >
                        <div style={{ fontSize: '1.5rem', color: 'white', marginBottom: '0.3rem' }}>{t.label}</div>
                        <div style={{ fontSize: '0.85rem' }}>Capacità max: {t.capacity}</div>
                    </button>
                ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={onClose} style={{ background: '#334155', color: 'white', border: 'none', padding: '0.8rem 1.5rem', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}>Annulla</button>
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
    const [now, setNow] = useState(Date.now()); // For occupancy timer updates

    // Modal State
    const [modalConfig, setModalConfig] = useState({ isOpen: false, type: null, data: null });
    const closeModal = () => setModalConfig({ isOpen: false, type: null, data: null });
    const openAlertModal = (title, message) => setModalConfig({ isOpen: true, type: 'alert', data: { title, message } });

    useEffect(() => {
        const int = setInterval(() => setNow(Date.now()), 30000); // update timer every 30s
        return () => clearInterval(int);
    }, []);

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

    const handleUpdateTableStatus = async (sessionId, status) => {
        try {
            await callApi('update_table_status', { session_id: sessionId, status });
            fetchTables();
            // Optional: closeModal() if UX dictates, but leaving open allows rapid changes
            // closeModal();
        } catch (err) {
            openAlertModal('Errore Aggiornamento Stato', err.message);
        }
    };

    const handleAssignReservationClick = (res) => {
        setModalConfig({ isOpen: true, type: 'assignReservation', data: { reservation: res } });
    };

    const confirmAssignReservation = async (reservationId, tableId) => {
        try {
            await callApi('assign_reservation', {
                reservation_id: reservationId,
                table_id: tableId,
                shift_id: shiftState.shift.id
            });
            fetchTables();
            fetchReservations();
            closeModal();
        } catch (err) {
            openAlertModal('Errore Assegnazione', err.message);
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
                    {shiftState?.active && (() => {
                        const occupiedTables = tables.filter(t => t.session_status && t.session_status !== 'closed');
                        const seatedPax = occupiedTables.reduce((acc, t) => acc + (t.pax || 0), 0);
                        const expectedPaxFromRes = reservations.reduce((acc, r) => acc + (r.party_size || 0), 0);
                        // Simplified projection: 35 EUR per pax (seated + expected)
                        const projectedRevenue = ((seatedPax + expectedPaxFromRes) * 35).toFixed(2);

                        return (
                            <div>
                                <div style={{ color: '#94A3B8', fontSize: '0.85rem', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold' }}>Panoramica</div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                                    <span>Tavoli Occupati</span>
                                    <span style={{ fontWeight: 'bold', color: 'white' }}>
                                        {occupiedTables.length} / {tables.length}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                                    <span>Coperti Attuali</span>
                                    <span style={{ fontWeight: 'bold', color: 'white' }}>{seatedPax}</span>
                                </div>

                                <div style={{
                                    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(15, 23, 42, 0.4))',
                                    border: '1px solid rgba(16, 185, 129, 0.2)',
                                    padding: '1rem', borderRadius: '16px', marginTop: '1.5rem', marginBottom: '2rem'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10B981', fontSize: '0.85rem', fontWeight: 'bold', textTransform: 'uppercase' }}>
                                        <Euro size={14} /> Incasso Proiettato
                                    </div>
                                    <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'white', marginTop: '0.3rem' }}>
                                        €{projectedRevenue}
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    {/* RESERVATIONS */}
                    {shiftState?.active && (
                        <div>
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
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleAssignReservationClick(res); }}
                                                style={{
                                                    width: '100%', background: 'rgba(59, 130, 246, 0.15)', color: '#3B82F6', border: '1px solid rgba(59, 130, 246, 0.3)',
                                                    padding: '0.6rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', marginTop: '0.8rem', transition: 'all 0.2s'
                                                }}
                                                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(59, 130, 246, 0.3)'; }}
                                                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(59, 130, 246, 0.15)'; }}
                                            >
                                                <UserPlus size={16} /> ASSEGNA TAVOLO
                                            </button>
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

                            // Pro UX Logic
                            const getStatusColor = (status) => {
                                switch (status) {
                                    case 'seated': return '#3B82F6'; // Blue
                                    case 'ordering': return '#F59E0B'; // Yellow
                                    case 'eating': return '#D946EF'; // Purple
                                    case 'bill_requested': return '#EF4444'; // Red
                                    default: return '#EF4444';
                                }
                            };

                            const statusColor = isOccupied ? getStatusColor(table.session_status) : '#2DD4BF'; // default Teal

                            const getElapsedMinutes = (openedAt) => {
                                if (!openedAt) return 0;
                                return Math.floor((now - new Date(openedAt).getTime()) / 60000);
                            };

                            const elapsed = isOccupied ? getElapsedMinutes(table.opened_at) : 0;
                            const isOverdue = elapsed >= 90;
                            const formatElapsed = (mins) => {
                                const h = Math.floor(mins / 60);
                                const m = mins % 60;
                                return h > 0 ? `${h}h ${m}m` : `${m}m`;
                            };

                            // Check if reservation is attached
                            const isReservation = table.session_notes && table.session_notes.startsWith('Reservation:');
                            const resName = isReservation ? table.session_notes.replace('Reservation: ', '') : null;

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
                                        border: `1.5px solid ${isOccupied ? statusColor : 'rgba(45, 212, 191, 0.3)'}`,
                                        color: 'white',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                        position: 'relative',
                                        boxShadow: isOccupied
                                            ? `0 10px 25px -5px ${statusColor}33`
                                            : '0 4px 6px -1px rgba(0, 0, 0, 0.2)',
                                        transform: 'translateY(0)',
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.transform = 'translateY(-5px)';
                                        e.currentTarget.style.boxShadow = isOccupied
                                            ? `0 20px 30px -5px ${statusColor}66`
                                            : '0 10px 15px -3px rgba(45, 212, 191, 0.2)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.transform = 'translateY(0)';
                                        e.currentTarget.style.boxShadow = isOccupied
                                            ? `0 10px 25px -5px ${statusColor}33`
                                            : '0 4px 6px -1px rgba(0, 0, 0, 0.2)';
                                    }}
                                >
                                    <div style={{
                                        fontSize: '2rem',
                                        fontWeight: '800',
                                        color: isOccupied ? statusColor : 'white',
                                        marginBottom: resName ? '0.2rem' : '0.8rem',
                                        fontFamily: 'Outfit, sans-serif'
                                    }}>
                                        {table.label}
                                    </div>

                                    {resName && (
                                        <div style={{ color: '#94A3B8', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '0.8rem', maxWidth: '80%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {resName}
                                        </div>
                                    )}

                                    <div style={{
                                        background: isOccupied ? `${statusColor}22` : 'rgba(45, 212, 191, 0.1)',
                                        padding: '0.5rem 1rem',
                                        borderRadius: '12px',
                                        fontSize: '1rem',
                                        fontWeight: '600',
                                        color: statusColor,
                                        display: 'flex', alignItems: 'center', gap: '0.5rem'
                                    }}>
                                        <Users size={16} />
                                        {isOccupied ? `${table.pax}` : table.capacity}
                                    </div>

                                    {/* Timer */}
                                    {isOccupied && (
                                        <div style={{
                                            position: 'absolute', top: 12, left: 16,
                                            display: 'flex', alignItems: 'center', gap: '4px',
                                            fontSize: '0.75rem', fontWeight: 'bold',
                                            color: isOverdue ? '#EF4444' : '#94A3B8',
                                            animation: isOverdue ? 'pulse 2s infinite' : 'none'
                                        }}>
                                            <Timer size={12} /> {formatElapsed(elapsed)}
                                        </div>
                                    )}

                                    {/* Status Dot */}
                                    {isOccupied && (
                                        <div style={{
                                            position: 'absolute', top: 12, right: 16,
                                            width: 12, height: 12, borderRadius: '50%', background: statusColor,
                                            boxShadow: `0 0 10px ${statusColor}`
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
                <OccupiedTableModal
                    isOpen={modalConfig.isOpen}
                    onClose={closeModal}
                    onConfirm={confirmCloseTable}
                    onUpdateStatus={handleUpdateTableStatus}
                    table={modalConfig.data.table}
                />
            )}

            {modalConfig.type === 'assignReservation' && (
                <AssignReservationModal
                    isOpen={modalConfig.isOpen}
                    onClose={closeModal}
                    onConfirm={confirmAssignReservation}
                    reservation={modalConfig.data.reservation}
                    tables={tables}
                />
            )}

            {/* Custom pulse animation for overdue timers */}
            <style>{`
                @keyframes pulse {
                    0% { opacity: 1; }
                    50% { opacity: 0.5; color: #EF4444; }
                    100% { opacity: 1; }
                }
            `}</style>
        </div>
    );
}
