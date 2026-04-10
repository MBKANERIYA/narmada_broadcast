import { useEffect, useState } from 'preact/hooks';
import { useStore } from '../stores/store';
import Icon, { EmptyStateIcon } from './Icons';

export default function WhatsAppBroadcast() {
    const {
        fetchWhatsAppRecipients, sendWhatsAppBroadcast, sendWhatsAppMessage,
        fetchWhatsAppCampaigns, fetchWhatsAppCampaignDetail,
        whatsappRecipients, whatsappCampaigns, showToast,
        uploadTemplateImage, createWhatsAppTemplate, fetchWhatsAppTemplates,
        deleteWhatsAppTemplate, whatsappTemplates
    } = useStore();

    const [tab, setTab] = useState('broadcast');

    // Template creation state
    const [tplName, setTplName] = useState('');
    const [tplCategory, setTplCategory] = useState('MARKETING');
    const [tplLanguage, setTplLanguage] = useState('en');
    const [tplBody, setTplBody] = useState('');
    const [tplFooter, setTplFooter] = useState('');
    const [tplCallText, setTplCallText] = useState('');
    const [tplCallPhone, setTplCallPhone] = useState('');
    const [tplImageFile, setTplImageFile] = useState(null);
    const [tplImagePreview, setTplImagePreview] = useState(null);
    const [tplCreating, setTplCreating] = useState(false);
    const [tplShowList, setTplShowList] = useState(false);

    // Broadcast state
    const [recipientType, setRecipientType] = useState('all');
    const [filterTag, setFilterTag] = useState('');
    const [filterLocation, setFilterLocation] = useState('');
    const [filterMinTicket, setFilterMinTicket] = useState('');
    const [filterMaxTicket, setFilterMaxTicket] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState([]);
    const [campaignName, setCampaignName] = useState('');
    const [templateParams, setTemplateParams] = useState(['', '', '']);
    const [directPhone, setDirectPhone] = useState('');
    const [directName, setDirectName] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [campaignDetail, setCampaignDetail] = useState(null);
    const [showStep2, setShowStep2] = useState(false);

    useEffect(() => {
        fetchWhatsAppRecipients();
        fetchWhatsAppCampaigns();
        fetchWhatsAppTemplates();
    }, []);

    // Fetch recipients when filters change
    useEffect(() => {
        const timer = setTimeout(() => {
            if (recipientType !== 'direct') {
                fetchWhatsAppRecipients(filterTag, searchQuery);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [recipientType, filterTag, filterLocation, filterMinTicket, filterMaxTicket, searchQuery]);

    const contacts = whatsappRecipients?.contacts || [];
    const counts = whatsappRecipients?.counts || {};

    // Filter contacts client-side for location/ticket_size (API also filters on backend)
    const filteredContacts = contacts.filter(c => {
        if (filterLocation && !(c.location || '').toLowerCase().includes(filterLocation.toLowerCase())) return false;
        if (filterMinTicket && (!c.ticket_size || c.ticket_size < parseFloat(filterMinTicket))) return false;
        if (filterMaxTicket && (!c.ticket_size || c.ticket_size > parseFloat(filterMaxTicket))) return false;
        return true;
    });

    const getRecipientCount = () => {
        if (recipientType === 'direct') return directPhone ? 1 : 0;
        if (recipientType === 'custom') return selectedIds.length;
        return filteredContacts.filter(c => c.validPhone).length;
    };

    const toggleSelect = (id) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const selectAll = () => {
        const validIds = filteredContacts.filter(c => c.validPhone).map(c => c.id);
        setSelectedIds(validIds);
    };

    const deselectAll = () => setSelectedIds([]);

    // Templates for dropdown
    const approvedTemplates = (whatsappTemplates || []).filter(t => t.status === 'APPROVED');

    const selectedTemplate = approvedTemplates.find(t => t.name === campaignName);
    const templateVariables = selectedTemplate?.components?.find(c => c.type === 'BODY')?.text?.match(/\{\{\d+\}\}/g) || [];

    const handleSend = async () => {
        if (!campaignName) { showToast('Select a template first', 'error'); return; }
        if (recipientType === 'direct' && !directPhone) { showToast('Enter a phone number', 'error'); return; }
        if (recipientType === 'custom' && selectedIds.length === 0) { showToast('Select at least one contact', 'error'); return; }

        setShowConfirm(true);
    };

    const confirmSend = async () => {
        setIsSending(true);
        setShowConfirm(false);
        try {
            if (recipientType === 'direct') {
                await sendWhatsAppMessage({
                    phone: directPhone,
                    campaignName,
                    templateParams: templateParams.filter(Boolean),
                    userName: directName || 'Customer',
                });
                showToast('Message sent!');
            } else {
                const broadcastData = {
                    campaignName,
                    templateParams: templateParams.filter(Boolean),
                    recipientType: recipientType === 'custom' ? 'custom' : recipientType === 'tagged' ? 'tagged' : 'all',
                    recipientIds: recipientType === 'custom' ? selectedIds : undefined,
                    recipientFilter: recipientType === 'tagged' ? { tag: filterTag } : {},
                };
                const result = await sendWhatsAppBroadcast(broadcastData);
                showToast(`Broadcasting to ${result.totalRecipients} contacts`);
                fetchWhatsAppCampaigns();
            }
        } catch (err) {
            showToast(err.message, 'error');
        }
        setIsSending(false);
    };

    const viewCampaign = async (id) => {
        try {
            const detail = await fetchWhatsAppCampaignDetail(id);
            setCampaignDetail(detail);
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    // Template image handling
    const handleImageSelect = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            setTplImageFile(file);
            const reader = new FileReader();
            reader.onload = (ev) => setTplImagePreview(ev.target.result);
            reader.readAsDataURL(file);
        }
    };

    const handleCreateTemplate = async (e) => {
        e.preventDefault();
        if (!tplName.trim() || !tplBody.trim()) { showToast('Template name and body are required', 'error'); return; }
        setTplCreating(true);
        try {
            let headerImageHandle = null;
            if (tplImageFile) {
                headerImageHandle = await uploadTemplateImage(tplImageFile);
            }
            await createWhatsAppTemplate({
                name: tplName.trim(),
                category: tplCategory,
                language: tplLanguage,
                bodyText: tplBody,
                headerImageHandle,
                footerText: tplFooter || null,
                callButtonText: tplCallText || null,
                callButtonPhone: tplCallPhone || null,
            });
            showToast('Template submitted for review by Meta');
            setTplName(''); setTplBody(''); setTplFooter(''); setTplCallText(''); setTplCallPhone('');
            setTplImageFile(null); setTplImagePreview(null);
            fetchWhatsAppTemplates();
        } catch (err) {
            showToast(err.message, 'error');
        }
        setTplCreating(false);
    };

    const formatBudget = (amount) => {
        if (!amount) return '—';
        const num = Number(amount);
        if (num >= 10000000) return `₹${(num / 10000000).toFixed(1)}Cr`;
        if (num >= 100000) return `₹${(num / 100000).toFixed(0)}L`;
        return `₹${num.toLocaleString('en-IN')}`;
    };

    // ============================================================
    // RENDER
    // ============================================================
    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <h1 className="page-title">WhatsApp Broadcast</h1>
                    <p className="page-subtitle">Send template messages to your contacts</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="tabs" style={{ marginBottom: '20px' }}>
                {[
                    { id: 'broadcast', label: 'Send Broadcast' },
                    { id: 'history', label: 'Campaign History' },
                    { id: 'templates', label: 'Templates' },
                ].map(t => (
                    <button key={t.id} className={`tab-btn ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
                        {t.label}
                    </button>
                ))}
            </div>

            {tab === 'broadcast' && renderBroadcastTab()}
            {tab === 'history' && renderHistoryTab()}
            {tab === 'templates' && renderTemplatesTab()}

            {/* Confirm Modal */}
            {showConfirm && (
                <div className="modal-backdrop" onClick={() => setShowConfirm(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
                        <div className="modal-header">
                            <h2>Confirm Broadcast</h2>
                            <button className="btn-icon" onClick={() => setShowConfirm(false)}><Icon name="close" size={20} /></button>
                        </div>
                        <p style={{ margin: '16px 0', opacity: 0.8 }}>
                            Send template <strong>"{campaignName}"</strong> to <strong>{getRecipientCount()}</strong> recipient{getRecipientCount() !== 1 ? 's' : ''}?
                        </p>
                        <p style={{ fontSize: '13px', opacity: 0.6, marginBottom: '20px' }}>
                            Messages will be sent in batches. Meta will bill your account directly.
                        </p>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button className="btn btn--outline" onClick={() => setShowConfirm(false)}>Cancel</button>
                            <button className="btn btn--success" onClick={confirmSend} disabled={isSending}>
                                {isSending ? 'Sending...' : 'Confirm & Send'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Campaign Detail Modal */}
            {campaignDetail && (
                <div className="modal-backdrop" onClick={() => setCampaignDetail(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px', maxHeight: '80vh', overflow: 'auto' }}>
                        <div className="modal-header">
                            <h2>Campaign: {campaignDetail.campaign_name}</h2>
                            <button className="btn-icon" onClick={() => setCampaignDetail(null)}><Icon name="close" size={20} /></button>
                        </div>
                        <div style={{ display: 'grid', grid: 'auto / 1fr 1fr 1fr', gap: '12px', margin: '16px 0' }}>
                            <div className="stat-card">
                                <div className="stat-value">{campaignDetail.total_recipients}</div>
                                <div className="stat-label">Total</div>
                            </div>
                            <div className="stat-card" style={{ borderColor: '#22c55e' }}>
                                <div className="stat-value" style={{ color: '#22c55e' }}>{campaignDetail.successful_count || 0}</div>
                                <div className="stat-label">Sent</div>
                            </div>
                            <div className="stat-card" style={{ borderColor: '#ef4444' }}>
                                <div className="stat-value" style={{ color: '#ef4444' }}>{campaignDetail.failed_count || 0}</div>
                                <div className="stat-label">Failed</div>
                            </div>
                        </div>
                        {campaignDetail.messages && (
                            <table className="table" style={{ fontSize: '12px' }}>
                                <thead>
                                    <tr><th>Name</th><th>Phone</th><th>Status</th><th>Error</th></tr>
                                </thead>
                                <tbody>
                                    {campaignDetail.messages.map(m => (
                                        <tr key={m.id}>
                                            <td>{m.recipient_name}</td>
                                            <td style={{ fontFamily: 'monospace' }}>{m.phone}</td>
                                            <td>
                                                <span className={`status-badge status-badge--${m.status === 'sent' || m.status === 'delivered' || m.status === 'read' ? 'success' : m.status === 'failed' ? 'danger' : 'warning'}`}>
                                                    {m.status}
                                                </span>
                                            </td>
                                            <td style={{ fontSize: '11px', opacity: 0.6, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.error_message || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}
        </div>
    );

    // ============================================================
    // BROADCAST TAB
    // ============================================================
    function renderBroadcastTab() {
        return (
            <div>
                {!showStep2 ? renderStep1() : renderStep2()}
            </div>
        );
    }

    function renderStep1() {
        return (
            <div className="card" style={{ padding: '24px' }}>
                <h3 style={{ marginBottom: '16px' }}>Step 1: Select Recipients</h3>

                {/* Recipient Type */}
                <div className="form-group">
                    <label className="form-label">Who to send to</label>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {[
                            { id: 'all', label: 'All Contacts' },
                            { id: 'tagged', label: 'By Tag' },
                            { id: 'filtered', label: 'By Filters' },
                            { id: 'custom', label: 'Pick Manually' },
                            { id: 'direct', label: 'Single Number' },
                        ].map(opt => (
                            <button
                                key={opt.id}
                                className={`btn ${recipientType === opt.id ? 'btn--primary' : 'btn--outline'}`}
                                onClick={() => { setRecipientType(opt.id); setSelectedIds([]); }}
                                style={{ fontSize: '13px' }}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Filters by Tag */}
                {recipientType === 'tagged' && (
                    <div className="form-group">
                        <label className="form-label">Tag</label>
                        <input className="form-input" value={filterTag} onInput={e => setFilterTag(e.target.value)} placeholder="e.g. vip, interested, delhi" />
                    </div>
                )}

                {/* Filters by Location / Ticket Size */}
                {recipientType === 'filtered' && (
                    <div style={{ display: 'grid', grid: 'auto / 1fr 1fr 1fr', gap: '12px' }}>
                        <div className="form-group">
                            <label className="form-label">Location</label>
                            <input className="form-input" value={filterLocation} onInput={e => setFilterLocation(e.target.value)} placeholder="e.g. Delhi" />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Min Ticket Size (₹)</label>
                            <input className="form-input" type="number" value={filterMinTicket} onInput={e => setFilterMinTicket(e.target.value)} placeholder="5000000" />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Max Ticket Size (₹)</label>
                            <input className="form-input" type="number" value={filterMaxTicket} onInput={e => setFilterMaxTicket(e.target.value)} placeholder="50000000" />
                        </div>
                    </div>
                )}

                {/* Direct Phone */}
                {recipientType === 'direct' && (
                    <div style={{ display: 'grid', grid: 'auto / 1fr 1fr', gap: '12px' }}>
                        <div className="form-group">
                            <label className="form-label">Phone Number</label>
                            <input className="form-input" value={directPhone} onInput={e => setDirectPhone(e.target.value)} placeholder="9876543210" />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Name (optional)</label>
                            <input className="form-input" value={directName} onInput={e => setDirectName(e.target.value)} placeholder="John" />
                        </div>
                    </div>
                )}

                {/* Search */}
                {recipientType !== 'direct' && (
                    <div className="form-group">
                        <label className="form-label">Search Contacts</label>
                        <input className="form-input" value={searchQuery} onInput={e => setSearchQuery(e.target.value)} placeholder="Search by name, phone, email, location..." />
                    </div>
                )}

                {/* Recipient Count */}
                {recipientType !== 'direct' && (
                    <div style={{ background: 'var(--surface-2, #f1f5f9)', padding: '12px 16px', borderRadius: '8px', margin: '12px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>
                            <strong>{getRecipientCount()}</strong> contacts with valid phone numbers
                        </span>
                        {(recipientType === 'custom') && (
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button className="btn btn--outline" style={{ fontSize: '12px', padding: '4px 10px' }} onClick={selectAll}>Select All</button>
                                <button className="btn btn--outline" style={{ fontSize: '12px', padding: '4px 10px' }} onClick={deselectAll}>Deselect</button>
                            </div>
                        )}
                    </div>
                )}

                {/* Contact List (for custom selection) */}
                {recipientType === 'custom' && filteredContacts.length > 0 && (
                    <div style={{ maxHeight: '300px', overflow: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
                        <table className="table" style={{ fontSize: '13px' }}>
                            <thead>
                                <tr><th style={{ width: '40px' }}></th><th>Name</th><th>Phone</th><th>Location</th><th>Ticket</th><th>Tags</th></tr>
                            </thead>
                            <tbody>
                                {filteredContacts.map(c => (
                                    <tr key={c.id} onClick={() => c.validPhone && toggleSelect(c.id)} style={{ cursor: c.validPhone ? 'pointer' : 'default', opacity: c.validPhone ? 1 : 0.4 }}>
                                        <td>
                                            <input type="checkbox" checked={selectedIds.includes(c.id)} disabled={!c.validPhone} onChange={() => {}} />
                                        </td>
                                        <td style={{ fontWeight: 500 }}>{c.name}</td>
                                        <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{c.phone}</td>
                                        <td>{c.location || '—'}</td>
                                        <td>{formatBudget(c.ticket_size)}</td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '2px', flexWrap: 'wrap' }}>
                                                {(c.tags || []).slice(0, 2).map(t => (
                                                    <span key={t} style={{ padding: '1px 6px', borderRadius: '8px', background: '#eef2ff', color: '#6366f1', fontSize: '10px' }}>{t}</span>
                                                ))}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Next Button */}
                <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                        className="btn btn--primary"
                        onClick={() => setShowStep2(true)}
                        disabled={getRecipientCount() === 0}
                    >
                        Next: Select Template →
                    </button>
                </div>
            </div>
        );
    }

    function renderStep2() {
        return (
            <div className="card" style={{ padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3>Step 2: Choose Template & Send</h3>
                    <button className="btn btn--outline" onClick={() => setShowStep2(false)}>← Back</button>
                </div>

                <p style={{ fontSize: '13px', opacity: 0.6, marginBottom: '16px' }}>
                    Sending to <strong>{getRecipientCount()}</strong> contact{getRecipientCount() !== 1 ? 's' : ''}
                </p>

                {/* Template Selection */}
                <div className="form-group">
                    <label className="form-label">Template</label>
                    <select className="form-input" value={campaignName} onChange={e => setCampaignName(e.target.value)}>
                        <option value="">Select an approved template</option>
                        {approvedTemplates.map(t => (
                            <option key={t.name} value={t.name}>{t.name} ({t.language})</option>
                        ))}
                    </select>
                </div>

                {/* Template Variables */}
                {templateVariables.length > 0 && (
                    <div className="form-group">
                        <label className="form-label">Template Variables</label>
                        {templateVariables.map((v, i) => (
                            <input
                                key={i}
                                className="form-input"
                                value={templateParams[i] || ''}
                                onInput={e => {
                                    const newParams = [...templateParams];
                                    newParams[i] = e.target.value;
                                    setTemplateParams(newParams);
                                }}
                                placeholder={`Value for ${v} (use {name} for contact name)`}
                                style={{ marginBottom: '8px' }}
                            />
                        ))}
                    </div>
                )}

                {/* Preview */}
                {selectedTemplate && (
                    <div style={{ background: '#dcf8c6', padding: '16px', borderRadius: '12px', maxWidth: '380px', margin: '16px 0', fontFamily: 'system-ui', fontSize: '14px', lineHeight: '1.5' }}>
                        <div style={{ fontWeight: 500 }}>
                            {selectedTemplate.components?.find(c => c.type === 'BODY')?.text?.replace(/\{\{(\d+)\}\}/g, (_, idx) => templateParams[parseInt(idx) - 1] || `{{${idx}}}`) || 'Preview'}
                        </div>
                        {selectedTemplate.components?.find(c => c.type === 'FOOTER') && (
                            <div style={{ fontSize: '12px', opacity: 0.6, marginTop: '8px' }}>
                                {selectedTemplate.components.find(c => c.type === 'FOOTER').text}
                            </div>
                        )}
                    </div>
                )}

                {/* Send */}
                <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                    <button className="btn btn--success" style={{ flex: 1 }} onClick={handleSend} disabled={isSending || !campaignName}>
                        {isSending ? 'Sending...' : `Send to ${getRecipientCount()} Contact${getRecipientCount() !== 1 ? 's' : ''}`}
                    </button>
                </div>
            </div>
        );
    }

    // ============================================================
    // HISTORY TAB
    // ============================================================
    function renderHistoryTab() {
        return (
            <div className="card" style={{ overflow: 'auto' }}>
                <table className="table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Template</th>
                            <th>Recipients</th>
                            <th>Sent</th>
                            <th>Failed</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(whatsappCampaigns || []).length === 0 ? (
                            <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px', opacity: 0.5 }}>No campaigns yet</td></tr>
                        ) : whatsappCampaigns.map(c => (
                            <tr key={c.id}>
                                <td style={{ fontSize: '13px' }}>{new Date(c.created_at).toLocaleDateString('en-IN')}</td>
                                <td style={{ fontWeight: 600 }}>{c.campaign_name}</td>
                                <td>{c.total_recipients}</td>
                                <td style={{ color: '#22c55e' }}>{c.successful_count || 0}</td>
                                <td style={{ color: '#ef4444' }}>{c.failed_count || 0}</td>
                                <td>
                                    <span className={`status-badge status-badge--${c.status === 'completed' ? 'success' : c.status === 'processing' ? 'warning' : c.status === 'failed' ? 'danger' : 'info'}`}>
                                        {c.status}
                                    </span>
                                </td>
                                <td>
                                    <button className="btn btn--outline" style={{ fontSize: '12px', padding: '4px 10px' }} onClick={() => viewCampaign(c.id)}>View</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }

    // ============================================================
    // TEMPLATES TAB
    // ============================================================
    function renderTemplatesTab() {
        return (
            <div>
                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                    <button className={`btn ${!tplShowList ? 'btn--primary' : 'btn--outline'}`} onClick={() => setTplShowList(false)}>Create Template</button>
                    <button className={`btn ${tplShowList ? 'btn--primary' : 'btn--outline'}`} onClick={() => { setTplShowList(true); fetchWhatsAppTemplates(); }}>My Templates</button>
                </div>

                {!tplShowList ? (
                    <div className="card" style={{ padding: '24px' }}>
                        <h3 style={{ marginBottom: '16px' }}>Create New Template</h3>
                        <form onSubmit={handleCreateTemplate}>
                            <div style={{ display: 'grid', grid: 'auto / 1fr 1fr 1fr', gap: '12px' }}>
                                <div className="form-group">
                                    <label className="form-label">Name *</label>
                                    <input className="form-input" value={tplName} onInput={e => setTplName(e.target.value)} placeholder="e.g. welcome_offer" required />
                                    <small style={{ opacity: 0.5 }}>Lowercase, underscores only</small>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Category</label>
                                    <select className="form-input" value={tplCategory} onChange={e => setTplCategory(e.target.value)}>
                                        <option value="MARKETING">Marketing</option>
                                        <option value="UTILITY">Utility</option>
                                        <option value="AUTHENTICATION">Authentication</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Language</label>
                                    <select className="form-input" value={tplLanguage} onChange={e => setTplLanguage(e.target.value)}>
                                        <option value="en">English</option>
                                        <option value="hi">Hindi</option>
                                        <option value="en_US">English (US)</option>
                                    </select>
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Header Image (optional)</label>
                                <input type="file" accept="image/*" onChange={handleImageSelect} className="form-input" />
                                {tplImagePreview && <img src={tplImagePreview} style={{ height: '80px', marginTop: '8px', borderRadius: '8px' }} />}
                            </div>

                            <div className="form-group">
                                <label className="form-label">Body Text * <span style={{ opacity: 0.5 }}>Use {'{{1}}'}, {'{{2}}'} for variables</span></label>
                                <textarea className="form-input" value={tplBody} onInput={e => setTplBody(e.target.value)} rows={4} required
                                    placeholder="Hi {{1}}, thank you for your interest! We have a special offer for you." />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Footer (optional)</label>
                                <input className="form-input" value={tplFooter} onInput={e => setTplFooter(e.target.value)} placeholder="Reply STOP to unsubscribe" maxLength={60} />
                            </div>

                            <div style={{ display: 'grid', grid: 'auto / 1fr 1fr', gap: '12px' }}>
                                <div className="form-group">
                                    <label className="form-label">Call Button Text</label>
                                    <input className="form-input" value={tplCallText} onInput={e => setTplCallText(e.target.value)} placeholder="Call Us" />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Call Button Phone</label>
                                    <input className="form-input" value={tplCallPhone} onInput={e => setTplCallPhone(e.target.value)} placeholder="+919876543210" />
                                </div>
                            </div>

                            <button type="submit" className="btn btn--primary" disabled={tplCreating} style={{ marginTop: '8px' }}>
                                {tplCreating ? 'Submitting...' : 'Submit to Meta for Review'}
                            </button>
                        </form>
                    </div>
                ) : (
                    <div className="card" style={{ overflow: 'auto' }}>
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Category</th>
                                    <th>Language</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(whatsappTemplates || []).length === 0 ? (
                                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: '40px', opacity: 0.5 }}>No templates found</td></tr>
                                ) : whatsappTemplates.map(t => (
                                    <tr key={t.id || t.name}>
                                        <td style={{ fontWeight: 600 }}>{t.name}</td>
                                        <td>{t.category}</td>
                                        <td>{t.language}</td>
                                        <td>
                                            <span className={`status-badge status-badge--${t.status === 'APPROVED' ? 'success' : t.status === 'REJECTED' ? 'danger' : 'warning'}`}>
                                                {t.status}
                                            </span>
                                        </td>
                                        <td>
                                            <button className="btn btn--outline" style={{ fontSize: '12px', padding: '4px 10px', color: '#ef4444' }}
                                                onClick={() => { if (confirm(`Delete template "${t.name}"?`)) deleteWhatsAppTemplate(t.name); }}>
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        );
    }
}
