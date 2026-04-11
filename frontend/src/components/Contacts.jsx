import { useState, useEffect } from 'preact/hooks';
import { useStore } from '../stores/store';
import Icon from './Icons';

export default function Contacts() {
    const { contacts, contactsTotal, fetchContacts, createContact, updateContact, deleteContact, importContacts, showToast } = useStore();
    const [search, setSearch] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [editingContact, setEditingContact] = useState(null);
    const [showImport, setShowImport] = useState(false);
    const [formData, setFormData] = useState({ name: '', phone: '', email: '', location: '', ticket_size: '', tags: '', notes: '', source: '' });
    const [importText, setImportText] = useState('');
    const [importFile, setImportFile] = useState(null);
    const [importPreview, setImportPreview] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => { fetchContacts(); }, []);

    useEffect(() => {
        const timer = setTimeout(() => fetchContacts(search), 300);
        return () => clearTimeout(timer);
    }, [search]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const payload = {
                ...formData,
                ticket_size: formData.ticket_size ? parseFloat(formData.ticket_size) : null,
                tags: formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
            };
            if (editingContact) {
                await updateContact(editingContact.id, payload);
                showToast('Contact updated');
            } else {
                await createContact(payload);
                showToast('Contact created');
            }
            resetForm();
        } catch (err) {
            showToast(err.message, 'error');
        }
        setLoading(false);
    };

    const handleEdit = (contact) => {
        const tags = contact.tags ? (typeof contact.tags === 'string' ? JSON.parse(contact.tags) : contact.tags) : [];
        setFormData({
            name: contact.name || '',
            phone: contact.phone || '',
            email: contact.email || '',
            location: contact.location || '',
            ticket_size: contact.ticket_size || '',
            tags: tags.join(', '),
            notes: contact.notes || '',
            source: contact.source || '',
        });
        setEditingContact(contact);
        setShowForm(true);
    };

    const handleDelete = async (id) => {
        if (confirm('Delete this contact?')) {
            await deleteContact(id);
            showToast('Contact deleted');
        }
    };

    const parseCSV = (text) => {
        const lines = text.trim().split('\n').filter(Boolean);
        if (lines.length === 0) return [];
        const startIdx = lines[0].toLowerCase().includes('name') && lines[0].toLowerCase().includes('phone') ? 1 : 0;
        return lines.slice(startIdx).map(line => {
            const parts = line.split(',').map(p => p.trim());
            return {
                name: parts[0] || '',
                phone: parts[1] || '',
                email: parts[2] || '',
                location: parts[3] || '',
                ticket_size: parts[4] ? parseFloat(parts[4]) : null,
                tags: parts[5] ? parts[5].split(';').map(t => t.trim()).filter(Boolean) : [],
            };
        }).filter(c => c.name && c.phone);
    };

    const handleFileSelect = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setImportFile(file);
        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = ev.target.result;
            setImportText(text);
            setImportPreview(parseCSV(text));
        };
        reader.readAsText(file);
    };

    const handleImport = async () => {
        if (!importPreview || importPreview.length === 0) { showToast('No valid contacts found', 'error'); return; }
        setLoading(true);
        try {
            const result = await importContacts(importPreview);
            showToast(`Imported ${result.imported} contacts (${result.skipped} skipped)`);
            setShowImport(false); setImportText(''); setImportFile(null); setImportPreview(null);
            // Explicit refresh after import
            await fetchContacts();
        } catch (err) {
            showToast(err.message, 'error');
        }
        setLoading(false);
    };

    const resetForm = () => {
        setShowForm(false);
        setEditingContact(null);
        setFormData({ name: '', phone: '', email: '', location: '', ticket_size: '', tags: '', notes: '', source: '' });
    };

    const parseTags = (tags) => {
        if (!tags) return [];
        if (typeof tags === 'string') { try { return JSON.parse(tags); } catch { return []; } }
        return tags;
    };

    const downloadTemplate = () => {
        const csv = [
            'name,phone,email,location,ticket_size,tags',
            'Rahul Sharma,9876543210,rahul@example.com,Mumbai,5000000,buyer;premium',
            'Priya Patel,8765432109,priya@example.com,Delhi,3000000,investor',
        ].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'contacts_import_template.csv';
        a.click();
        URL.revokeObjectURL(url);
        showToast('Template downloaded — fill it and import');
    };

    const formatTicket = (amount) => {
        if (!amount) return '—';
        const num = Number(amount);
        if (num >= 10000000) return `₹${(num / 10000000).toFixed(1)}Cr`;
        if (num >= 100000) return `₹${(num / 100000).toFixed(0)}L`;
        if (num >= 1000) return `₹${(num / 1000).toFixed(0)}K`;
        return `₹${num.toLocaleString('en-IN')}`;
    };

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Contacts</h1>
                    <p className="page-subtitle">{contactsTotal} total contacts</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn--outline" onClick={downloadTemplate}>
                        <Icon name="download" size={16} /> Template
                    </button>
                    <button className="btn btn--outline" onClick={() => setShowImport(true)}>
                        <Icon name="upload" size={16} /> Import
                    </button>
                    <button className="btn btn--primary" onClick={() => { resetForm(); setShowForm(true); }}>
                        <Icon name="plus" size={16} /> Add Contact
                    </button>
                </div>
            </div>

            {/* Search */}
            <div className="search-bar" style={{ marginBottom: '16px' }}>
                <Icon name="search" size={18} />
                <input type="text" value={search} onInput={e => setSearch(e.target.value)}
                    placeholder="Search by name, phone, email, location..." className="search-input" />
            </div>

            {/* Add/Edit Form Modal */}
            {showForm && (
                <div className="modal-backdrop" onClick={resetForm}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '550px' }}>
                        <div className="modal-header">
                            <h2>{editingContact ? 'Edit Contact' : 'Add Contact'}</h2>
                            <button className="btn-icon" onClick={resetForm}><Icon name="close" size={20} /></button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div style={{ display: 'grid', grid: 'auto / 1fr 1fr', gap: '12px' }}>
                                <div className="form-group">
                                    <label className="form-label">Name *</label>
                                    <input className="form-input" value={formData.name} onInput={e => setFormData(d => ({ ...d, name: e.target.value }))} required />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Phone *</label>
                                    <input className="form-input" value={formData.phone} onInput={e => setFormData(d => ({ ...d, phone: e.target.value }))} required placeholder="9876543210" />
                                </div>
                            </div>
                            <div style={{ display: 'grid', grid: 'auto / 1fr 1fr', gap: '12px' }}>
                                <div className="form-group">
                                    <label className="form-label">Email</label>
                                    <input className="form-input" type="email" value={formData.email} onInput={e => setFormData(d => ({ ...d, email: e.target.value }))} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Location</label>
                                    <input className="form-input" value={formData.location} onInput={e => setFormData(d => ({ ...d, location: e.target.value }))} placeholder="Delhi, Mumbai..." />
                                </div>
                            </div>
                            <div style={{ display: 'grid', grid: 'auto / 1fr 1fr', gap: '12px' }}>
                                <div className="form-group">
                                    <label className="form-label">Ticket Size (₹)</label>
                                    <input className="form-input" type="number" value={formData.ticket_size} onInput={e => setFormData(d => ({ ...d, ticket_size: e.target.value }))} placeholder="5000000" />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Source</label>
                                    <input className="form-input" value={formData.source} onInput={e => setFormData(d => ({ ...d, source: e.target.value }))} placeholder="Website, Referral..." />
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Tags <span style={{ opacity: 0.5 }}>(comma separated)</span></label>
                                <input className="form-input" value={formData.tags} onInput={e => setFormData(d => ({ ...d, tags: e.target.value }))} placeholder="vip, interested, premium" />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Notes</label>
                                <textarea className="form-input" value={formData.notes} onInput={e => setFormData(d => ({ ...d, notes: e.target.value }))} rows={2} />
                            </div>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
                                <button type="button" className="btn btn--outline" onClick={resetForm}>Cancel</button>
                                <button type="submit" className="btn btn--primary" disabled={loading}>
                                    {loading ? 'Saving...' : editingContact ? 'Update' : 'Create'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Import Modal */}
            {showImport && (
                <div className="modal-backdrop" onClick={() => setShowImport(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '550px' }}>
                        <div className="modal-header">
                            <h2>Import Contacts</h2>
                            <button className="btn-icon" onClick={() => setShowImport(false)}><Icon name="close" size={20} /></button>
                        </div>

                        {/* Upload Area */}
                        <div style={{
                            border: '2px dashed var(--border-color)',
                            borderRadius: '12px', padding: '32px 20px',
                            textAlign: 'center', cursor: 'pointer',
                            background: importFile ? 'rgba(37, 211, 102, 0.04)' : 'var(--bg-tertiary)',
                            transition: 'all 0.2s',
                        }}
                            onClick={() => document.getElementById('csv-file-input').click()}
                        >
                            <input id="csv-file-input" type="file" accept=".csv,text/csv" onChange={handleFileSelect}
                                style={{ display: 'none' }} />

                            {!importFile ? (
                                <>
                                    <Icon name="upload" size={32} />
                                    <div style={{ marginTop: '8px', fontSize: '14px', fontWeight: 600 }}>Click to upload CSV file</div>
                                    <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--text-muted)' }}>
                                        Format: name, phone, email, location, ticket_size, tags
                                    </div>
                                    <button type="button" className="btn btn--outline" onClick={(e) => { e.stopPropagation(); downloadTemplate(); }}
                                        style={{ marginTop: '12px', fontSize: '12px', padding: '4px 12px' }}>
                                        <Icon name="download" size={14} /> Download Template
                                    </button>
                                </>
                            ) : (
                                <>
                                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--accent-primary)' }}>
                                        ✓ {importFile.name}
                                    </div>
                                    <div style={{ marginTop: '4px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                                        {importPreview ? `${importPreview.length} valid contacts found` : 'Parsing...'}
                                    </div>
                                    <button type="button" className="btn btn--outline" style={{ marginTop: '8px', fontSize: '12px', padding: '4px 12px' }}
                                        onClick={(e) => { e.stopPropagation(); setImportFile(null); setImportPreview(null); setImportText(''); }}>
                                        Change file
                                    </button>
                                </>
                            )}
                        </div>

                        {/* Preview Table */}
                        {importPreview && importPreview.length > 0 && (
                            <div style={{ marginTop: '16px', maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                                <table className="table" style={{ fontSize: '12px' }}>
                                    <thead>
                                        <tr><th>Name</th><th>Phone</th><th>Email</th><th>Location</th></tr>
                                    </thead>
                                    <tbody>
                                        {importPreview.slice(0, 5).map((c, i) => (
                                            <tr key={i}>
                                                <td>{c.name}</td>
                                                <td style={{ fontFamily: 'monospace' }}>{c.phone}</td>
                                                <td>{c.email || '—'}</td>
                                                <td>{c.location || '—'}</td>
                                            </tr>
                                        ))}
                                        {importPreview.length > 5 && (
                                            <tr><td colSpan={4} style={{ textAlign: 'center', opacity: 0.5 }}>...and {importPreview.length - 5} more</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
                            <button className="btn btn--outline" onClick={() => { setShowImport(false); setImportFile(null); setImportPreview(null); }}>Cancel</button>
                            <button className="btn btn--primary" onClick={handleImport} disabled={loading || !importPreview?.length}>
                                {loading ? 'Importing...' : `Import ${importPreview?.length || 0} Contacts`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Table */}
            <div className="card" style={{ overflow: 'auto' }}>
                <table className="table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Phone</th>
                            <th>Location</th>
                            <th>Ticket Size</th>
                            <th>Tags</th>
                            <th>Source</th>
                            <th style={{ width: '90px' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {contacts.length === 0 ? (
                            <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px', opacity: 0.5 }}>
                                No contacts yet. Add your first contact to get started.
                            </td></tr>
                        ) : contacts.map(contact => (
                            <tr key={contact.id}>
                                <td>
                                    <div style={{ fontWeight: 600 }}>{contact.name}</div>
                                    {contact.email && <div style={{ fontSize: '11px', opacity: 0.5 }}>{contact.email}</div>}
                                </td>
                                <td><span style={{ fontFamily: 'monospace', fontSize: '13px' }}>{contact.phone}</span></td>
                                <td style={{ fontSize: '13px' }}>{contact.location || '—'}</td>
                                <td style={{ fontWeight: 500 }}>{formatTicket(contact.ticket_size)}</td>
                                <td>
                                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                        {parseTags(contact.tags).map(tag => (
                                            <span key={tag} style={{
                                                padding: '2px 8px', borderRadius: '12px',
                                                background: '#eef2ff', color: '#6366f1', fontSize: '11px', fontWeight: 600
                                            }}>{tag}</span>
                                        ))}
                                    </div>
                                </td>
                                <td style={{ opacity: 0.6, fontSize: '13px' }}>{contact.source || '—'}</td>
                                <td>
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                        <button className="btn-icon" onClick={() => handleEdit(contact)} title="Edit"><Icon name="edit" size={16} /></button>
                                        <button className="btn-icon" onClick={() => handleDelete(contact.id)} title="Delete" style={{ color: '#ef4444' }}>
                                            <Icon name="delete" size={16} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
