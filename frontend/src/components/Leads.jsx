import { useEffect, useState } from 'preact/hooks';
import { useStore, LEAD_STATUSES } from '../stores/store';
import LeadForm from './LeadForm';
import Icon, { EmptyStateIcon } from './Icons';

// Helper to mask phone number for employees
const maskPhone = (phone) => {
    if (!phone) return '-';
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 6) return '****';
    return phone.substring(0, 4) + '****' + phone.substring(phone.length - 4);
};

const maskEmail = (email) => {
    if (!email) return '-';
    const [local, domain] = email.split('@');
    if (!domain) return '****@****';
    return local.charAt(0) + '***@' + domain;
};

// Helper to format budget
const formatBudget = (value) => {
    if (!value) return '-';
    if (value >= 10000000 && value % 100000 === 0) {
        return `₹${value / 10000000}Cr`;
    }
    return `₹${value / 100000}L`;
};

/**
 * Leads Component - Kanban Pipeline View
 * SPEED: Virtual list for large datasets, optimistic updates
 * SUSTAINABILITY: Minimal re-renders with careful state management
 */
/**
 * Leads Component - Supports New, Warm, and Archived views
 */
export default function Leads({ mode = 'new' }) {
    const {
        leads, warmLeads, fetchLeads, fetchWarmLeads, isLoading,
        isModalOpen, openModal, closeModal, selectedLead, setSelectedLead,
        updateLeadStatus, convertLeadToClient, rejectLead, restoreLead, scheduleVisit, deleteLead, user,
        createReminder, showToast
    } = useStore();

    const [filter, setFilter] = useState({ status: '', search: '' });
    const [showVisitModal, setShowVisitModal] = useState(null); // lead ID to schedule
    const [visitData, setVisitData] = useState({ scheduled_at: '', location: '', notes: '' });
    const [showConvertModal, setShowConvertModal] = useState(null); // lead to convert
    const [dealData, setDealData] = useState({
        email: '',
        location: '',
        alternate_phone: '',
        deal_date: '',
        price: '',
        property_details: '',
        documents_link: ''
    });
    const [viewLeadModal, setViewLeadModal] = useState(null); // lead to view details (read-only)
    const [showReminderModal, setShowReminderModal] = useState(null); // lead to set reminder for
    const [reminderData, setReminderData] = useState({ remind_at: '', notes: '' });

    const isAdmin = user?.role === 'admin';

    // Select data source and fetch action based on mode
    const dataSource = mode === 'warm' ? warmLeads : leads;

    useEffect(() => {
        if (mode === 'warm') {
            fetchWarmLeads();
        } else if (mode === 'archived') {
            fetchLeads({ archived: '1' });
        } else if (mode === 'my-leads') {
            // Fetch all leads — we filter client-side by assigned_to
            fetchLeads();
        } else {
            // New/Active leads (default)
            fetchLeads();
        }
    }, [mode]);

    // Filtered leads for table view
    const filteredLeads = dataSource.filter(lead => {
        // Strict status filter if provided in UI
        if (filter.status && lead.status !== filter.status) return false;

        // Mode specific filtering (if data source is mixed)
        // For 'new' mode (active pipeline), hide rejected/client/warm
        if (mode === 'new') {
            if (lead.status === 'rejected' || lead.status === 'client' || lead.escalated === 1) return false;
        }

        if (filter.search) {
            const search = filter.search.toLowerCase();
            return lead.name?.toLowerCase().includes(search) ||
                lead.location?.toLowerCase().includes(search);
        }
        return true;
    });

    const handleStatusChange = async (leadId, newStatus) => {
        await updateLeadStatus(leadId, newStatus);
    };

    // Employee can only access 'new' (add lead) and 'my-leads' modes
    if (!isAdmin && mode !== 'new' && mode !== 'my-leads') {
        return <div className="content-section">Access Denied</div>;
    }

    // ========== My Leads View (Employee only) ==========
    if (!isAdmin && mode === 'my-leads') {
        const myLeads = leads.filter(lead => (lead.assigned_to === user?.id || lead.contact_person === user?.name) && lead.status !== 'rejected' && lead.status !== 'client');
        const filteredMyLeads = myLeads.filter(lead => {
            if (filter.status && lead.status !== filter.status) return false;
            if (filter.search) {
                const search = filter.search.toLowerCase();
                return lead.name?.toLowerCase().includes(search) ||
                    lead.location?.toLowerCase().includes(search) ||
                    lead.phone?.toLowerCase().includes(search);
            }
            return true;
        });

        return (
            <div className="content-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)' }}>
                    <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: '700' }}>📋 My Leads</h1>
                    <span style={{
                        background: 'var(--accent-primary)', color: 'white',
                        padding: '4px 14px', borderRadius: '20px', fontSize: '14px', fontWeight: 600
                    }}>{filteredMyLeads.length} leads</span>
                </div>

                {/* Search and Filter */}
                <div style={{ display: 'flex', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
                    <input
                        type="text"
                        className="form-input"
                        placeholder="Search by name, location, phone..."
                        value={filter.search}
                        onInput={(e) => setFilter(f => ({ ...f, search: e.target.value }))}
                        style={{ flex: 1, maxWidth: '400px' }}
                    />
                    <select
                        className="form-select"
                        value={filter.status}
                        onChange={(e) => setFilter(f => ({ ...f, status: e.target.value }))}
                    >
                        <option value="">All Statuses</option>
                        {LEAD_STATUSES.map(s => (
                            <option key={s.id} value={s.id}>{s.label}</option>
                        ))}
                    </select>
                </div>

                <div className="card">
                    {filteredMyLeads.length > 0 ? (
                        <>
                            {/* Desktop Table */}
                            <div className="table-container desktop-only">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Name</th>
                                            <th>Phone</th>
                                            <th>Location</th>
                                            <th>Budget</th>
                                            <th>Status</th>
                                            <th>Added</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredMyLeads.map(lead => (
                                            <tr key={lead.id}
                                                onClick={() => setViewLeadModal(lead)}
                                                style={{ cursor: 'pointer' }}
                                                title="Click to view details"
                                            >
                                                <td style={{ fontWeight: '500' }}>{lead.name}</td>
                                                <td>{maskPhone(lead.phone)}</td>
                                                <td>{lead.location || '-'}</td>
                                                <td>{formatBudget(lead.budget_max)}</td>
                                                <td>
                                                    <span className={`status-badge ${lead.status}`}>{lead.status}</span>
                                                </td>
                                                <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                                    {new Date(lead.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}
                                                </td>
                                                <td onClick={(e) => e.stopPropagation()}>
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        <button
                                                            className="btn btn-sm"
                                                            style={{ background: '#0891B2', color: 'white' }}
                                                            onClick={() => {
                                                                setShowReminderModal(lead);
                                                                setReminderData({ remind_at: '', notes: '' });
                                                            }}
                                                            title="Set Reminder"
                                                        >
                                                            ❄️ Remind
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile Card View */}
                            <div className="mobile-only">
                                {filteredMyLeads.map(lead => (
                                    <div key={lead.id} style={{
                                        background: 'var(--bg-tertiary)', padding: 'var(--space-4)',
                                        borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-3)',
                                        border: '1px solid var(--border-color)'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                                            <div>
                                                <div style={{ fontWeight: '600' }}>{lead.name}</div>
                                                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{lead.location || '-'}</div>
                                            </div>
                                            <span className={`status-badge ${lead.status}`}>{lead.status}</span>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px', marginBottom: '12px' }}>
                                            <div>📞 {maskPhone(lead.phone)}</div>
                                            <div>💰 {formatBudget(lead.budget_max)}</div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
                                            <button
                                                className="btn btn-sm"
                                                style={{ background: '#0891B2', color: 'white' }}
                                                onClick={() => {
                                                    setShowReminderModal(lead);
                                                    setReminderData({ remind_at: '', notes: '' });
                                                }}
                                            >
                                                ❄️ Remind
                                            </button>
                                            <button className="btn btn-sm btn-secondary" onClick={() => setViewLeadModal(lead)}>👁️ View</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <div className="empty-state">
                            <div className="empty-state-icon">📭</div>
                            <p>No leads assigned to you yet.</p>
                        </div>
                    )}
                </div>

                {/* View Lead Details Modal */}
                {viewLeadModal && (
                    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setViewLeadModal(null); }}>
                        <div className="modal" style={{ maxWidth: '550px' }}>
                            <div className="modal-header">
                                <h2 className="modal-title">👤 Lead Details</h2>
                                <button className="btn-icon" onClick={() => setViewLeadModal(null)}>✕</button>
                            </div>
                            <div className="modal-body">
                                <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                                        <div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Name</div>
                                            <div style={{ fontWeight: '600' }}>{viewLeadModal.name}</div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Phone</div>
                                            <div>{maskPhone(viewLeadModal.phone)}</div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                                        <div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Email</div>
                                            <div>{maskEmail(viewLeadModal.email)}</div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Location</div>
                                            <div>{viewLeadModal.location || '-'}</div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                                        <div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Budget</div>
                                            <div>{formatBudget(viewLeadModal.budget_max)}</div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Status</div>
                                            <span className={`status-badge ${viewLeadModal.status}`}>{viewLeadModal.status}</span>
                                        </div>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                                        <div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Interest</div>
                                            <div>{viewLeadModal.interest || '-'}</div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Motive to Buy</div>
                                            <div>{viewLeadModal.motive_to_buy || '-'}</div>
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Created</div>
                                        <div>{viewLeadModal.created_at ? new Date(viewLeadModal.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : '-'}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Cold Lead Reminder Modal */}
                {showReminderModal && (
                    <div className="modal-overlay" style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                    }}>
                        <div className="card" style={{ width: '400px', maxWidth: '90vw' }}>
                            <div className="card-header" style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <h2 className="card-title">❄️ Set Cold Lead Reminder</h2>
                            </div>
                            <form onSubmit={async (e) => {
                                e.preventDefault();
                                if (!reminderData.remind_at) {
                                    showToast('Please select a reminder date', 'error');
                                    return;
                                }
                                try {
                                    await createReminder({
                                        lead_id: showReminderModal.id,
                                        remind_at: reminderData.remind_at,
                                        notes: reminderData.notes || `Follow up with ${showReminderModal.name}`
                                    });
                                    showToast('Reminder set! Check your Dashboard when the time comes.', 'success');
                                    setShowReminderModal(null);
                                    setReminderData({ remind_at: '', notes: '' });
                                } catch (error) {
                                    showToast('Failed to set reminder', 'error');
                                }
                            }}>
                                <div className="card-content" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                                    <div style={{ padding: 'var(--space-3)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                                        <strong>{showReminderModal.name}</strong>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{showReminderModal.location || '-'}</div>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Remind Me On *</label>
                                        <input
                                            type="datetime-local"
                                            className="form-input"
                                            value={reminderData.remind_at}
                                            onInput={(e) => setReminderData(d => ({ ...d, remind_at: e.target.value }))}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Notes</label>
                                        <textarea
                                            className="form-textarea"
                                            value={reminderData.notes}
                                            onInput={(e) => setReminderData(d => ({ ...d, notes: e.target.value }))}
                                            placeholder="e.g., Wants to invest after 3 months..."
                                            rows="3"
                                        />
                                    </div>
                                </div>
                                <div className="modal-footer" style={{ borderTop: '1px solid var(--border-color)', padding: 'var(--space-4)', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                    <button type="button" className="btn btn-secondary" onClick={() => setShowReminderModal(null)}>Cancel</button>
                                    <button type="submit" className="btn btn-primary" style={{ background: '#0891B2' }}>Set Reminder</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // Employee view handling - show form and their leads
    if (!isAdmin && mode === 'new') {
        const myLeads = leads.filter(lead => lead.assigned_to === user?.id || lead.contact_person === user?.name);

        return (
            <div className="content-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)' }}>
                    <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: '700' }}>Add Lead</h1>
                </div>
                <div className="card" style={{ maxWidth: '600px', marginBottom: 'var(--space-6)' }}>
                    <div className="card-header">
                        <h2 className="card-title">Enter New Lead Details</h2>
                    </div>
                    <EmployeeLeadForm />
                </div>

                {/* My Leads Section */}
                <div className="card">
                    <div className="card-header">
                        <h2 className="card-title"><Icon name="clipboard" size={16} style={{ marginRight: '6px' }} /> My Submitted Leads ({myLeads.length})</h2>
                    </div>
                    {myLeads.length > 0 ? (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                                    <th style={{ padding: 'var(--space-3)' }}>Name</th>
                                    <th style={{ padding: 'var(--space-3)' }}>Location</th>
                                    <th style={{ padding: 'var(--space-3)' }}>Status</th>
                                    <th style={{ padding: 'var(--space-3)' }}>Added</th>
                                    <th style={{ padding: 'var(--space-3)' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {myLeads.map(lead => (
                                    <tr key={lead.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                        <td style={{ padding: 'var(--space-3)', fontWeight: '500' }}>{lead.name}</td>
                                        <td style={{ padding: 'var(--space-3)' }}>{lead.location || '-'}</td>
                                        <td style={{ padding: 'var(--space-3)' }}>
                                            <span className={`status-badge ${lead.status}`}>{lead.status}</span>
                                        </td>
                                        <td style={{ padding: 'var(--space-3)', fontSize: '12px', color: 'var(--text-muted)' }}>
                                            {new Date(lead.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}
                                        </td>
                                        <td style={{ padding: 'var(--space-3)' }}>
                                            <button
                                                className="btn btn-sm"
                                                style={{ background: '#0891B2', color: 'white' }}
                                                onClick={() => {
                                                    setShowReminderModal(lead);
                                                    setReminderData({ remind_at: '', notes: '' });
                                                }}
                                                title="Set Reminder (Cold Lead)"
                                            >
                                                <Icon name="snowflake" size={13} style={{ marginRight: '3px' }} /> Remind
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>
                            No leads submitted yet. Add your first lead above!
                        </div>
                    )}
                </div>

                {/* Cold Lead Reminder Modal for Employees */}
                {showReminderModal && (
                    <div className="modal-overlay" style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                    }}>
                        <div className="card" style={{ width: '400px', maxWidth: '90vw' }}>
                            <div className="card-header" style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <h2 className="card-title"><Icon name="snowflake" size={16} style={{ marginRight: '6px' }} /> Set Cold Lead Reminder</h2>
                            </div>
                            <form onSubmit={async (e) => {
                                e.preventDefault();
                                if (!reminderData.remind_at) {
                                    showToast('Please select a reminder date', 'error');
                                    return;
                                }
                                try {
                                    await createReminder({
                                        lead_id: showReminderModal.id,
                                        remind_at: reminderData.remind_at,
                                        notes: reminderData.notes || `Follow up with ${showReminderModal.name}`
                                    });
                                    showToast('Reminder set! Check your Dashboard when the time comes.', 'success');
                                    setShowReminderModal(null);
                                    setReminderData({ remind_at: '', notes: '' });
                                } catch (error) {
                                    showToast('Failed to set reminder', 'error');
                                }
                            }}>
                                <div className="card-content" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                                    <div style={{ padding: 'var(--space-3)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                                        <strong>{showReminderModal.name}</strong>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{showReminderModal.phone || showReminderModal.location}</div>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Remind Me On *</label>
                                        <input
                                            type="datetime-local"
                                            className="form-input"
                                            value={reminderData.remind_at}
                                            onInput={(e) => setReminderData(d => ({ ...d, remind_at: e.target.value }))}
                                            required
                                        />
                                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                                            This lead will appear on your Dashboard when this time arrives
                                        </span>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Notes (why are they delaying?)</label>
                                        <textarea
                                            className="form-textarea"
                                            value={reminderData.notes}
                                            onInput={(e) => setReminderData(d => ({ ...d, notes: e.target.value }))}
                                            placeholder="e.g., Wants to invest after 3 months, waiting for bonus..."
                                            rows="3"
                                        />
                                    </div>
                                </div>
                                <div className="modal-footer" style={{ borderTop: '1px solid var(--border-color)', padding: 'var(--space-4)', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                    <button type="button" className="btn btn-secondary" onClick={() => setShowReminderModal(null)}>Cancel</button>
                                    <button type="submit" className="btn btn-primary" style={{ background: '#0891B2' }}>Set Reminder</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    const getTitle = () => {
        switch (mode) {
            case 'warm': return <><Icon name="flame" size={20} style={{ marginRight: '6px' }} /> Warm Leads (Escalated)</>;
            case 'archived': return <><Icon name="trash" size={20} style={{ marginRight: '6px' }} /> Archived / Rejected Leads</>;
            default: return 'New Leads';
        }
    };

    return (
        <div className="content-section">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)' }}>
                <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: '700' }}>{getTitle()}</h1>
                <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                    {mode === 'new' && (
                        <button className="btn btn-primary" onClick={openModal}>
                            + New Lead
                        </button>
                    )}
                </div>
            </div>

            {/* Search and Filter */}
            <div style={{ display: 'flex', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
                <input
                    type="text"
                    className="form-input"
                    placeholder="Search leads..."
                    value={filter.search}
                    onInput={(e) => setFilter(f => ({ ...f, search: e.target.value }))}
                    style={{ flex: 1, maxWidth: '400px' }}
                />
                {mode === 'new' && (
                    <select
                        className="form-select"
                        value={filter.status}
                        onChange={(e) => setFilter(f => ({ ...f, status: e.target.value }))}
                    >
                        <option value="">All Statuses</option>
                        {LEAD_STATUSES.map(s => (
                            <option key={s.id} value={s.id}>{s.label}</option>
                        ))}
                    </select>
                )}
            </div>

            {isLoading && dataSource.length === 0 ? (
                <div className="loading" />
            ) : (
                /* Table View (Default) */
                <div className="card full-width">
                    <div className="table-container desktop-only">
                        <table>
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Phone</th>
                                    <th>Location</th>
                                    <th>Budget</th>
                                    <th>Status</th>
                                    {mode === 'warm' && <th>Escalated Info</th>}
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredLeads.map(lead => (
                                    <tr
                                        key={lead.id}
                                        onClick={() => setViewLeadModal(lead)}
                                        style={{ cursor: 'pointer' }}
                                        title="Click to view details"
                                    >
                                        <td style={{ fontWeight: '500' }}>{lead.name}</td>
                                        <td>{lead.phone || '-'}</td>
                                        <td>{lead.location || '-'}</td>
                                        <td>{formatBudget(lead.budget_max)}</td>
                                        <td onClick={(e) => e.stopPropagation()}>
                                            {mode === 'new' ? (
                                                <select
                                                    className="form-select"
                                                    value={lead.status}
                                                    onChange={(e) => handleStatusChange(lead.id, e.target.value)}
                                                    style={{ padding: 'var(--space-1) var(--space-2)', fontSize: 'var(--text-xs)' }}
                                                >
                                                    {LEAD_STATUSES.map(s => (
                                                        <option key={s.id} value={s.id}>{s.label}</option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <span className={`status-badge ${lead.status}`}>{lead.status}</span>
                                            )}
                                        </td>
                                        {mode === 'warm' && (
                                            <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                                {lead.interest ? `Interested in ${lead.interest}` : '-'}
                                            </td>
                                        )}
                                        <td onClick={(e) => e.stopPropagation()}>
                                            {mode === 'warm' ? (
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <button
                                                        className="btn btn-sm btn-primary"
                                                        onClick={() => setShowConvertModal(lead)}
                                                        title="Convert to Client"
                                                    >
                                                        Convert
                                                    </button>
                                                    <button
                                                        className="btn btn-sm"
                                                        style={{ background: 'var(--accent-warning)', color: 'white' }}
                                                        onClick={() => setShowVisitModal(lead)}
                                                        title="Schedule Site Visit"
                                                    >
                                                        <Icon name="calendar" size={13} style={{ marginRight: '3px' }} /> Visit
                                                    </button>
                                                    <button
                                                        className="btn btn-sm"
                                                        style={{ background: '#0891B2', color: 'white' }}
                                                        onClick={() => {
                                                            setShowReminderModal(lead);
                                                            setReminderData({ remind_at: '', notes: '' });
                                                        }}
                                                        title="Set Reminder (Cold Lead)"
                                                    >
                                                        <Icon name="snowflake" size={13} style={{ marginRight: '3px' }} /> Remind
                                                    </button>
                                                    <button
                                                        className="btn btn-sm btn-danger"
                                                        onClick={() => rejectLead(lead.id)}
                                                        title="Reject / Archive"
                                                    >
                                                        Reject
                                                    </button>
                                                    <button
                                                        className="btn btn-sm"
                                                        style={{ background: '#666' }}
                                                        onClick={() => {
                                                            if (window.confirm('Delete this lead permanently?')) {
                                                                console.log('Deleting lead:', lead.id);
                                                                deleteLead(lead.id);
                                                            }
                                                        }}
                                                        title="Delete Permanently"
                                                    >
                                                        <Icon name="trash" size={14} />
                                                    </button>
                                                </div>
                                            ) : mode === 'archived' ? (
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <button
                                                        className="btn btn-sm btn-secondary"
                                                        onClick={() => setViewLeadModal(lead)}
                                                        title="View Details"
                                                    >
                                                        <Icon name="eye" size={14} />
                                                    </button>
                                                    <button
                                                        className="btn btn-sm btn-primary"
                                                        onClick={() => {
                                                            if (window.confirm('Restore this lead to Warm Leads?')) {
                                                                restoreLead(lead.id);
                                                            }
                                                        }}
                                                        title="Restore to Warm Leads"
                                                    >
                                                        <Icon name="rotate-ccw" size={14} />
                                                    </button>
                                                    <button
                                                        className="btn btn-sm"
                                                        style={{ background: '#666' }}
                                                        onClick={() => {
                                                            if (window.confirm('Delete this lead permanently?')) {
                                                                deleteLead(lead.id);
                                                            }
                                                        }}
                                                        title="Delete Permanently"
                                                    >
                                                        <Icon name="trash" size={14} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <button
                                                        className="btn-icon"
                                                        onClick={() => { setSelectedLead(lead); openModal(); }}
                                                    >
                                                        <Icon name="pencil" size={14} />
                                                    </button>
                                                    <button
                                                        className="btn btn-sm"
                                                        style={{ background: '#666' }}
                                                        onClick={() => {
                                                            if (window.confirm('Delete this lead permanently?')) {
                                                                console.log('Deleting lead:', lead.id);
                                                                deleteLead(lead.id);
                                                            }
                                                        }}
                                                        title="Delete"
                                                    >
                                                        <Icon name="trash" size={14} />
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile Card View */}
                    <div className="mobile-only">
                        {filteredLeads.map(lead => (
                            <div key={lead.id} style={{
                                background: 'var(--bg-tertiary)',
                                padding: 'var(--space-4)',
                                borderRadius: 'var(--radius-md)',
                                marginBottom: 'var(--space-3)',
                                border: '1px solid var(--border-color)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                                    <div>
                                        <div style={{ fontWeight: '600' }}>{lead.name}</div>
                                        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{lead.location}</div>
                                    </div>
                                    <div>
                                        {mode === 'new' ? (
                                            <select
                                                className="form-select"
                                                value={lead.status}
                                                onChange={(e) => handleStatusChange(lead.id, e.target.value)}
                                                style={{ padding: '4px', fontSize: '12px' }}
                                            >
                                                {LEAD_STATUSES.map(s => (
                                                    <option key={s.id} value={s.id}>{s.label}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <span className={`status-badge ${lead.status}`}>{lead.status}</span>
                                        )}
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px', marginBottom: '12px' }}>
                                    <div><Icon name="phone" size={12} style={{ marginRight: '3px' }} /> {lead.phone || '-'}</div>
                                    <div><Icon name="indian-rupee" size={12} style={{ marginRight: '3px' }} /> {formatBudget(lead.budget_max)}</div>
                                    {mode === 'warm' && <div style={{ gridColumn: 'span 2' }}><Icon name="info" size={12} style={{ marginRight: '3px' }} /> {lead.interest}</div>}
                                </div>

                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
                                    {mode === 'warm' ? (
                                        <>
                                            <button className="btn btn-sm btn-primary" onClick={() => setShowConvertModal(lead)}>Convert</button>
                                            <button className="btn btn-sm" style={{ background: 'var(--accent-warning)', color: 'white' }} onClick={() => setShowVisitModal(lead)}>Visit</button>
                                        </>
                                    ) : (
                                        <button className="btn btn-sm btn-secondary" onClick={() => { setSelectedLead(lead); openModal(); }}>View Details</button>
                                    )}
                                    <button className="btn btn-sm btn-danger" onClick={() => deleteLead(lead.id)}><Icon name="trash" size={14} /></button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {filteredLeads.length === 0 && (
                        <div className="empty-state">
                            <div className="empty-state-icon"><EmptyStateIcon name="inbox" /></div>
                            <p>No leads found in this view.</p>
                        </div>
                    )}
                </div>
            )}

            {/* Lead Form Modal */}
            {isModalOpen && <LeadForm />}

            {/* Visit Scheduling Modal */}
            {showVisitModal && (
                <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setShowVisitModal(null); setVisitData({ scheduled_at: '', location: '', notes: '' }); } }}>
                    <div className="modal">
                        <div className="modal-header">
                            <h2 className="modal-title"><Icon name="calendar" size={18} style={{ marginRight: '6px' }} /> Schedule Site Visit</h2>
                            <button className="btn-icon" onClick={() => { setShowVisitModal(null); setVisitData({ scheduled_at: '', location: '', notes: '' }); }}><Icon name="x" size={18} /></button>
                        </div>
                        <form onSubmit={async (e) => {
                            e.preventDefault();
                            await scheduleVisit({ ...visitData, lead_id: showVisitModal.id });
                            setShowVisitModal(null);
                            setVisitData({ scheduled_at: '', location: '', notes: '' });
                        }}>
                            <div className="modal-body">
                                <div style={{ background: 'var(--bg-tertiary)', padding: '12px', borderRadius: 'var(--radius-md)', marginBottom: '16px' }}>
                                    <strong>{showVisitModal.name}</strong>
                                    <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
                                        {showVisitModal.phone} • {showVisitModal.location}
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Visit Date & Time *</label>
                                    <input
                                        type="datetime-local"
                                        className="form-input"
                                        value={visitData.scheduled_at}
                                        onInput={(e) => setVisitData(v => ({ ...v, scheduled_at: e.target.value }))}
                                        min={(() => {
                                            const now = new Date();
                                            return now.getFullYear() + '-' +
                                                String(now.getMonth() + 1).padStart(2, '0') + '-' +
                                                String(now.getDate()).padStart(2, '0') + 'T' +
                                                String(now.getHours()).padStart(2, '0') + ':' +
                                                String(now.getMinutes()).padStart(2, '0');
                                        })()}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Location / Property</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={visitData.location}
                                        onInput={(e) => setVisitData(v => ({ ...v, location: e.target.value }))}
                                        placeholder="e.g., Green Valley, Sector 62"
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Notes</label>
                                    <textarea
                                        className="form-input"
                                        value={visitData.notes}
                                        onInput={(e) => setVisitData(v => ({ ...v, notes: e.target.value }))}
                                        rows="2"
                                    />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => { setShowVisitModal(null); setVisitData({ scheduled_at: '', location: '', notes: '' }); }}>Cancel</button>
                                <button type="submit" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Icon name="calendar" size={14} /> Schedule Visit</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Convert to Client Modal */}
            {showConvertModal && (
                <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setShowConvertModal(null); setDealData({ email: '', location: '', alternate_phone: '', deal_date: '', price: '', property_details: '', documents_link: '' }); } }}>
                    <div className="modal" style={{ maxWidth: '600px' }}>
                        <div className="modal-header">
                            <h2 className="modal-title"><Icon name="trophy" size={18} style={{ marginRight: '6px' }} /> Convert to Client</h2>
                            <button className="btn-icon" onClick={() => { setShowConvertModal(null); setDealData({ email: '', location: '', alternate_phone: '', deal_date: '', price: '', property_details: '', documents_link: '' }); }}><Icon name="x" size={18} /></button>
                        </div>
                        <form onSubmit={async (e) => {
                            e.preventDefault();
                            await convertLeadToClient(showConvertModal.id, dealData);
                            setShowConvertModal(null);
                            setDealData({ email: '', location: '', alternate_phone: '', deal_date: '', price: '', property_details: '', documents_link: '' });
                        }}>
                            <div className="modal-body">
                                {/* Read-only lead info */}
                                <div style={{ background: 'var(--bg-tertiary)', padding: '12px', borderRadius: 'var(--radius-md)', marginBottom: '16px' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                        <div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Name</div>
                                            <div style={{ fontWeight: '600' }}>{showConvertModal.name}</div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Primary Phone</div>
                                            <div style={{ fontWeight: '600' }}>{showConvertModal.phone}</div>
                                        </div>
                                    </div>
                                </div>

                                <h4 style={{ margin: '0 0 var(--space-3)', color: 'var(--text-secondary)' }}>Client Details</h4>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Email</label>
                                        <input
                                            type="email"
                                            className="form-input"
                                            value={dealData.email}
                                            onInput={(e) => setDealData(d => ({ ...d, email: e.target.value }))}
                                            placeholder="client@email.com"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Alternate Phone</label>
                                        <input
                                            type="tel"
                                            className="form-input"
                                            value={dealData.alternate_phone}
                                            onInput={(e) => setDealData(d => ({ ...d, alternate_phone: e.target.value }))}
                                            placeholder="Optional alternate number"
                                        />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Location / Address</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={dealData.location}
                                        onInput={(e) => setDealData(d => ({ ...d, location: e.target.value }))}
                                        placeholder="Client's address"
                                    />
                                </div>

                                <hr style={{ margin: 'var(--space-4) 0', borderColor: 'var(--border-color)' }} />
                                <h4 style={{ margin: '0 0 var(--space-3)', color: 'var(--text-secondary)' }}>Deal Information</h4>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Deal Date *</label>
                                        <input
                                            type="date"
                                            className="form-input"
                                            value={dealData.deal_date}
                                            onInput={(e) => setDealData(d => ({ ...d, deal_date: e.target.value }))}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Price (₹)</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            value={dealData.price}
                                            onInput={(e) => setDealData(d => ({ ...d, price: e.target.value }))}
                                            placeholder="e.g. 5000000"
                                        />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Property Details</label>
                                    <textarea
                                        className="form-input"
                                        rows="3"
                                        value={dealData.property_details}
                                        onInput={(e) => setDealData(d => ({ ...d, property_details: e.target.value }))}
                                        placeholder="Description of the property sold..."
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Documents Link (Google Drive)</label>
                                    <input
                                        type="url"
                                        className="form-input"
                                        value={dealData.documents_link}
                                        onInput={(e) => setDealData(d => ({ ...d, documents_link: e.target.value }))}
                                        placeholder="https://drive.google.com/..."
                                    />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => { setShowConvertModal(null); setDealData({ email: '', location: '', alternate_phone: '', deal_date: '', price: '', property_details: '', documents_link: '' }); }}>Cancel</button>
                                <button type="submit" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Icon name="trophy" size={14} /> Convert to Client</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* View Lead Details Modal (Read-only for archived leads) */}
            {viewLeadModal && (
                <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setViewLeadModal(null); }}>
                    <div className="modal" style={{ maxWidth: '550px' }}>
                        <div className="modal-header">
                            <h2 className="modal-title"><Icon name="user" size={18} style={{ marginRight: '6px' }} /> Lead Details</h2>
                            <button className="btn-icon" onClick={() => setViewLeadModal(null)}><Icon name="x" size={18} /></button>
                        </div>
                        <div className="modal-body">
                            <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                                    <div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Name</div>
                                        <div style={{ fontWeight: '600' }}>{viewLeadModal.name}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Phone</div>
                                        <div>{viewLeadModal.phone || '-'}</div>
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                                    <div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Email</div>
                                        <div>{viewLeadModal.email || '-'}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Location</div>
                                        <div>{viewLeadModal.location || '-'}</div>
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                                    <div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Budget</div>
                                        <div>{viewLeadModal.budget_max ? `₹${Number(viewLeadModal.budget_max).toLocaleString()}` : '-'}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Status</div>
                                        <span className={`status-badge ${viewLeadModal.status}`}>{viewLeadModal.status}</span>
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                                    <div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Source</div>
                                        <div>{viewLeadModal.source || '-'}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Interest</div>
                                        <div>{viewLeadModal.interest || '-'}</div>
                                    </div>
                                </div>
                                {/* Submitted By - who added this lead */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                                    <div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Submitted By</div>
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            color: viewLeadModal.contact_person ? 'var(--text-primary)' : 'var(--text-muted)'
                                        }}>
                                            {viewLeadModal.contact_person ? (
                                                <>
                                                    <span style={{
                                                        background: 'var(--accent-primary)',
                                                        color: 'white',
                                                        padding: '2px 8px',
                                                        borderRadius: '12px',
                                                        fontSize: '12px',
                                                        fontWeight: '500'
                                                    }}>
                                                        {viewLeadModal.contact_person}
                                                    </span>
                                                </>
                                            ) : '-'}
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Motive to Buy</div>
                                        <div>{viewLeadModal.motive_to_buy || '-'}</div>
                                    </div>
                                </div>
                                {viewLeadModal.notes && (
                                    <div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Notes</div>
                                        <div style={{ whiteSpace: 'pre-wrap', background: 'var(--bg-tertiary)', padding: '12px', borderRadius: 'var(--radius-md)' }}>{viewLeadModal.notes}</div>
                                    </div>
                                )}
                                <hr style={{ borderColor: 'var(--border-color)' }} />
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                                    <div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Created</div>
                                        <div>{viewLeadModal.created_at ? new Date(viewLeadModal.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : '-'}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Last Updated</div>
                                        <div>{viewLeadModal.updated_at ? new Date(viewLeadModal.updated_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : '-'}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button type="button" className="btn btn-secondary" onClick={() => setViewLeadModal(null)}>Close</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Cold Lead Reminder Modal */}
            {showReminderModal && (
                <div className="modal-overlay" style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                }}>
                    <div className="card" style={{ width: '400px', maxWidth: '90vw' }}>
                        <div className="card-header" style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <h2 className="card-title"><Icon name="snowflake" size={16} style={{ marginRight: '6px' }} /> Set Cold Lead Reminder</h2>
                        </div>
                        <form onSubmit={async (e) => {
                            e.preventDefault();
                            if (!reminderData.remind_at) {
                                showToast('Please select a reminder date', 'error');
                                return;
                            }
                            try {
                                await createReminder({
                                    lead_id: showReminderModal.id,
                                    remind_at: reminderData.remind_at,
                                    notes: reminderData.notes || `Follow up with ${showReminderModal.name}`
                                });
                                showToast('Reminder set! You will be notified on your dashboard.', 'success');
                                setShowReminderModal(null);
                                setReminderData({ remind_at: '', notes: '' });
                            } catch (error) {
                                showToast('Failed to set reminder', 'error');
                            }
                        }}>
                            <div className="card-content" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                                <div style={{ padding: 'var(--space-3)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                                    <strong>{showReminderModal.name}</strong>
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{showReminderModal.phone}</div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Remind Me On *</label>
                                    <input
                                        type="datetime-local"
                                        className="form-input"
                                        value={reminderData.remind_at}
                                        onInput={(e) => setReminderData(d => ({ ...d, remind_at: e.target.value }))}
                                        required
                                    />
                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                                        The lead will appear on your dashboard when this date arrives
                                    </span>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Notes (reason for delay)</label>
                                    <textarea
                                        className="form-textarea"
                                        value={reminderData.notes}
                                        onInput={(e) => setReminderData(d => ({ ...d, notes: e.target.value }))}
                                        placeholder="e.g., Client wants to invest after 3 months, waiting for bonus..."
                                        rows="3"
                                    />
                                </div>
                            </div>
                            <div className="modal-footer" style={{ borderTop: '1px solid var(--border-color)', padding: 'var(--space-4)', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setShowReminderModal(null)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" style={{ background: '#0891B2' }}>Set Reminder</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

// Simplified form for employees - only input, no viewing data
function EmployeeLeadForm() {
    const { createLead, user } = useStore();
    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        email: '',
        budget_min: '',
        budget_max: '',
        location: '',
        interest: '',
        motive_to_buy: '',
        contact_person: user?.name || '',
        source: '',
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            const data = {
                ...formData,
                budget_min: formData.budget_min ? parseFloat(formData.budget_min) * 100000 : null,
                budget_max: formData.budget_max ? parseFloat(formData.budget_max) * 100000 : null,
                assigned_to: user?.id || null,
            };

            await createLead(data);
            setSuccess(true);
            setFormData({
                name: '', phone: '', email: '', budget_min: '', budget_max: '',
                location: '', interest: '', motive_to_buy: '', contact_person: '', source: '',
            });
            setTimeout(() => setSuccess(false), 3000);
        } catch (error) {
            console.error('Failed to create lead:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const locations = ['Gurugram', 'Noida', 'Delhi', 'Faridabad', 'Ghaziabad', 'Greater Noida', 'Dwarka', 'South Delhi', 'North Delhi'];

    return (
        <form onSubmit={handleSubmit} style={{ padding: 'var(--space-4)' }}>
            {success && (
                <div style={{
                    background: 'rgba(34, 197, 94, 0.1)',
                    border: '1px solid var(--accent-success)',
                    borderRadius: 'var(--radius-md)',
                    padding: 'var(--space-3)',
                    marginBottom: 'var(--space-4)',
                    color: 'var(--accent-success)',
                }}>
                    <Icon name="check-circle" size={16} style={{ marginRight: '4px' }} /> Lead added successfully!
                </div>
            )}

            <div className="form-row">
                <div className="form-group">
                    <label className="form-label">Name *</label>
                    <input type="text" name="name" className="form-input" value={formData.name} onInput={handleChange} required />
                </div>
                <div className="form-group">
                    <label className="form-label">Phone</label>
                    <input type="tel" name="phone" className="form-input" value={formData.phone} onInput={handleChange} placeholder="+91 9876543210" />
                </div>
            </div>

            <div className="form-group">
                <label className="form-label">Email</label>
                <input type="email" name="email" className="form-input" value={formData.email} onInput={handleChange} />
            </div>

            <div className="form-row">
                <div className="form-group">
                    <label className="form-label">Budget Min (Lakhs)</label>
                    <input type="number" name="budget_min" className="form-input" value={formData.budget_min} onInput={handleChange} min="0" />
                </div>
                <div className="form-group">
                    <label className="form-label">Budget Max (Lakhs)</label>
                    <input type="number" name="budget_max" className="form-input" value={formData.budget_max} onInput={handleChange} min="0" />
                </div>
            </div>

            {/* Location and Interest - with custom entry support */}
            <div className="form-row">
                <div className="form-group">
                    <label className="form-label">Location</label>
                    <input
                        type="text"
                        name="location"
                        className="form-input"
                        value={formData.location}
                        onInput={handleChange}
                        placeholder="Type or select location"
                        list="emp-location-options"
                    />
                    <datalist id="emp-location-options">
                        {locations.map(loc => <option key={loc} value={loc} />)}
                    </datalist>
                </div>
                <div className="form-group">
                    <label className="form-label">Interest</label>
                    <input
                        type="text"
                        name="interest"
                        className="form-input"
                        value={formData.interest}
                        onInput={handleChange}
                        placeholder="Type or select property type"
                        list="emp-interest-options"
                    />
                    <datalist id="emp-interest-options">
                        <option value="1 BHK" />
                        <option value="2 BHK" />
                        <option value="3 BHK" />
                        <option value="4 BHK" />
                        <option value="Villa" />
                        <option value="Plot" />
                        <option value="Commercial" />
                        <option value="Penthouse" />
                        <option value="Studio" />
                    </datalist>
                </div>
            </div>

            {/* Motive to Buy - with custom entry support */}
            <div className="form-group">
                <label className="form-label">Motive to Buy</label>
                <input
                    type="text"
                    name="motive_to_buy"
                    className="form-input"
                    value={formData.motive_to_buy}
                    onInput={handleChange}
                    placeholder="Type or select motive"
                    list="emp-motive-options"
                />
                <datalist id="emp-motive-options">
                    <option value="Investment" />
                    <option value="Self Use" />
                    <option value="Relocation" />
                    <option value="Upgrade" />
                    <option value="First Home" />
                    <option value="Rental Income" />
                    <option value="Office Space" />
                </datalist>
            </div>

            <div className="form-row">
                <div className="form-group">
                    <label className="form-label">Submitted By</label>
                    <input
                        type="text"
                        name="contact_person"
                        className="form-input"
                        value={user?.name || 'You'}
                        disabled
                        readOnly
                        style={{
                            background: 'var(--bg-tertiary)',
                            cursor: 'not-allowed',
                            color: 'var(--text-secondary)'
                        }}
                        title="Auto-filled with your name"
                    />
                </div>
                <div className="form-group">
                    <label className="form-label">Source</label>
                    <input
                        type="text"
                        name="source"
                        className="form-input"
                        value={formData.source}
                        onInput={handleChange}
                        placeholder="e.g., Facebook, Referral, Walk-in"
                    />
                </div>
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 'var(--space-4)' }} disabled={isSubmitting}>
                {isSubmitting ? 'Adding Lead...' : '+ Add Lead'}
            </button>
        </form>
    );
}
