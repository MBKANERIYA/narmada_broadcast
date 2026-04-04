import { useEffect, useState, useRef } from 'preact/hooks';
import { useStore } from '../stores/store';
import Icon, { EmptyStateIcon } from './Icons';

/**
 * Clients Component
 * FEATURES: List clients, Search, Manual Add Client
 * SECURITY: Admin sees all, Employee can only add (not view)
 */
export default function Clients() {
    const { clients, fetchClients, createClient, deleteClient, updateClient, isLoading, user, sources, showToast } = useStore();
    const [searchTerm, setSearchTerm] = useState('');
    const [showAddForm, setShowAddForm] = useState(false);
    const [selectedClient, setSelectedClient] = useState(null);
    const [editData, setEditData] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [errors, setErrors] = useState({});
    const searchTimeoutRef = useRef(null);
    const [newClient, setNewClient] = useState({
        name: '',
        phone: '',
        email: '',
        location: '',
        source: '',
        deal_date: '',
        price: '',
        property_details: '',
        documents_link: ''
    });

    const isAdmin = user?.role === 'admin';

    // Ensure clients is always an array (fixes "y.map is not a function" error)
    const safeClients = Array.isArray(clients) ? clients : [];

    useEffect(() => {
        if (isAdmin) {
            fetchClients();
        }
    }, [isAdmin]);

    // Debounced search to prevent excessive API calls
    const handleSearch = (e) => {
        const value = e.target.value;
        setSearchTerm(value);

        // Clear previous timeout
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }

        // Debounce: wait 300ms before fetching
        searchTimeoutRef.current = setTimeout(() => {
            fetchClients(value);
        }, 300);
    };

    // Modal handlers
    const openAddModal = () => {
        console.log('Opening add modal');
        setShowAddForm(true);
    };

    const closeAddModal = () => {
        console.log('Closing add modal');
        setShowAddForm(false);
        setNewClient({ name: '', phone: '', email: '', location: '', source: '', deal_date: '', price: '', property_details: '', documents_link: '' });
        setErrors({});
    };

    const validateForm = (data) => {
        const newErrors = {};
        if (!data.name?.trim()) {
            newErrors.name = 'Name is required';
        }
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleAdd = async (e) => {
        e.preventDefault();
        if (!validateForm(newClient)) return;

        setIsSubmitting(true);
        try {
            await createClient(newClient);
            showToast('Client added successfully', 'success');
            setShowAddForm(false);
            setNewClient({ name: '', phone: '', email: '', location: '', source: '', deal_date: '', price: '', property_details: '', documents_link: '' });
            setErrors({});
        } catch (error) {
            showToast(error.message || 'Failed to add client', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEdit = async (e) => {
        e.preventDefault();
        if (!validateForm(editData)) return;

        setIsSubmitting(true);
        try {
            await updateClient(selectedClient.id, editData);
            showToast('Client updated successfully', 'success');
            setSelectedClient(null);
            setEditData(null);
            setIsEditing(false);
            setErrors({});
        } catch (error) {
            showToast(error.message || 'Failed to update client', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const openViewModal = (client) => {
        setSelectedClient(client);
        setIsEditing(false);
        setEditData(null);
    };

    const openEditModal = (client) => {
        setSelectedClient(client);
        setIsEditing(true);
        setEditData({
            name: client.name || '',
            phone: client.phone || '',
            email: client.email || '',
            location: client.location || '',
            source: client.source || '',
            deal_date: client.deal_date ? client.deal_date.split('T')[0] : '',
            price: client.price || '',
            property_details: client.property_details || '',
            documents_link: client.documents_link || ''
        });
    };

    const closeModal = () => {
        setSelectedClient(null);
        setEditData(null);
        setIsEditing(false);
    };

    // Download CSV Template
    const downloadTemplate = () => {
        const headers = ['name', 'phone', 'email', 'location', 'source', 'deal_date', 'price', 'property_details', 'documents_link'];
        const sample = ['John Doe', '9876543210', 'john@email.com', 'Mumbai', 'Referral', '2026-01-15', '5000000', '2BHK Andheri', 'https://drive.google.com/...'];
        const csv = [headers.join(','), sample.join(',')].join('\n');

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'clients_template.csv';
        a.click();
        URL.revokeObjectURL(url);
        showToast('Template downloaded', 'success');
    };

    // Parse CSV line handling quotes
    const parseCSVLine = (line) => {
        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current.trim());
        return result;
    };

    // Handle CSV File Upload
    const handleCSVUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            const text = await file.text();
            // Handle different line endings (Windows \r\n, Mac \r, Unix \n)
            const lines = text.split(/\r?\n|\r/).filter(line => line.trim());

            if (lines.length < 2) {
                showToast('CSV file must have headers and at least one data row', 'error');
                setIsUploading(false);
                return;
            }

            const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/['"]/g, ''));
            console.log('CSV Headers:', headers);

            const clients = [];

            for (let i = 1; i < lines.length; i++) {
                const values = parseCSVLine(lines[i]);
                const client = {};
                headers.forEach((header, idx) => {
                    // Remove quotes from values
                    client[header] = (values[idx] || '').replace(/^["']|["']$/g, '').trim();
                });
                if (client.name) {
                    clients.push(client);
                }
            }

            if (clients.length === 0) {
                showToast('No valid clients found in CSV. Make sure "name" column exists.', 'error');
                setIsUploading(false);
                return;
            }

            console.log('Parsed clients:', clients);

            // Call bulk upload API
            const response = await fetch(`${import.meta.env.VITE_API_URL || 'https://crm-mahalaxmi-backend.onrender.com'}/api/v1/clients/bulk`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ clients })
            });

            const result = await response.json();
            if (response.ok) {
                showToast(`${result.message}`, result.errorCount > 0 ? 'warning' : 'success');
                fetchClients();
            } else {
                showToast(result.error || 'Upload failed', 'error');
            }
        } catch (error) {
            console.error('CSV upload error:', error);
            showToast(`CSV Error: ${error.message || 'Failed to parse file'}`, 'error');
        } finally {
            setIsUploading(false);
            e.target.value = ''; // Reset file input
        }
    };

    return (
        <div className="content-section">
            <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 'var(--space-6)',
                gap: 'var(--space-4)'
            }}>
                <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: '700', margin: 0 }}>
                    {isAdmin ? 'Clients' : 'Add New Client'}
                </h1>
                <div style={{ display: 'flex', gap: 'var(--space-4)', width: 'auto', flexWrap: 'wrap' }}>
                    {isAdmin && (
                        <input
                            type="text"
                            placeholder="Search clients..."
                            className="form-input"
                            style={{ width: '200px', flex: '1 1 auto' }}
                            value={searchTerm}
                            onInput={handleSearch}
                        />
                    )}
                    {isAdmin && (
                        <>
                            <button
                                className="btn btn-secondary"
                                onClick={downloadTemplate}
                                title="Download CSV template"
                                style={{ whiteSpace: 'nowrap' }}
                            >
                                <Icon name="download" size={14} style={{ marginRight: '4px' }} /> Template
                            </button>
                            <label
                                className="btn btn-secondary"
                                style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}
                                title="Upload CSV file to import clients"
                            >
                                {isUploading ? <><Icon name="loader" size={14} style={{ marginRight: '4px' }} /> Uploading...</> : <><Icon name="upload" size={14} style={{ marginRight: '4px' }} /> Upload CSV</>}
                                <input
                                    type="file"
                                    accept=".csv"
                                    onChange={handleCSVUpload}
                                    style={{ display: 'none' }}
                                    disabled={isUploading}
                                />
                            </label>
                        </>
                    )}
                    <button className="btn btn-primary" onClick={openAddModal} style={{ whiteSpace: 'nowrap' }}>
                        + Add Client
                    </button>
                </div>
            </div>

            {/* Employee view - just the add form prompt */}
            {!isAdmin ? (
                <div className="card full-width" style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
                    <div style={{ fontSize: '48px', marginBottom: 'var(--space-4)' }}><Icon name="users" size={48} /></div>
                    <h2 style={{ marginBottom: 'var(--space-2)' }}>Add a New Client</h2>
                    <p style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-6)' }}>
                        Click the button above to add a new client to the system.
                    </p>
                    <button className="btn btn-primary btn-lg" onClick={openAddModal}>
                        + Add New Client
                    </button>
                </div>
            ) : isLoading && safeClients.length === 0 ? (
                <div className="loading" />
            ) : (
                <div className="card full-width">
                    {safeClients.length > 0 ? (
                        <>
                            <div className="desktop-only">
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                                            <th style={{ padding: 'var(--space-3)' }}>Name</th>
                                            <th style={{ padding: 'var(--space-3)' }}>Contact</th>
                                            <th style={{ padding: 'var(--space-3)' }}>Location</th>
                                            <th style={{ padding: 'var(--space-3)' }}>Source</th>
                                            <th style={{ padding: 'var(--space-3)' }}>Converted From</th>
                                            <th style={{ padding: 'var(--space-3)' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {safeClients.map(client => (
                                            <tr
                                                key={client.id}
                                                style={{ borderBottom: '1px solid var(--border-color)', cursor: 'pointer' }}
                                                onClick={() => openViewModal(client)}
                                            >
                                                <td style={{ padding: 'var(--space-3)', fontWeight: '500' }}>{client.name}</td>
                                                <td style={{ padding: 'var(--space-3)' }}>
                                                    <div>{client.phone}</div>
                                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{client.email}</div>
                                                </td>
                                                <td style={{ padding: 'var(--space-3)' }}>{client.location || '-'}</td>
                                                <td style={{ padding: 'var(--space-3)' }}>
                                                    <span className="status-badge" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                                                        {client.source}
                                                    </span>
                                                </td>
                                                <td style={{ padding: 'var(--space-3)' }}>{client.lead_name ? `Lead #${client.lead_id}` : 'Manual'}</td>
                                                <td style={{ padding: 'var(--space-3)' }} onClick={(e) => e.stopPropagation()}>
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        <button
                                                            className="btn btn-sm btn-secondary"
                                                            onClick={() => openEditModal(client)}
                                                            title="View/Edit Client"
                                                        >
                                                            <Icon name="pencil" size={14} />
                                                        </button>
                                                        <button
                                                            className="btn btn-sm"
                                                            style={{ background: '#666' }}
                                                            onClick={() => {
                                                                if (window.confirm('Delete this client permanently?')) {
                                                                    deleteClient(client.id);
                                                                }
                                                            }}
                                                            title="Delete Client"
                                                        >
                                                            <Icon name="trash" size={14} />
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
                                {safeClients.map(client => (
                                    <div key={client.id} style={{
                                        background: 'var(--bg-tertiary)',
                                        padding: 'var(--space-4)',
                                        borderRadius: 'var(--radius-md)',
                                        marginBottom: 'var(--space-3)',
                                        border: '1px solid var(--border-color)',
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                            <div>
                                                <div style={{ fontWeight: '600', fontSize: '16px' }}>{client.name}</div>
                                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{client.phone}</div>
                                            </div>
                                            <button
                                                className="btn btn-sm"
                                                style={{ background: '#666', padding: '8px', minWidth: '36px' }}
                                                onClick={() => {
                                                    if (window.confirm('Delete this client permanently?')) {
                                                        deleteClient(client.id);
                                                    }
                                                }}
                                            >
                                                <Icon name="trash" size={14} />
                                            </button>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <Icon name="mail" size={14} />
                                                <span style={{ wordBreak: 'break-all' }}>{client.email || '-'}</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <Icon name="map-pin" size={14} />
                                                <span>{client.location || '-'}</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <Icon name="tag" size={14} />
                                                <span className="status-badge" style={{ background: 'var(--bg-secondary)', fontSize: '12px' }}>{client.source}</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                                                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                                    From: {client.lead_name ? `Lead #${client.lead_id}` : 'Manual Entry'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <div className="empty-state">
                            <div className="empty-state-icon"><EmptyStateIcon name="users" /></div>
                            <p>No clients yet. Convert warm leads or add one manually!</p>
                        </div>
                    )}
                </div>
            )}

            {/* Add Client Modal */}
            {showAddForm && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeAddModal()}>
                    <div className="modal">
                        <div className="modal-header">
                            <h2 className="modal-title">Add New Client</h2>
                            <button className="btn-icon" onClick={closeAddModal}><Icon name="x" size={18} /></button>
                        </div>
                        <form onSubmit={handleAdd}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Name *</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={newClient.name}
                                        onInput={(e) => setNewClient(c => ({ ...c, name: e.target.value }))}
                                        required
                                    />
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Phone</label>
                                        <input
                                            type="tel"
                                            className="form-input"
                                            value={newClient.phone}
                                            onInput={(e) => setNewClient(c => ({ ...c, phone: e.target.value }))}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Email</label>
                                        <input
                                            type="email"
                                            className="form-input"
                                            value={newClient.email}
                                            onInput={(e) => setNewClient(c => ({ ...c, email: e.target.value }))}
                                        />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Location</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={newClient.location}
                                            onInput={(e) => setNewClient(c => ({ ...c, location: e.target.value }))}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Source</label>
                                        <select
                                            className="form-select"
                                            value={newClient.source}
                                            onChange={(e) => setNewClient(c => ({ ...c, source: e.target.value }))}
                                        >
                                            <option value="">Select Source</option>
                                            {Array.isArray(sources) && sources.map(s => (
                                                <option key={s.id} value={s.name}>{s.name}</option>
                                            ))}
                                            <option value="Manual Entry">Manual Entry</option>
                                            <option value="Other">Other</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Deal Date</label>
                                        <input
                                            type="date"
                                            className="form-input"
                                            value={newClient.deal_date}
                                            onInput={(e) => setNewClient(c => ({ ...c, deal_date: e.target.value }))}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Price (₹)</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            value={newClient.price}
                                            onInput={(e) => setNewClient(c => ({ ...c, price: e.target.value }))}
                                            placeholder="e.g. 5000000"
                                        />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Property Details</label>
                                    <textarea
                                        className="form-input"
                                        rows="3"
                                        value={newClient.property_details}
                                        onInput={(e) => setNewClient(c => ({ ...c, property_details: e.target.value }))}
                                        placeholder="Description of the property..."
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Documents Link (Google Drive)</label>
                                    <input
                                        type="url"
                                        className="form-input"
                                        value={newClient.documents_link}
                                        onInput={(e) => setNewClient(c => ({ ...c, documents_link: e.target.value }))}
                                        placeholder="https://drive.google.com/..."
                                    />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={closeAddModal}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Add Client</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* View/Edit Client Modal */}
            {selectedClient && (
                <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
                    <div className="modal" style={{ maxWidth: '600px' }}>
                        <div className="modal-header">
                            <h2 className="modal-title">{isEditing ? <><Icon name="pencil" size={18} style={{ marginRight: '6px' }} /> Edit Client</> : <><Icon name="user" size={18} style={{ marginRight: '6px' }} /> Client Details</>}</h2>
                            <button className="btn-icon" onClick={closeModal}><Icon name="x" size={18} /></button>
                        </div>

                        {isEditing && editData ? (
                            /* EDIT MODE */
                            <form onSubmit={handleEdit}>
                                <div className="modal-body">
                                    <div className="form-group">
                                        <label className="form-label">Name *</label>
                                        <input type="text" className="form-input" value={editData.name} onInput={(e) => setEditData(d => ({ ...d, name: e.target.value }))} required />
                                    </div>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label className="form-label">Phone</label>
                                            <input type="tel" className="form-input" value={editData.phone} onInput={(e) => setEditData(d => ({ ...d, phone: e.target.value }))} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Email</label>
                                            <input type="email" className="form-input" value={editData.email} onInput={(e) => setEditData(d => ({ ...d, email: e.target.value }))} />
                                        </div>
                                    </div>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label className="form-label">Location</label>
                                            <input type="text" className="form-input" value={editData.location} onInput={(e) => setEditData(d => ({ ...d, location: e.target.value }))} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Source</label>
                                            <input type="text" className="form-input" value={editData.source} onInput={(e) => setEditData(d => ({ ...d, source: e.target.value }))} />
                                        </div>
                                    </div>
                                    <hr style={{ margin: 'var(--space-4) 0', borderColor: 'var(--border-color)' }} />
                                    <h3 style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--space-4)' }}>Deal Information</h3>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label className="form-label">Deal Date</label>
                                            <input type="date" className="form-input" value={editData.deal_date} onInput={(e) => setEditData(d => ({ ...d, deal_date: e.target.value }))} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Price (₹)</label>
                                            <input type="number" className="form-input" value={editData.price} onInput={(e) => setEditData(d => ({ ...d, price: e.target.value }))} placeholder="e.g. 5000000" />
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Property Details</label>
                                        <textarea className="form-input" rows="3" value={editData.property_details} onInput={(e) => setEditData(d => ({ ...d, property_details: e.target.value }))} placeholder="Description of the property..." />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Documents Link</label>
                                        <input type="url" className="form-input" value={editData.documents_link} onInput={(e) => setEditData(d => ({ ...d, documents_link: e.target.value }))} placeholder="https://drive.google.com/..." />
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                                    <button type="submit" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Icon name="save" size={14} /> Save Changes</button>
                                </div>
                            </form>
                        ) : (
                            /* VIEW MODE */
                            <>
                                <div className="modal-body">
                                    <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                                            <div>
                                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Name</div>
                                                <div style={{ fontWeight: '500' }}>{selectedClient.name}</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Phone</div>
                                                <div>{selectedClient.phone || '-'}</div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                                            <div>
                                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Alternate Phone</div>
                                                <div>{selectedClient.alternate_phone || '-'}</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Email</div>
                                                <div>{selectedClient.email || '-'}</div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                                            <div>
                                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Location</div>
                                                <div>{selectedClient.location || '-'}</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Source</div>
                                                <div>{selectedClient.source || '-'}</div>
                                            </div>
                                        </div>

                                        <hr style={{ borderColor: 'var(--border-color)' }} />
                                        <h3 style={{ fontSize: 'var(--text-lg)', margin: 0 }}>Deal Information</h3>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                                            <div>
                                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Deal Date</div>
                                                <div>{selectedClient.deal_date ? new Date(selectedClient.deal_date).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : '-'}</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Price</div>
                                                <div style={{ fontWeight: '600', color: 'var(--accent-success)' }}>{selectedClient.price ? `₹${Number(selectedClient.price).toLocaleString()}` : '-'}</div>
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Property Details</div>
                                            <div style={{ whiteSpace: 'pre-wrap' }}>{selectedClient.property_details || '-'}</div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Documents</div>
                                            {selectedClient.documents_link ? (
                                                <a href={selectedClient.documents_link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-primary)' }}>
                                                    Open Documents ↗
                                                </a>
                                            ) : '-'}
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                                            <div>
                                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Submitted By</div>
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    color: selectedClient.contact_person ? 'var(--text-primary)' : 'var(--text-muted)'
                                                }}>
                                                    {selectedClient.contact_person ? (
                                                        <span style={{
                                                            background: 'var(--accent-primary)',
                                                            color: 'white',
                                                            padding: '2px 8px',
                                                            borderRadius: '12px',
                                                            fontSize: '12px',
                                                            fontWeight: '500'
                                                        }}>
                                                            {selectedClient.contact_person}
                                                        </span>
                                                    ) : '-'}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button type="button" className="btn btn-secondary" onClick={closeModal}>Close</button>
                                    <button type="button" className="btn btn-primary" onClick={() => openEditModal(selectedClient)} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Icon name="pencil" size={14} /> Edit</button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
