import { useEffect, useState } from 'preact/hooks';
import { useStore } from '../stores/store';
import Icon, { EmptyStateIcon } from './Icons';

/**
 * Team Management Component - Admin Only
 * Allows admin to create and manage employee accounts
 * Shows detailed employee stats and lead submissions
 */
export default function Team() {
    const { user, users, fetchUsers, deleteUser, registerUser, leads, fetchLeads } = useStore();
    const [showAddForm, setShowAddForm] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        role: 'agent',
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });
    const [selectedEmployee, setSelectedEmployee] = useState(null); // For viewing employee details

    const isAdmin = user?.role === 'admin';

    useEffect(() => {
        fetchUsers();
        fetchLeads(); // Fetch leads to compute employee stats
    }, []);

    // Compute employee stats from leads
    const getEmployeeStats = (employeeName) => {
        const employeeLeads = leads.filter(l => l.contact_person === employeeName);
        const escalatedLeads = employeeLeads.filter(l => l.escalated === 1);
        const rejectedLeads = employeeLeads.filter(l => l.status === 'rejected');
        const convertedLeads = employeeLeads.filter(l => l.status === 'client');

        return {
            total: employeeLeads.length,
            escalated: escalatedLeads.length,
            rejected: rejectedLeads.length,
            converted: convertedLeads.length,
            leads: employeeLeads
        };
    };

    // If not admin, show access denied
    if (!isAdmin) {
        return (
            <div className="content-section">
                <div className="card" style={{ textAlign: 'center', padding: 'var(--space-12)' }}>
                    <div style={{ fontSize: '48px', marginBottom: 'var(--space-4)' }}><Icon name="lock" size={48} /></div>
                    <h2>Access Restricted</h2>
                    <p style={{ color: 'var(--text-muted)' }}>This section is only accessible to administrators.</p>
                </div>
            </div>
        );
    }

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setMessage({ type: '', text: '' });

        try {
            await registerUser(formData);
            setMessage({ type: 'success', text: 'Employee account created successfully!' });
            resetForm();
            setShowAddForm(false);
        } catch (error) {
            setMessage({ type: 'error', text: error.message || 'Failed to create account' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const resetForm = () => {
        setFormData({ name: '', email: '', password: '', role: 'agent' });
        setMessage({ type: '', text: '' });
    };

    const handleCloseModal = () => {
        setShowAddForm(false);
        resetForm();
    };

    const employees = users.filter(u => u.role !== 'admin');
    const admins = users.filter(u => u.role === 'admin');

    // Get total escalations for summary
    const totalEscalations = leads.filter(l => l.escalated === 1).length;

    return (
        <div className="content-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)' }}>
                <div>
                    <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: '700' }}>Team</h1>
                    <p style={{ color: 'var(--text-muted)', marginTop: 'var(--space-1)' }}>
                        Manage employee accounts
                    </p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowAddForm(true)}>
                    + Add Employee
                </button>
            </div>

            {message.text && (
                <div style={{
                    background: message.type === 'success' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    border: `1px solid ${message.type === 'success' ? 'var(--accent-success)' : 'var(--accent-danger)'}`,
                    borderRadius: 'var(--radius-md)',
                    padding: 'var(--space-3)',
                    marginBottom: 'var(--space-4)',
                    color: message.type === 'success' ? 'var(--accent-success)' : 'var(--accent-danger)',
                }}>
                    {message.type === 'success' ? <Icon name="check-circle" size={16} style={{ marginRight: '4px' }} /> : <Icon name="x-circle" size={16} style={{ marginRight: '4px' }} />} {message.text}
                </div>
            )}

            {/* Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
                <div className="stat-card">
                    <span className="stat-label">Total Team</span>
                    <span className="stat-value">{users.length}</span>
                </div>
                <div className="stat-card">
                    <span className="stat-label">Employees</span>
                    <span className="stat-value">{employees.length}</span>
                </div>
                <div className="stat-card">
                    <span className="stat-label">Total Leads</span>
                    <span className="stat-value">{leads.length}</span>
                </div>
                <div className="stat-card" style={{ borderLeft: '3px solid var(--accent-warning)' }}>
                    <span className="stat-label"><Icon name="flame" size={14} style={{ marginRight: '3px' }} /> Escalations</span>
                    <span className="stat-value" style={{ color: 'var(--accent-warning)' }}>{totalEscalations}</span>
                </div>
            </div>

            {/* Team List */}
            <div className="card full-width">
                <div className="card-header">
                    <h2 className="card-title">Team Members</h2>
                </div>
                {users.length > 0 ? (
                    <>
                        <div className="table-container desktop-only">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Email</th>
                                        <th>Role</th>
                                        <th><Icon name="clipboard" size={14} style={{ marginRight: '3px' }} /> Submitted</th>
                                        <th><Icon name="flame" size={14} style={{ marginRight: '3px' }} /> Escalated</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map(member => {
                                        const stats = member.role !== 'admin' ? getEmployeeStats(member.name) : null;
                                        return (
                                            <tr key={member.id}>
                                                <td style={{ fontWeight: '600' }}>{member.name}</td>
                                                <td>{member.email}</td>
                                                <td>
                                                    <span style={{
                                                        background: member.role === 'admin' ? 'var(--accent-primary)' : 'var(--accent-success)',
                                                        color: 'white',
                                                        padding: '2px 8px',
                                                        borderRadius: 'var(--radius-sm)',
                                                        fontSize: 'var(--text-xs)',
                                                        textTransform: 'uppercase',
                                                    }}>
                                                        {member.role}
                                                    </span>
                                                </td>
                                                <td>
                                                    {stats ? (
                                                        <span style={{ fontWeight: '600', color: 'var(--accent-primary)' }}>{stats.total}</span>
                                                    ) : '-'}
                                                </td>
                                                <td>
                                                    {stats ? (
                                                        <span style={{
                                                            fontWeight: '600',
                                                            color: stats.escalated > 0 ? 'var(--accent-warning)' : 'var(--text-muted)'
                                                        }}>
                                                            {stats.escalated}
                                                        </span>
                                                    ) : '-'}
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        {member.role !== 'admin' && (
                                                            <button
                                                                className="btn btn-sm btn-secondary"
                                                                onClick={() => setSelectedEmployee(member)}
                                                                title="View Details"
                                                            >
                                                                <Icon name="eye" size={14} style={{ marginRight: '3px' }} /> Details
                                                            </button>
                                                        )}
                                                        {member.role !== 'admin' && (
                                                            <button
                                                                className="btn btn-sm"
                                                                style={{ background: '#666', padding: '4px 8px' }}
                                                                onClick={async () => {
                                                                    if (window.confirm(`Are you sure you want to delete ${member.name}? This cannot be undone.`)) {
                                                                        try {
                                                                            await deleteUser(member.id);
                                                                        } catch (err) {
                                                                            alert('Failed to delete user: ' + err.message);
                                                                        }
                                                                    }
                                                                }}
                                                                title="Delete Employee"
                                                            >
                                                                <Icon name="trash" size={14} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile Card View */}
                        <div className="mobile-only">
                            {users.map(member => (
                                <div key={member.id} style={{
                                    background: 'var(--bg-tertiary)',
                                    padding: 'var(--space-4)',
                                    borderRadius: 'var(--radius-md)',
                                    marginBottom: 'var(--space-3)',
                                    border: '1px solid var(--border-color)',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <div>
                                        <div style={{ fontWeight: '600', marginBottom: '4px' }}>{member.name}</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>{member.email}</div>
                                        <span style={{
                                            background: member.role === 'admin' ? 'var(--accent-primary)' : 'var(--accent-success)',
                                            color: 'white',
                                            padding: '2px 8px',
                                            borderRadius: 'var(--radius-sm)',
                                            fontSize: '10px',
                                            textTransform: 'uppercase',
                                        }}>
                                            {member.role}
                                        </span>
                                    </div>
                                    <div>
                                        {member.role !== 'admin' && (
                                            <button
                                                className="btn btn-sm"
                                                style={{ background: '#666', padding: '8px' }}
                                                onClick={async () => {
                                                    if (window.confirm(`Are you sure you want to delete ${member.name}?`)) {
                                                        await deleteUser(member.id);
                                                    }
                                                }}
                                            >
                                                <Icon name="trash" size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                ) : (
                    <div className="empty-state">
                        <div className="empty-state-icon"><EmptyStateIcon name="users" /></div>
                        <p>No team members yet. Add your first employee!</p>
                    </div>
                )}
            </div>

            {/* Add Employee Modal */}
            {showAddForm && (
                <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) handleCloseModal(); }}>
                    <div className="modal">
                        <div className="modal-header">
                            <h2 className="modal-title">Add Employee</h2>
                            <button className="btn-icon" onClick={handleCloseModal}><Icon name="x" size={18} /></button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Full Name *</label>
                                    <input
                                        type="text"
                                        name="name"
                                        className="form-input"
                                        value={formData.name}
                                        onInput={handleChange}
                                        placeholder="John Doe"
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Email Address *</label>
                                    <input
                                        type="email"
                                        name="email"
                                        className="form-input"
                                        value={formData.email}
                                        onInput={handleChange}
                                        placeholder="john@mahalaxmi.com"
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Password *</label>
                                    <input
                                        type="password"
                                        name="password"
                                        className="form-input"
                                        value={formData.password}
                                        onInput={handleChange}
                                        placeholder="Minimum 6 characters"
                                        minLength="6"
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Role</label>
                                    <select
                                        name="role"
                                        className="form-select"
                                        value={formData.role}
                                        onChange={handleChange}
                                    >
                                        <option value="agent">Agent (Employee)</option>
                                        <option value="admin">Admin</option>
                                    </select>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={handleCloseModal}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                                    {isSubmitting ? 'Creating...' : 'Create Account'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Employee Details Modal */}
            {selectedEmployee && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setSelectedEmployee(null)}>
                    <div className="modal" style={{ maxWidth: '800px', maxHeight: '90vh', overflow: 'auto' }}>
                        <div className="modal-header">
                            <h2 className="modal-title"><Icon name="user" size={18} style={{ marginRight: '6px' }} /> {selectedEmployee.name}'s Performance</h2>
                            <button className="btn-icon" onClick={() => setSelectedEmployee(null)}><Icon name="x" size={18} /></button>
                        </div>
                        <div className="modal-body">
                            <EmployeePerformanceContent employeeName={selectedEmployee.name} leads={leads} />
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setSelectedEmployee(null)}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Separate component for Employee Performance with its own state
function EmployeePerformanceContent({ employeeName, leads }) {
    const [activeFilter, setActiveFilter] = useState('all'); // 'all', 'escalated', 'rejected', 'converted'
    const [searchTerm, setSearchTerm] = useState('');

    // Get all leads for this employee
    const employeeLeads = leads.filter(l => l.contact_person === employeeName);
    const escalatedLeads = employeeLeads.filter(l => l.escalated === 1);
    const rejectedLeads = employeeLeads.filter(l => l.status === 'rejected');
    const convertedLeads = employeeLeads.filter(l => l.status === 'client');

    const stats = {
        total: employeeLeads.length,
        escalated: escalatedLeads.length,
        rejected: rejectedLeads.length,
        converted: convertedLeads.length
    };

    // Get filtered leads based on active filter
    const getFilteredLeads = () => {
        let filtered = [];
        switch (activeFilter) {
            case 'escalated':
                filtered = escalatedLeads;
                break;
            case 'rejected':
                filtered = rejectedLeads;
                break;
            case 'converted':
                filtered = convertedLeads;
                break;
            default:
                filtered = employeeLeads;
        }

        // Apply search filter
        if (searchTerm.trim()) {
            const search = searchTerm.toLowerCase();
            filtered = filtered.filter(l =>
                l.name?.toLowerCase().includes(search) ||
                l.phone?.toLowerCase().includes(search) ||
                l.location?.toLowerCase().includes(search)
            );
        }

        return filtered;
    };

    const filteredLeads = getFilteredLeads();

    const getFilterTitle = () => {
        switch (activeFilter) {
            case 'escalated': return <><Icon name="flame" size={14} style={{ marginRight: '4px' }} /> Escalated Leads</>;
            case 'rejected': return <><Icon name="x-circle" size={14} style={{ marginRight: '4px' }} /> Rejected Leads</>;
            case 'converted': return <><Icon name="check-circle" size={14} style={{ marginRight: '4px' }} /> Converted Leads</>;
            default: return 'All Leads Submitted';
        }
    };

    const statBoxStyle = (isActive, borderColor) => ({
        padding: 'var(--space-3)',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        borderLeft: `3px solid ${borderColor || 'transparent'}`,
        background: isActive ? 'var(--bg-tertiary)' : undefined,
        transform: isActive ? 'scale(1.02)' : undefined,
        boxShadow: isActive ? '0 2px 8px rgba(0,0,0,0.15)' : undefined
    });

    return (
        <>
            {/* Clickable Stats Summary */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 'var(--space-3)',
                marginBottom: 'var(--space-4)'
            }}>
                <div
                    className="stat-card"
                    style={statBoxStyle(activeFilter === 'all', 'var(--accent-primary)')}
                    onClick={() => { setActiveFilter('all'); setSearchTerm(''); }}
                >
                    <span className="stat-label" style={{ fontSize: '11px' }}>Total Submitted</span>
                    <span className="stat-value" style={{ fontSize: '20px' }}>{stats.total}</span>
                </div>
                <div
                    className="stat-card"
                    style={statBoxStyle(activeFilter === 'escalated', 'var(--accent-warning)')}
                    onClick={() => { setActiveFilter('escalated'); setSearchTerm(''); }}
                >
                    <span className="stat-label" style={{ fontSize: '11px' }}><Icon name="flame" size={12} style={{ marginRight: '2px' }} /> Escalated</span>
                    <span className="stat-value" style={{ fontSize: '20px', color: 'var(--accent-warning)' }}>{stats.escalated}</span>
                </div>
                <div
                    className="stat-card"
                    style={statBoxStyle(activeFilter === 'rejected', 'var(--accent-danger)')}
                    onClick={() => { setActiveFilter('rejected'); setSearchTerm(''); }}
                >
                    <span className="stat-label" style={{ fontSize: '11px' }}><Icon name="x-circle" size={12} style={{ marginRight: '2px' }} /> Rejected</span>
                    <span className="stat-value" style={{ fontSize: '20px', color: 'var(--accent-danger)' }}>{stats.rejected}</span>
                </div>
                <div
                    className="stat-card"
                    style={statBoxStyle(activeFilter === 'converted', 'var(--accent-success)')}
                    onClick={() => { setActiveFilter('converted'); setSearchTerm(''); }}
                >
                    <span className="stat-label" style={{ fontSize: '11px' }}><Icon name="check-circle" size={12} style={{ marginRight: '2px' }} /> Converted</span>
                    <span className="stat-value" style={{ fontSize: '20px', color: 'var(--accent-success)' }}>{stats.converted}</span>
                </div>
            </div>

            {/* Search Bar */}
            <div style={{ marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <input
                    type="text"
                    className="form-input"
                    placeholder="Search leads by name, phone, or location..."
                    value={searchTerm}
                    onInput={(e) => setSearchTerm(e.target.value)}
                    style={{ flex: 1 }}
                />
                {activeFilter !== 'all' && (
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setActiveFilter('all')}
                    >
                        Show All
                    </button>
                )}
            </div>

            {/* Lead List Header */}
            <h3 style={{ marginBottom: 'var(--space-3)', fontSize: '14px' }}>
                {getFilterTitle()} ({filteredLeads.length})
            </h3>

            {filteredLeads.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 'var(--space-4)' }}>
                    {searchTerm ? 'No leads found matching your search.' : 'No leads in this category.'}
                </p>
            ) : (
                <div style={{ maxHeight: '300px', overflow: 'auto' }}>
                    <table style={{ width: '100%', fontSize: '13px' }}>
                        <thead>
                            <tr>
                                <th style={{ padding: '8px' }}>Name</th>
                                <th style={{ padding: '8px' }}>Phone</th>
                                <th style={{ padding: '8px' }}>Location</th>
                                <th style={{ padding: '8px' }}>Interest</th>
                                <th style={{ padding: '8px' }}>Status</th>
                                <th style={{ padding: '8px' }}>Escalated</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredLeads.map(lead => (
                                <tr key={lead.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                    <td style={{ padding: '8px', fontWeight: '500' }}>{lead.name}</td>
                                    <td style={{ padding: '8px' }}>{lead.phone}</td>
                                    <td style={{ padding: '8px' }}>{lead.location || '-'}</td>
                                    <td style={{ padding: '8px' }}>{lead.interest || '-'}</td>
                                    <td style={{ padding: '8px' }}>
                                        <span style={{
                                            padding: '2px 6px',
                                            borderRadius: '10px',
                                            fontSize: '10px',
                                            fontWeight: '600',
                                            textTransform: 'uppercase',
                                            background: lead.status === 'client' ? '#D1FAE5' :
                                                ['interested', 'site_visit', 'negotiation'].includes(lead.status) ? '#FEF3C7' :
                                                    lead.status === 'rejected' ? '#FEE2E2' : '#E5E7EB',
                                            color: lead.status === 'client' ? '#065F46' :
                                                ['interested', 'site_visit', 'negotiation'].includes(lead.status) ? '#92400E' :
                                                    lead.status === 'rejected' ? '#991B1B' : '#374151'
                                        }}>
                                            {lead.status?.replace('_', ' ') || 'new'}
                                        </span>
                                    </td>
                                    <td style={{ padding: '8px', textAlign: 'center' }}>
                                        {lead.escalated === 1 ? (
                                            <span style={{ color: 'var(--accent-warning)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}><Icon name="flame" size={13} /> Yes</span>
                                        ) : (
                                            <span style={{ color: 'var(--text-muted)' }}>-</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </>
    );
}
