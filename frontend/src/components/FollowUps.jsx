import { useEffect, useState } from 'preact/hooks';
import { useStore } from '../stores/store';
import Icon, { EmptyStateIcon } from './Icons';

/**
 * Follow-ups Component
 * FEATURES: Searchable lead selection, lead details, outcome workflow
 */
export default function FollowUps() {
    const { followUps, fetchFollowUps, completeFollowUp, createFollowUp, createReminder, leads, fetchLeads, isLoading, user, showToast, users, fetchUsers } = useStore();

    // Modal & Form States
    const [showAddForm, setShowAddForm] = useState(false);
    const [showOutcomeModal, setShowOutcomeModal] = useState(null); // ID of follow-up being completed

    // Outcome State
    const [outcomeData, setOutcomeData] = useState({
        outcome: 'completed',
        notes: '',
        reschedule_date: '',
        remind_date: ''
    });

    // Add Follow-up State
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedLead, setSelectedLead] = useState(null);
    const [newFollowUp, setNewFollowUp] = useState({
        lead_id: '',
        scheduled_at: '',
        type: 'call',
        notes: ''
    });

    // Admin: Employee filter
    const [employeeFilter, setEmployeeFilter] = useState('');

    const isAdmin = user?.role === 'admin';

    // Helper to format budget
    const formatBudget = (value) => {
        if (!value) return '-';
        if (value >= 10000000 && value % 100000 === 0) {
            return `₹${value / 10000000}Cr`;
        }
        return `₹${value / 100000}L`;
    };

    // Helper to get current local datetime for min attribute (format: YYYY-MM-DDTHH:mm)
    const getMinDateTime = () => {
        const now = new Date();
        return now.getFullYear() + '-' +
            String(now.getMonth() + 1).padStart(2, '0') + '-' +
            String(now.getDate()).padStart(2, '0') + 'T' +
            String(now.getHours()).padStart(2, '0') + ':' +
            String(now.getMinutes()).padStart(2, '0');
    };

    useEffect(() => {
        fetchFollowUps(true);
        fetchLeads(); // Always fetch leads to select from
        if (isAdmin) fetchUsers(); // Fetch users for employee filter
    }, []);

    // Filter leads for search - exclude clients and rejected leads
    // If admin has selected an employee filter, only show leads where contact_person matches
    const availableLeads = leads.filter(l => {
        // Exclude clients and rejected leads
        if (l.status === 'client' || l.status === 'rejected') return false;
        // If employee filter is selected, only show leads for that contact person
        if (employeeFilter && l.contact_person !== employeeFilter) return false;
        return true;
    });
    const filteredLeads = searchTerm
        ? availableLeads.filter(l => l.name.toLowerCase().includes(searchTerm.toLowerCase()) || l.phone?.includes(searchTerm))
        : [];

    const handleSelectLead = (lead) => {
        setSelectedLead(lead);
        setNewFollowUp(prev => ({ ...prev, lead_id: lead.id }));
        setSearchTerm(lead.name);
    };

    const handleAdd = async (e) => {
        e.preventDefault();
        if (!selectedLead) return alert('Please select a lead');

        // Validate datetime is not in the past
        if (new Date(newFollowUp.scheduled_at) < new Date()) {
            return alert('Cannot schedule follow-up in the past. Please select a future date and time.');
        }

        try {
            await createFollowUp(newFollowUp);
            setShowAddForm(false);
            resetAddForm();
        } catch (error) {
            alert(error.message); // Will show "This lead already has a pending follow-up scheduled."
        }
    };

    const resetAddForm = () => {
        setNewFollowUp({ lead_id: '', scheduled_at: '', type: 'call', notes: '' });
        setSelectedLead(null);
        setSearchTerm('');
    };

    // Get the current follow-up being completed (to get lead_id)
    const currentFollowUp = showOutcomeModal ? followUps.find(f => f.id === showOutcomeModal) : null;

    const handleOutcomeSubmit = async (e) => {
        e.preventDefault();
        if (!showOutcomeModal) return;

        // Validate reschedule date is not in the past
        if ((outcomeData.outcome === 'try_again' || outcomeData.outcome === 'rescheduled') && outcomeData.reschedule_date) {
            if (new Date(outcomeData.reschedule_date) < new Date()) {
                return alert('Cannot reschedule to a past date/time. Please select a future date and time.');
            }
        }

        // Validate remind date is not in the past
        if (outcomeData.outcome === 'remind_later' && outcomeData.remind_date) {
            if (new Date(outcomeData.remind_date) < new Date()) {
                return alert('Cannot set reminder in the past. Please select a future date and time.');
            }
        }

        // If remind_later, create a cold reminder
        if (outcomeData.outcome === 'remind_later' && outcomeData.remind_date && currentFollowUp) {
            try {
                await createReminder({
                    lead_id: currentFollowUp.lead_id,
                    remind_at: outcomeData.remind_date,
                    notes: outcomeData.notes || 'Cold lead - contact later'
                });
                showToast('Reminder created for this lead', 'success');
            } catch (error) {
                showToast('Failed to create reminder', 'error');
            }
        }

        await completeFollowUp(showOutcomeModal, outcomeData);
        setShowOutcomeModal(null);
        setOutcomeData({ outcome: 'completed', notes: '', reschedule_date: '', remind_date: '' });
    };

    const getOutcomeLabel = (type) => {
        const iconStyle = { marginRight: '4px' };
        switch (type) {
            case 'completed': return <><Icon name="check-circle" size={14} style={iconStyle} /> Completed</>;
            case 'try_again': return <><Icon name="refresh-cw" size={14} style={iconStyle} /> Try Again</>;
            case 'rescheduled': return <><Icon name="calendar" size={14} style={iconStyle} /> Reschedule</>;
            case 'escalated': return <><Icon name="flame" size={14} style={iconStyle} /> Escalate to Admin</>;
            case 'rejected': return <><Icon name="x-circle" size={14} style={iconStyle} /> Reject Lead</>;
            case 'remind_later': return <><Icon name="snowflake" size={14} style={iconStyle} /> Remind Me Later</>;
            default: return type;
        }
    };

    // Get all employees for filter dropdown (from users list, not just those with follow-ups)
    const employees = isAdmin ? users.filter(u => u.role !== 'admin').map(u => u.name) : [];

    // Filter follow-ups by employee (admin only)
    const filteredFollowUps = isAdmin && employeeFilter
        ? followUps.filter(f => f.user_name === employeeFilter)
        : followUps;

    // Group by date
    const today = new Date().toDateString();
    const groupedFollowUps = filteredFollowUps.reduce((acc, f) => {
        const date = new Date(f.scheduled_at).toDateString();
        let group = 'Upcoming';
        if (date === today) group = 'Today';
        else if (new Date(f.scheduled_at) < new Date()) group = 'Overdue';

        if (!acc[group]) acc[group] = [];
        acc[group].push(f);
        return acc;
    }, {});

    return (
        <div className="content-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
                <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: '700' }}>Follow-ups</h1>
                <button className="btn btn-primary" onClick={() => setShowAddForm(true)}>
                    + Schedule Follow-up
                </button>
            </div>

            {/* Admin: Employee Filter */}
            {isAdmin && (
                <div style={{ marginBottom: 'var(--space-4)' }}>
                    <select
                        className="form-select"
                        value={employeeFilter}
                        onChange={(e) => setEmployeeFilter(e.target.value)}
                        style={{ minWidth: '180px' }}
                    >
                        <option value="">All Employees</option>
                        {employees.map(emp => (
                            <option key={emp} value={emp}>{emp}</option>
                        ))}
                    </select>
                </div>
            )}

            {isLoading && followUps.length === 0 ? (
                <div className="loading" />
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', width: '100%' }}>
                    {['Overdue', 'Today', 'Upcoming'].map(group => (
                        groupedFollowUps[group]?.length > 0 && (
                            <div key={group} className="card full-width">
                                <div className="card-header">
                                    <h2 className="card-title" style={{
                                        color: group === 'Overdue' ? 'var(--accent-danger)' :
                                            group === 'Today' ? 'var(--accent-warning)' : 'var(--text-primary)'
                                    }}>
                                        {group === 'Overdue' ? <><Icon name="alert-triangle" size={16} style={{ marginRight: '4px' }} /> </> : group === 'Today' ? <><Icon name="phone" size={16} style={{ marginRight: '4px' }} /> </> : <><Icon name="calendar" size={16} style={{ marginRight: '4px' }} /> </>}{group}
                                    </h2>
                                    <span className="pipeline-count">{groupedFollowUps[group].length}</span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                                    {groupedFollowUps[group].map(followUp => (
                                        <div
                                            key={followUp.id}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 'var(--space-4)',
                                                padding: 'var(--space-4)',
                                                background: 'var(--bg-tertiary)',
                                                borderRadius: 'var(--radius-md)',
                                                flexWrap: 'wrap'
                                            }}
                                        >
                                            <button
                                                className="btn btn-success"
                                                style={{ padding: 'var(--space-2)' }}
                                                onClick={() => setShowOutcomeModal(followUp.id)}
                                                title="Complete"
                                            >
                                                <Icon name="check" size={16} />
                                            </button>
                                            {/* Call button - triggers phone dialer on mobile */}
                                            {followUp.lead_phone && (
                                                <a
                                                    href={`tel:${followUp.lead_phone}`}
                                                    className="btn btn-primary"
                                                    style={{ padding: 'var(--space-2)', textDecoration: 'none' }}
                                                    title={`Call ${followUp.lead_phone}`}
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <Icon name="phone" size={16} />
                                                </a>
                                            )}
                                            <div style={{ flex: 1 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                    <div style={{ fontWeight: '600' }}>
                                                        {followUp.lead_name || 'Lead'}
                                                        {followUp.lead_phone && <span style={{ color: 'var(--text-muted)', fontWeight: 'normal', marginLeft: '8px' }}>({followUp.lead_phone})</span>}
                                                    </div>
                                                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                                                        {followUp.lead_location && <><Icon name="map-pin" size={12} style={{ marginRight: '2px' }} /> {followUp.lead_location}</>}
                                                    </div>
                                                </div>
                                                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', display: 'flex', gap: 'var(--space-3)', marginTop: '4px' }}>
                                                    <span style={{ textTransform: 'capitalize' }}>{followUp.type}</span>
                                                    <span>•</span>
                                                    <span>{new Date(followUp.scheduled_at).toLocaleString()}</span>
                                                </div>
                                                {followUp.lead_interest && (
                                                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--accent-primary)', marginTop: '4px' }}>
                                                        Interested in: {followUp.lead_interest} {followUp.lead_budget_max && `(Budget: ${formatBudget(followUp.lead_budget_max)})`}
                                                    </div>
                                                )}
                                                {followUp.notes && (
                                                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginTop: 'var(--space-2)', fontStyle: 'italic' }}>
                                                        "{followUp.notes}"
                                                    </div>
                                                )}
                                                {/* Show scheduled by - for admin */}
                                                {isAdmin && followUp.user_name && (
                                                    <div style={{ marginTop: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Scheduled by:</span>
                                                        <span style={{
                                                            fontSize: '11px',
                                                            background: 'var(--accent-success)',
                                                            color: 'white',
                                                            padding: '2px 8px',
                                                            borderRadius: '10px',
                                                            fontWeight: '500'
                                                        }}>
                                                            {followUp.user_name}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )
                    ))}

                    {followUps.length === 0 && (
                        <div className="card full-width">
                            <div className="empty-state">
                                <div className="empty-state-icon"><EmptyStateIcon name="calendar" /></div>
                                <p>No pending follow-ups. Schedule one to get started!</p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Add Follow-up Modal */}
            {showAddForm && (
                <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setShowAddForm(false); resetAddForm(); } }}>
                    <div className="modal">
                        <div className="modal-header">
                            <h2 className="modal-title">Schedule Follow-up</h2>
                            <button className="btn-icon" onClick={() => { setShowAddForm(false); resetAddForm(); }}><Icon name="x" size={18} /></button>
                        </div>
                        <form onSubmit={handleAdd}>
                            <div className="modal-body">
                                {/* Searchable Lead Selector */}
                                <div className="form-group" style={{ position: 'relative' }}>
                                    <label className="form-label">Search Lead *</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="Type name or phone number..."
                                        value={searchTerm}
                                        onInput={(e) => {
                                            setSearchTerm(e.target.value);
                                            if (!e.target.value) setSelectedLead(null);
                                        }}
                                        required
                                    />
                                    {searchTerm && !selectedLead && filteredLeads.length > 0 && (
                                        <div style={{
                                            position: 'absolute', top: '100%', left: 0, right: 0,
                                            background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                                            borderRadius: 'var(--radius-md)', zIndex: 10, maxHeight: '200px', overflowY: 'auto'
                                        }}>
                                            {filteredLeads.map(lead => (
                                                <div
                                                    key={lead.id}
                                                    style={{ padding: '8px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)' }}
                                                    onClick={() => handleSelectLead(lead)}
                                                >
                                                    <div>{lead.name}</div>
                                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{lead.phone} • {lead.location}</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Selected Lead Details Panel */}
                                {selectedLead && (
                                    <div style={{
                                        background: 'var(--bg-tertiary)', padding: '12px', borderRadius: 'var(--radius-md)',
                                        marginBottom: '16px', fontSize: '14px', position: 'relative'
                                    }}>
                                        <button
                                            type="button"
                                            onClick={() => { setSelectedLead(null); setSearchTerm(''); setNewFollowUp(prev => ({ ...prev, lead_id: '' })); }}
                                            style={{
                                                position: 'absolute', top: '8px', right: '8px',
                                                background: 'var(--accent-danger)', color: 'white',
                                                border: 'none', borderRadius: '50%', width: '20px', height: '20px',
                                                cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                            }}
                                            title="Change lead"
                                        >
                                            ✕
                                        </button>
                                        <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{selectedLead.name}</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                            <div><Icon name="phone" size={13} style={{ marginRight: '4px' }} /> {selectedLead.phone}</div>
                                            <div><Icon name="map-pin" size={13} style={{ marginRight: '4px' }} /> {selectedLead.location || '-'}</div>
                                            <div><Icon name="home" size={13} style={{ marginRight: '4px' }} /> {selectedLead.interest || '-'}</div>
                                            <div><Icon name="indian-rupee" size={13} style={{ marginRight: '4px' }} /> {formatBudget(selectedLead.budget_max)}</div>
                                            <div><Icon name="target" size={13} style={{ marginRight: '4px' }} /> {selectedLead.motive_to_buy || '-'}</div>
                                        </div>
                                    </div>
                                )}

                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Date & Time *</label>
                                        <input
                                            type="datetime-local"
                                            className="form-input"
                                            value={newFollowUp.scheduled_at}
                                            onInput={(e) => setNewFollowUp(f => ({ ...f, scheduled_at: e.target.value }))}
                                            min={getMinDateTime()}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Type</label>
                                        <select
                                            className="form-select"
                                            value={newFollowUp.type}
                                            onChange={(e) => setNewFollowUp(f => ({ ...f, type: e.target.value }))}
                                        >
                                            <option value="call">Call</option>
                                            <option value="whatsapp">WhatsApp</option>
                                            <option value="email">Email</option>
                                            <option value="meeting">Meeting</option>
                                            <option value="site_visit">Site Visit</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Notes</label>
                                    <textarea
                                        className="form-textarea"
                                        value={newFollowUp.notes}
                                        onInput={(e) => setNewFollowUp(f => ({ ...f, notes: e.target.value }))}
                                        placeholder="What should be discussed?"
                                        rows="3"
                                    />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => { setShowAddForm(false); resetAddForm(); }}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={!selectedLead}>Schedule</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Outcome Modal */}
            {showOutcomeModal && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowOutcomeModal(null)}>
                    <div className="modal">
                        <div className="modal-header">
                            <h2 className="modal-title">Complete Follow-up</h2>
                            <button className="btn-icon" onClick={() => setShowOutcomeModal(null)}><Icon name="x" size={18} /></button>
                        </div>
                        <form onSubmit={handleOutcomeSubmit}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Outcome *</label>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                        {['completed', 'try_again', 'rescheduled', 'remind_later', 'escalated', 'rejected'].map(type => (
                                            <div
                                                key={type}
                                                onClick={() => setOutcomeData(d => ({ ...d, outcome: type }))}
                                                style={{
                                                    padding: '10px',
                                                    border: `1px solid ${outcomeData.outcome === type ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                                                    borderRadius: 'var(--radius-md)',
                                                    background: outcomeData.outcome === type ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-secondary)',
                                                    cursor: 'pointer',
                                                    textAlign: 'center',
                                                    fontWeight: '500',
                                                    color: type === 'rejected' ? 'var(--accent-danger)' :
                                                        type === 'remind_later' ? '#0891B2' : 'inherit'
                                                }}
                                            >
                                                {getOutcomeLabel(type)}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {(outcomeData.outcome === 'try_again' || outcomeData.outcome === 'rescheduled') && (
                                    <div className="form-group">
                                        <label className="form-label">Next Follow-up Date *</label>
                                        <input
                                            type="datetime-local"
                                            className="form-input"
                                            value={outcomeData.reschedule_date}
                                            onInput={(e) => setOutcomeData(d => ({ ...d, reschedule_date: e.target.value }))}
                                            min={getMinDateTime()}
                                            required
                                        />
                                    </div>
                                )}

                                {/* Cold Lead Reminder Date Picker */}
                                {outcomeData.outcome === 'remind_later' && (
                                    <div className="form-group">
                                        <label className="form-label"><Icon name="snowflake" size={14} style={{ marginRight: '4px' }} /> Remind Me On *</label>
                                        <input
                                            type="datetime-local"
                                            className="form-input"
                                            value={outcomeData.remind_date}
                                            onInput={(e) => setOutcomeData(d => ({ ...d, remind_date: e.target.value }))}
                                            min={getMinDateTime()}
                                            required
                                        />
                                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                                            Set when you want to be reminded about this cold lead
                                        </span>
                                    </div>
                                )}

                                <div className="form-group">
                                    <label className="form-label">Outcome Notes</label>
                                    <textarea
                                        className="form-textarea"
                                        value={outcomeData.notes}
                                        onInput={(e) => setOutcomeData(d => ({ ...d, notes: e.target.value }))}
                                        placeholder="Result of the interaction..."
                                        rows="3"
                                    />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowOutcomeModal(null)}>Cancel</button>
                                <button type="submit" className="btn btn-success">Complete</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
