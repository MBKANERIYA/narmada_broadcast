import { useEffect, useState } from 'preact/hooks';
import { useStore } from '../stores/store';
import Icon, { EmptyStateIcon } from './Icons';

/**
 * WhatsApp Broadcast Component
 * Admin-only: Send bulk WhatsApp messages to clients/leads
 */
export default function WhatsAppBroadcast() {
    const {
        fetchWhatsAppRecipients, sendWhatsAppBroadcast, sendWhatsAppMessage, fetchWhatsAppCampaigns,
        whatsappRecipients, whatsappCampaigns, showToast, user,
        uploadTemplateImage, createWhatsAppTemplate, fetchWhatsAppTemplates, deleteWhatsAppTemplate, whatsappTemplates
    } = useStore();

    const [tab, setTab] = useState('broadcast'); // 'broadcast' | 'history' | 'templates'

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
    const [recipientType, setRecipientType] = useState('all_clients');
    const [leadStatus, setLeadStatus] = useState('');
    const [customFilter, setCustomFilter] = useState('all');
    
    // Single Search Bar
    const [searchQuery, setSearchQuery] = useState('');

    const [selectedIds, setSelectedIds] = useState({ clientIds: [], leadIds: [] });
    const [campaignName, setCampaignName] = useState('');
    const [templateParams, setTemplateParams] = useState(['', '', '']);
    const [directPhone, setDirectPhone] = useState('');
    const [directName, setDirectName] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [campaignDetail, setCampaignDetail] = useState(null);
    const [showStep2Modal, setShowStep2Modal] = useState(false);

    useEffect(() => {
        fetchWhatsAppRecipients();
        fetchWhatsAppCampaigns();
        fetchWhatsAppTemplates();
    }, []);

    // Recalculate on type or search change
    useEffect(() => {
        // Debounce the API call slightly so typing doesn't spam backend
        const timer = setTimeout(() => {
            if (recipientType === 'leads_by_status' && leadStatus) {
                fetchWhatsAppRecipients('leads', leadStatus, searchQuery);
            } else if (recipientType === 'all_clients') {
                fetchWhatsAppRecipients('clients', undefined, searchQuery);
            } else if (recipientType === 'all_leads') {
                fetchWhatsAppRecipients('leads', undefined, searchQuery);
            } else {
                fetchWhatsAppRecipients('all', undefined, searchQuery);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [recipientType, leadStatus, searchQuery]);

    const recipients = whatsappRecipients || { clients: [], leads: [], counts: {} };
    const counts = recipients.counts || {};

    const getSelectedCount = () => {
        if (recipientType === 'direct') return directPhone.trim() ? 1 : 0;
        if (recipientType === 'all_clients') return counts.clientsWithValidPhone || 0;
        if (recipientType === 'all_leads' || recipientType === 'leads_by_status') return counts.leadsWithValidPhone || 0;
        if (recipientType === 'custom') return selectedIds.clientIds.length + selectedIds.leadIds.length;
        return 0;
    };

    const toggleRecipient = (id, type) => {
        setSelectedIds(prev => {
            const key = type === 'client' ? 'clientIds' : 'leadIds';
            const has = prev[key].includes(id);
            return {
                ...prev,
                [key]: has ? prev[key].filter(i => i !== id) : [...prev[key], id],
            };
        });
    };

    const handleBroadcast = async () => {
        setIsSending(true);
        try {
            if (recipientType === 'direct') {
                await sendWhatsAppMessage({
                    phone: directPhone,
                    campaignName,
                    templateParams: templateParams.filter(p => p.trim()),
                    userName: directName
                });
                showToast(`Message sent to ${directPhone}!`, 'success');
                setDirectPhone('');
                setDirectName('');
            } else {
                const data = {
                    campaignName,
                    templateParams: templateParams.filter(p => p.trim()),
                    recipientType,
                    recipientFilter: recipientType === 'leads_by_status' ? { status: leadStatus } : undefined,
                    recipientIds: recipientType === 'custom' ? selectedIds : undefined,
                };
                await sendWhatsAppBroadcast(data);
                showToast(`Broadcast started to ${getSelectedCount()} recipients!`, 'success');
                setTab('history');
                fetchWhatsAppCampaigns();
            }
            setShowConfirm(false);
        } catch (error) {
            showToast(error.message || 'Failed to send WhatsApp message', 'error');
        }
        setIsSending(false);
    };

    const viewCampaignDetail = async (id) => {
        try {
            const { fetchWhatsAppCampaignDetail } = useStore.getState();
            const detail = await fetchWhatsAppCampaignDetail(id);
            setCampaignDetail(detail);
        } catch (error) {
            showToast('Failed to load details', 'error');
        }
    };

    const selectedCount = getSelectedCount();

    const handleEditTemplate = (tpl) => {
        setTplName(tpl.name);
        setTplCategory(tpl.category);
        setTplLanguage(tpl.language);

        // Extract components
        const body = tpl.components?.find(c => c.type === 'BODY')?.text || '';
        const footer = tpl.components?.find(c => c.type === 'FOOTER')?.text || '';
        const header = tpl.components?.find(c => c.type === 'HEADER');
        const buttons = tpl.components?.find(c => c.type === 'BUTTONS');

        setTplBody(body);
        setTplFooter(footer);

        // Header image preview
        if (header?.format === 'IMAGE') {
            const url = header.example?.header_handle?.[0] || header.example?.header_url?.[0];
            if (url) setTplImagePreview(url);
            else setTplImagePreview(null);
        } else {
            setTplImagePreview(null);
        }
        setTplImageFile(null); // Reset file as we only have the preview URL

        // Buttons
        const callBtn = buttons?.buttons?.find(b => b.type === 'PHONE_NUMBER');
        if (callBtn) {
            setTplCallText(callBtn.text);
            setTplCallPhone(callBtn.phone_number);
        } else {
            setTplCallText('');
            setTplCallPhone('');
        }

        setTplShowList(false);
        showToast(`Template "${tpl.name}" loaded for editing`, 'success');
    };

    return (
        <div className="page-container">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)' }}>
                <div>
                    <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}><Icon name="message-circle" size={24} /> WhatsApp Broadcast</h1>
                    <p style={{ color: 'var(--text-muted)', margin: '4px 0 0' }}>Send bulk messages to clients and leads</p>
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-6)', borderBottom: '2px solid var(--border-color)', paddingBottom: 'var(--space-2)', flexWrap: 'wrap' }}>
                <button className={`btn ${tab === 'broadcast' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('broadcast')} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Icon name="send" size={14} /> New Broadcast</button>
                <button className={`btn ${tab === 'history' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setTab('history'); fetchWhatsAppCampaigns(); }} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Icon name="bar-chart" size={14} /> Campaign History</button>
                <button className={`btn ${tab === 'templates' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setTab('templates'); fetchWhatsAppTemplates(); }} style={tab === 'templates' ? { background: '#6366f1', display: 'inline-flex', alignItems: 'center', gap: '4px' } : { display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Icon name="file-text" size={14} /> Create Template</button>
            </div>

            {tab === 'broadcast' ? renderBroadcastForm() : tab === 'history' ? renderHistory() : renderCreateTemplate()}

            {/* Step 2 Modal (Mobile only) */}
            {showStep2Modal && (
                <div className="modal-overlay" onClick={() => setShowStep2Modal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px', maxHeight: '90vh', overflow: 'auto' }}>
                        <div className="modal-header">
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}><Icon name="file-text" size={16} /> Configure Message</h3>
                            <button className="btn-icon" onClick={() => setShowStep2Modal(false)}><Icon name="x" size={18} /></button>
                        </div>
                        <div className="modal-body" style={{ padding: 'var(--space-4)' }}>
                            {renderStep2Content()}
                        </div>
                    </div>
                </div>
            )}

            {/* Confirmation Modal */}
            {showConfirm && (
                <div className="modal-overlay" onClick={() => setShowConfirm(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                        <div className="modal-header">
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}><Icon name="alert-triangle" size={16} color="#f59e0b" /> Confirm Broadcast</h3>
                            <button className="btn-icon" onClick={() => setShowConfirm(false)}><Icon name="x" size={18} /></button>
                        </div>
                        <div className="modal-body" style={{ padding: 'var(--space-4)' }}>
                            <div style={{
                                background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 'var(--radius-md)',
                                padding: 'var(--space-3)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)'
                            }}>
                                <strong><Icon name="alert-triangle" size={14} style={{ marginRight: '4px' }} /> This action cannot be undone!</strong>
                                <br />This will send WhatsApp messages to <strong>{selectedCount}</strong> recipients.
                            </div>
                            <table style={{ width: '100%', fontSize: 'var(--text-sm)' }}>
                                <tbody>
                                    <tr><td style={{ padding: '4px 0', color: 'var(--text-muted)' }}>Campaign</td><td style={{ fontWeight: 600 }}>{campaignName}</td></tr>
                                    <tr><td style={{ padding: '4px 0', color: 'var(--text-muted)' }}>Recipients</td><td style={{ fontWeight: 600 }}>{selectedCount}</td></tr>
                                    <tr><td style={{ padding: '4px 0', color: 'var(--text-muted)' }}>Audience</td><td style={{ fontWeight: 600 }}>{recipientType.replace(/_/g, ' ')}</td></tr>
                                </tbody>
                            </table>
                        </div>
                        <div className="modal-footer" style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', padding: 'var(--space-4)', borderTop: '1px solid var(--border-color)' }}>
                            <button className="btn btn-secondary" onClick={() => setShowConfirm(false)} disabled={isSending}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleBroadcast} disabled={isSending}
                                style={{ background: '#25D366' }}>
                                {isSending ? <><Icon name="loader" size={14} style={{ marginRight: '4px' }} /> Sending...</> : <><Icon name="check-circle" size={14} style={{ marginRight: '4px' }} /> Send to {selectedCount} recipients</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Campaign Detail Modal */}
            {campaignDetail && (
                <div className="modal-overlay" onClick={() => setCampaignDetail(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px', maxHeight: '80vh', overflow: 'auto' }}>
                        <div className="modal-header">
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}><Icon name="clipboard" size={16} /> Campaign Detail</h3>
                            <button className="btn-icon" onClick={() => setCampaignDetail(null)}><Icon name="x" size={18} /></button>
                        </div>
                        <div className="modal-body" style={{ padding: 'var(--space-4)' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
                                <StatBox label="Total" value={campaignDetail.total_recipients} color="#6366f1" />
                                <StatBox label="Sent" value={campaignDetail.successful_count} color="#22c55e" />
                                <StatBox label="Failed" value={campaignDetail.failed_count} color="#ef4444" />
                            </div>

                            {campaignDetail.messages && campaignDetail.messages.length > 0 && (
                                <div style={{ overflowX: 'auto' }}>
                                    <table className="data-table" style={{ width: '100%', fontSize: 'var(--text-sm)' }}>
                                        <thead>
                                            <tr>
                                                <th>Name</th>
                                                <th>Phone</th>
                                                <th>Type</th>
                                                <th>Status</th>
                                                <th>Error</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {campaignDetail.messages.map(msg => (
                                                <tr key={msg.id}>
                                                    <td>{msg.recipient_name || '—'}</td>
                                                    <td>{msg.phone}</td>
                                                    <td>{msg.recipient_type}</td>
                                                    <td>
                                                        <span style={{
                                                            padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                                                            background: msg.status === 'sent' ? '#dcfce7' : msg.status === 'failed' ? '#fee2e2' : '#f3f4f6',
                                                            color: msg.status === 'sent' ? '#166534' : msg.status === 'failed' ? '#b91c1c' : '#374151'
                                                        }}>
                                                            {msg.status}
                                                        </span>
                                                    </td>
                                                    <td style={{ color: '#ef4444', fontSize: '12px' }}>{msg.error_message || '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    // ========== Broadcast Form ==========
    function renderStep2Content() {
        return (
            <>
                <h3 style={{ marginTop: 0, marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: '6px' }}><Icon name="file-text" size={16} /> Step 2: Configure Message</h3>

                <div style={{ marginBottom: 'var(--space-3)' }}>
                    <label className="form-label">Campaign / Template Name</label>
                    <select
                        className="form-input"
                        value={campaignName}
                        onChange={e => setCampaignName(e.target.value)}
                    >
                        <option value="">Select a template</option>
                        {(whatsappTemplates || []).map(t => (
                            <option key={t.id || t.name} value={t.name}>
                                {t.name} ({t.status}{t.language ? ` - ${t.language}` : ''})
                            </option>
                        ))}
                    </select>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
                        Select an approved template to broadcast
                    </p>
                </div>

                <div style={{ marginBottom: 'var(--space-3)' }}>
                    <label className="form-label">Template Variables (optional)</label>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 8px' }}>
                        If your template has placeholders like {'{{1}}'}, {'{{2}}'}, fill them here
                    </p>
                    {templateParams.map((param, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)', minWidth: '35px' }}>{`{{${idx + 1}}}`}</span>
                            <input
                                className="form-input" type="text" value={param}
                                onChange={e => {
                                    const newParams = [...templateParams];
                                    newParams[idx] = e.target.value;
                                    setTemplateParams(newParams);
                                }}
                                placeholder={`Variable ${idx + 1}`}
                                style={{ flex: 1 }}
                            />
                        </div>
                    ))}
                    <button className="btn btn-secondary" style={{ fontSize: '12px' }}
                        onClick={() => setTemplateParams([...templateParams, ''])}>
                        + Add Variable
                    </button>
                </div>

                {/* Live Preview */}
                {campaignName && (
                    <div style={{ marginTop: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
                        <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Icon name="eye" size={14} /> Live Preview
                        </label>
                        {(() => {
                            const tpl = (whatsappTemplates || []).find(t => t.name === campaignName);
                            if (!tpl) return <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '10px', background: '#f9fafb', borderRadius: '8px' }}>Loading preview...</div>;

                            const bodyComponent = tpl.components?.find(c => c.type === 'BODY');
                            const footerComponent = tpl.components?.find(c => c.type === 'FOOTER');
                            const headerComponent = tpl.components?.find(c => c.type === 'HEADER');
                            const buttonsComponent = tpl.components?.find(c => c.type === 'BUTTONS');

                            const headerUrl = headerComponent?.example?.header_handle?.[0] || headerComponent?.example?.header_url?.[0];
                            
                            // Helper to render body text with variables highlighted
                            const renderFormattedBody = (text) => {
                                if (!text) return null;
                                const parts = text.split(/(\{\{\d+\}\})/g);
                                return parts.map((part, i) => {
                                    const match = part.match(/\{\{(\d+)\}\}/);
                                    if (match) {
                                        const num = parseInt(match[1]);
                                        const val = templateParams[num - 1];
                                        return val ? <strong key={i} style={{ color: '#075e54', fontWeight: 700 }}>{val}</strong> : <span key={i} style={{ color: '#8696a0' }}>{part}</span>;
                                    }
                                    return part;
                                });
                            };

                            return (
                                <div style={{ background: '#e5ddd5', borderRadius: 'var(--radius-lg)', padding: 'var(--space-3)', position: 'relative' }}>
                                    <div style={{ maxWidth: '100%', background: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.1)', position: 'relative' }}>
                                        {/* Header Image/Video/Document */}
                                        {headerComponent?.format === 'IMAGE' && headerUrl && (
                                            <img src={headerUrl} alt="Header" style={{ width: '100%', height: '140px', objectFit: 'cover' }} />
                                        )}
                                        {headerComponent?.format === 'VIDEO' && (
                                            <div style={{ width: '100%', height: '140px', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                                                <Icon name="play-circle" size={48} />
                                            </div>
                                        )}
                                        {headerComponent?.format === 'DOCUMENT' && (
                                            <div style={{ width: '100%', height: '100px', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#667781' }}>
                                                <Icon name="file-text" size={32} />
                                                <span style={{ fontSize: '13px' }}>Document Attachment</span>
                                            </div>
                                        )}

                                        <div style={{ padding: '8px 12px' }}>
                                            {/* Body */}
                                            <p style={{ fontSize: '14px', margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.5, color: '#111b21' }}>
                                                {renderFormattedBody(bodyComponent?.text)}
                                            </p>
                                            
                                            {/* Footer */}
                                            {footerComponent?.text && (
                                                <p style={{ fontSize: '12px', color: '#667781', margin: '4px 0 0' }}>{footerComponent.text}</p>
                                            )}

                                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '2px' }}>
                                                <span style={{ fontSize: '11px', color: '#667781' }}>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                        </div>

                                        {/* Quick Reply or Call/URL Buttons */}
                                        {buttonsComponent?.buttons?.map((btn, i) => (
                                            <div key={i} style={{ borderTop: '1px solid #f0f2f5', padding: '10px', textAlign: 'center', color: '#008069', fontSize: '14px', fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                                {btn.type === 'PHONE_NUMBER' ? <Icon name="phone" size={14} /> : 
                                                 btn.type === 'URL' ? <Icon name="external-link" size={14} /> : 
                                                 <Icon name="message-square" size={14} />}
                                                {btn.text}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                )}

                {/* Send Button */}
                <button
                    className="btn btn-primary"
                    style={{
                        width: '100%', padding: 'var(--space-3)', fontSize: 'var(--text-md)',
                        background: '#25D366', border: 'none', marginTop: 'var(--space-2)',
                        opacity: selectedCount === 0 || !campaignName ? 0.5 : 1,
                    }}
                    disabled={selectedCount === 0 || !campaignName || isSending}
                    onClick={() => setShowConfirm(true)}
                >
                    <Icon name="message-circle" size={16} style={{ marginRight: '4px' }} /> Send to {selectedCount} recipients
                </button>

            </>
        );
    }

    function renderBroadcastForm() {
        return (
            <div style={{ paddingBottom: 'var(--space-2)' }}>
            <style>{`
                .wa-broadcast-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-6); }
                .wa-step2-desktop { display: block; }
                .wa-next-btn-mobile { display: none !important; }
                @media (max-width: 768px) {
                    .wa-broadcast-grid { grid-template-columns: 1fr; }
                    .wa-step2-desktop { display: none !important; }
                    .wa-next-btn-mobile { display: block !important; }
                }
            `}</style>
            <div className="wa-broadcast-grid">
                {/* Left: Audience */}
                <div className="card" style={{ padding: 'var(--space-4)' }}>
                    <h3 style={{ marginTop: 0, marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: '6px' }}><Icon name="users" size={16} /> Step 1: Select Audience</h3>

                    {/* Single Search Bar and Custom Filter */}
                    <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                            <Icon name="search" size={14} style={{ position: 'absolute', left: '12px', top: '10px' }} />
                            <input
                                className="form-input"
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Search by name, email, location... (use comma for multiple filters)"
                                style={{ paddingLeft: '34px' }}
                            />
                        </div>
                        {recipientType === 'custom' && (
                            <select 
                                className="form-input" 
                                style={{ width: '110px' }}
                                value={customFilter}
                                onChange={e => setCustomFilter(e.target.value)}
                            >
                                <option value="all">All</option>
                                <option value="client">Client</option>
                                <option value="lead">Lead</option>
                            </select>
                        )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                        {[
                            { value: 'all_clients', label: <><Icon name="trophy" size={14} style={{ marginRight: '4px' }} /> All Clients</>, count: counts.clientsWithValidPhone },
                            { value: 'all_leads', label: <><Icon name="users" size={14} style={{ marginRight: '4px' }} /> All Active Leads</>, count: counts.leadsWithValidPhone },
                            { value: 'leads_by_status', label: <><Icon name="search" size={14} style={{ marginRight: '4px' }} /> Leads by Status</> },
                            { value: 'custom', label: <><Icon name="check-square" size={14} style={{ marginRight: '4px' }} /> Custom Selection</> },
                            { value: 'direct', label: <><Icon name="smartphone" size={14} style={{ marginRight: '4px' }} /> Direct Number</> },
                        ].map(opt => (
                            <label key={opt.value} style={{
                                display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                                padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)',
                                border: `2px solid ${recipientType === opt.value ? '#25D366' : 'var(--border-color)'}`,
                                background: recipientType === opt.value ? '#f0fdf4' : 'transparent',
                                cursor: 'pointer', transition: 'all 0.2s',
                            }}>
                                <input
                                    type="radio" name="recipientType" value={opt.value}
                                    checked={recipientType === opt.value}
                                    onChange={() => setRecipientType(opt.value)}
                                />
                                <span style={{ flex: 1 }}>{opt.label}</span>
                                {opt.count !== undefined && (
                                    <span style={{ background: '#25D366', color: 'white', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 600 }}>
                                        {opt.count}
                                    </span>
                                )}
                            </label>
                        ))}
                    </div>

                    {/* Status filter for leads_by_status */}
                    {recipientType === 'leads_by_status' && (
                        <div style={{ marginTop: 'var(--space-3)' }}>
                            <label className="form-label">Filter by Status</label>
                            <select className="form-input" value={leadStatus} onChange={e => setLeadStatus(e.target.value)}>
                                <option value="">Select Status</option>
                                <option value="new">New</option>
                                <option value="contacted">Contacted</option>
                                <option value="qualified">Qualified</option>
                            </select>
                        </div>
                    )}

                    {/* Custom selection list */}
                    {recipientType === 'custom' && (
                        <div style={{ marginTop: 'var(--space-3)', maxHeight: '300px', overflow: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 'var(--space-2)' }}>
                            {(customFilter === 'all' || customFilter === 'client') && recipients.clients.filter(c => c.validPhone).length > 0 && (() => {
                                const validClients = recipients.clients.filter(c => c.validPhone);
                                const allClientsSelected = validClients.every(c => selectedIds.clientIds.includes(c.id));
                                return (
                                <>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', background: '#f0fdf4', borderRadius: 'var(--radius-sm)', marginBottom: '4px' }}>
                                        <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: '#166534' }}>Clients ({validClients.length})</span>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: '#166534' }}>
                                            <input type="checkbox" checked={allClientsSelected} onChange={() => {
                                                if (allClientsSelected) {
                                                    setSelectedIds(prev => ({ ...prev, clientIds: [] }));
                                                } else {
                                                    setSelectedIds(prev => ({ ...prev, clientIds: validClients.map(c => c.id) }));
                                                }
                                            }} />
                                            Select All
                                        </label>
                                    </div>
                                    {validClients.map(c => (
                                        <label key={`c-${c.id}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', cursor: 'pointer' }}>
                                            <input type="checkbox" checked={selectedIds.clientIds.includes(c.id)} onChange={() => toggleRecipient(c.id, 'client')} />
                                            <span>{c.name}</span>
                                            <span style={{ color: 'var(--text-muted)', fontSize: '12px', marginLeft: 'auto' }}>{c.phone}</span>
                                        </label>
                                    ))}
                                </>
                                );
                            })()}
                            {(customFilter === 'all' || customFilter === 'lead') && recipients.leads.filter(l => l.validPhone).length > 0 && (() => {
                                const validLeads = recipients.leads.filter(l => l.validPhone);
                                const allLeadsSelected = validLeads.every(l => selectedIds.leadIds.includes(l.id));
                                return (
                                <>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', background: '#eff6ff', borderRadius: 'var(--radius-sm)', marginTop: '8px', marginBottom: '4px' }}>
                                        <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: '#1e40af' }}>Leads ({validLeads.length})</span>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: '#1e40af' }}>
                                            <input type="checkbox" checked={allLeadsSelected} onChange={() => {
                                                if (allLeadsSelected) {
                                                    setSelectedIds(prev => ({ ...prev, leadIds: [] }));
                                                } else {
                                                    setSelectedIds(prev => ({ ...prev, leadIds: validLeads.map(l => l.id) }));
                                                }
                                            }} />
                                            Select All
                                        </label>
                                    </div>
                                    {validLeads.map(l => (
                                        <label key={`l-${l.id}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', cursor: 'pointer' }}>
                                            <input type="checkbox" checked={selectedIds.leadIds.includes(l.id)} onChange={() => toggleRecipient(l.id, 'lead')} />
                                            <span>{l.name}</span>
                                            <span style={{ color: 'var(--text-muted)', fontSize: '12px', marginLeft: 'auto' }}>{l.phone}</span>
                                        </label>
                                    ))}
                                </>
                                );
                            })()}
                        </div>
                    )}

                    {/* Direct Number Input */}
                    {recipientType === 'direct' && (
                        <div style={{ marginTop: 'var(--space-3)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', background: '#f9fafb' }}>
                            <div style={{ marginBottom: 'var(--space-3)' }}>
                                <label className="form-label" style={{ fontWeight: 600 }}>Phone Number <span style={{color: '#ef4444'}}>*</span></label>
                                <input
                                    className="form-input" type="tel" value={directPhone}
                                    onChange={e => setDirectPhone(e.target.value)}
                                    placeholder="e.g., 919876543210"
                                    style={{ borderColor: directPhone ? '#10b981' : 'var(--border-color)', borderWidth: '2px' }}
                                />
                                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0' }}>Include country code without `+` (e.g. 91 for India)</p>
                            </div>
                            <div>
                                <label className="form-label">Recipient Name (Optional)</label>
                                <input
                                    className="form-input" type="text" value={directName}
                                    onChange={e => setDirectName(e.target.value)}
                                    placeholder="e.g., John Doe"
                                />
                            </div>
                        </div>
                    )}

                    {/* Recipient count badge */}
                    <div style={{
                        marginTop: 'var(--space-4)', padding: 'var(--space-3)', background: selectedCount > 0 ? '#f0fdf4' : '#fef3f2',
                        borderRadius: 'var(--radius-md)', textAlign: 'center', fontWeight: 600,
                        color: selectedCount > 0 ? '#166534' : '#b91c1c',
                    }}>
                        {selectedCount > 0 ? <><Icon name="check-circle" size={14} style={{ marginRight: '4px' }} /> {selectedCount} recipients with valid phone numbers</> : <><Icon name="alert-triangle" size={14} style={{ marginRight: '4px' }} /> No valid recipients selected</>}
                    </div>

                    {/* Mobile: Next Button (inside Step 1 card) */}
                    <button
                        className="btn btn-primary wa-next-btn-mobile"
                        style={{
                            width: '100%', padding: 'var(--space-3)', fontSize: 'var(--text-md)',
                            background: '#25D366', border: 'none', marginTop: 'var(--space-4)',
                        }}
                        onClick={() => setShowStep2Modal(true)}
                    >
                        Next → Configure Message
                    </button>
                </div>

                {/* Right: Template & Send (desktop only) */}
                <div className="card wa-step2-desktop" style={{ padding: 'var(--space-4)' }}>
                    {renderStep2Content()}
                </div>
            </div>
            </div>
        );
    }

    // ========== Campaign History ==========
    function renderHistory() {
        const campaigns = whatsappCampaigns || [];

        return (
            <div className="card" style={{ padding: 'var(--space-4)' }}>
                {campaigns.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
                        <div style={{ fontSize: '48px', marginBottom: 'var(--space-2)' }}><EmptyStateIcon name="inbox" /></div>
                        <p>No campaigns sent yet. Start your first broadcast!</p>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="data-table" style={{ width: '100%' }}>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Campaign</th>
                                    <th>Audience</th>
                                    <th>Total</th>
                                    <th>Sent</th>
                                    <th>Failed</th>
                                    <th>Status</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {campaigns.map(c => (
                                    <tr key={c.id}>
                                        <td style={{ whiteSpace: 'nowrap' }}>{new Date(c.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
                                        <td>{c.campaign_name}</td>
                                        <td>{c.recipient_type.replace(/_/g, ' ')}</td>
                                        <td style={{ fontWeight: 600 }}>{c.total_recipients}</td>
                                        <td style={{ color: '#22c55e', fontWeight: 600 }}>{c.successful_count}</td>
                                        <td style={{ color: c.failed_count > 0 ? '#ef4444' : 'inherit', fontWeight: 600 }}>{c.failed_count}</td>
                                        <td>
                                            <span style={{
                                                display: 'inline-block', padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 600,
                                                background: c.status === 'completed' ? '#dcfce7' : c.status === 'processing' ? '#fef3c7' : c.status === 'failed' ? '#fee2e2' : '#f3f4f6',
                                                color: c.status === 'completed' ? '#166534' : c.status === 'processing' ? '#92400e' : c.status === 'failed' ? '#b91c1c' : '#374151',
                                            }}>
                                                {c.status === 'processing' ? <Icon name="loader" size={12} style={{ marginRight: '3px' }} /> : c.status === 'completed' ? <Icon name="check-circle" size={12} style={{ marginRight: '3px' }} /> : c.status === 'failed' ? <Icon name="x-circle" size={12} style={{ marginRight: '3px' }} /> : <Icon name="file-text" size={12} style={{ marginRight: '3px' }} />} {c.status}
                                            </span>
                                        </td>
                                        <td>
                                            <button className="btn btn-secondary" style={{ fontSize: '12px', padding: '4px 10px' }}
                                                onClick={() => viewCampaignDetail(c.id)}>
                                                View
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

    // ========== Create Template ==========
    function renderCreateTemplate() {
        const handleImageSelect = (e) => {
            const file = e.target.files[0];
            if (file) {
                if (file.size > 5 * 1024 * 1024) { showToast('Image must be under 5MB', 'error'); return; }
                setTplImageFile(file);
                setTplImagePreview(URL.createObjectURL(file));
            }
        };

        const handleCreateTemplate = async () => {
            if (!tplName.trim()) { showToast('Template name is required', 'error'); return; }
            if (!tplBody.trim()) { showToast('Body text is required', 'error'); return; }
            setTplCreating(true);
            try {
                let headerImageHandle = null;
                if (tplImageFile) {
                    showToast('Uploading image...', 'success');
                    headerImageHandle = await uploadTemplateImage(tplImageFile);
                }
                await createWhatsAppTemplate({
                    name: tplName,
                    category: tplCategory,
                    language: tplLanguage,
                    bodyText: tplBody,
                    headerImageHandle,
                    footerText: tplFooter || null,
                    callButtonText: tplCallText || null,
                    callButtonPhone: tplCallPhone || null,
                });
                showToast('Template created! It will be reviewed by Meta.', 'success');
                setTplName(''); setTplBody(''); setTplFooter(''); setTplCallText(''); setTplCallPhone('');
                setTplImageFile(null); setTplImagePreview(null);
                fetchWhatsAppTemplates();
            } catch (err) {
                showToast(err.message || 'Failed to create template', 'error');
            }
            setTplCreating(false);
        };

        const handleDeleteTemplate = async (name) => {
            if (!confirm(`Delete template "${name}"? This cannot be undone.`)) return;
            try {
                await deleteWhatsAppTemplate(name);
                showToast(`Template "${name}" deleted`, 'success');
            } catch (err) { showToast(err.message, 'error'); }
        };

        const templates = whatsappTemplates || [];

        return (
            <div>
                <style>{`
                    .tpl-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-6); }
                    @media (max-width: 768px) { .tpl-grid { grid-template-columns: 1fr; } }
                `}</style>

                {/* Toggle: Create / View Existing */}
                <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
                    <button className={`btn ${!tplShowList ? 'btn-primary' : 'btn-secondary'}`} onClick={() => {
                        setTplName(''); setTplBody(''); setTplFooter(''); setTplCallText(''); setTplCallPhone('');
                        setTplImageFile(null); setTplImagePreview(null); setTplShowList(false);
                    }} style={!tplShowList ? { background: '#6366f1', display: 'inline-flex', alignItems: 'center', gap: '4px' } : { display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Icon name="plus" size={14} /> New Template</button>
                    <button className={`btn ${tplShowList ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setTplShowList(true); fetchWhatsAppTemplates(); }} style={tplShowList ? { background: '#6366f1', display: 'inline-flex', alignItems: 'center', gap: '4px' } : { display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Icon name="clipboard" size={14} /> My Templates ({templates.length})</button>
                </div>

                {tplShowList ? (
                    /* ===== Template List ===== */
                    <div className="card" style={{ padding: 'var(--space-4)' }}>
                        {templates.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
                                <div style={{ fontSize: '48px', marginBottom: 'var(--space-2)' }}><EmptyStateIcon name="file-text" /></div>
                                <p>No templates found. Create your first template!</p>
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table className="data-table" style={{ width: '100%' }}>
                                    <thead><tr><th>Name</th><th>Category</th><th>Language</th><th>Status</th><th>Action</th></tr></thead>
                                    <tbody>
                                        {templates.map(t => (
                                            <tr key={t.id || t.name}>
                                                <td style={{ fontWeight: 600, color: 'var(--primary-color)', cursor: 'pointer' }} onClick={() => handleEditTemplate(t)}>{t.name}</td>
                                                <td><span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '11px', background: '#eff6ff', color: '#1e40af' }}>{t.category}</span></td>
                                                <td>{t.language}</td>
                                                <td><span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, background: t.status === 'APPROVED' ? '#dcfce7' : t.status === 'REJECTED' ? '#fee2e2' : '#fef3c7', color: t.status === 'APPROVED' ? '#166534' : t.status === 'REJECTED' ? '#b91c1c' : t.status === 'REJECTED' ? '#b91c1c' : '#92400e' }}>{t.status}</span></td>
                                                <td style={{ display: 'flex', gap: '8px' }}>
                                                    <button className="btn btn-secondary" style={{ fontSize: '12px', padding: '4px 10px', color: '#3b82f6' }} title="Edit/Clone Template" onClick={() => handleEditTemplate(t)}><Icon name="pencil" size={14} /></button>
                                                    <button className="btn btn-secondary" style={{ fontSize: '12px', padding: '4px 10px', color: '#ef4444' }} onClick={() => handleDeleteTemplate(t.name)}><Icon name="trash" size={14} /></button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                ) : (
                    /* ===== Create Template Form ===== */
                    <div className="tpl-grid">
                        {/* Left: Form */}
                        <div className="card" style={{ padding: 'var(--space-4)' }}>
                            <h3 style={{ marginTop: 0, marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: '8px' }}><Icon name="file-text" size={16} /> Template Details</h3>

                            {/* Name */}
                            <div style={{ marginBottom: 'var(--space-3)' }}>
                                <label className="form-label">Template Name <span style={{ color: '#ef4444' }}>*</span></label>
                                <input className="form-input" type="text" value={tplName} onChange={e => setTplName(e.target.value)} placeholder="e.g. welcome_offer_2026" />
                                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0 0' }}>Lowercase, only letters, numbers & underscores</p>
                            </div>

                            {/* Category & Language */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                                <div>
                                    <label className="form-label">Category</label>
                                    <select className="form-input" value={tplCategory} onChange={e => setTplCategory(e.target.value)}>
                                        <option value="MARKETING">Marketing</option>
                                        <option value="UTILITY">Utility</option>
                                        <option value="AUTHENTICATION">Authentication</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="form-label">Language</label>
                                    <select className="form-input" value={tplLanguage} onChange={e => setTplLanguage(e.target.value)}>
                                        <option value="en">English</option>
                                        <option value="en_US">English (US)</option>
                                        <option value="hi">Hindi</option>
                                        <option value="gu">Gujarati</option>
                                    </select>
                                </div>
                            </div>

                            {/* Header Image (Optional) */}
                            <div style={{ marginBottom: 'var(--space-3)' }}>
                                <label className="form-label">Header Image <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>(optional, max 5MB)</span></label>
                                <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', border: '2px dashed var(--border-color)', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: '13px', transition: 'all 0.2s' }}>
                                        <Icon name="image" size={14} style={{ marginRight: '4px' }} /> {tplImageFile ? tplImageFile.name : 'Choose Image'}
                                        <input type="file" accept="image/jpeg,image/png" onChange={handleImageSelect} style={{ display: 'none' }} />
                                    </label>
                                    {tplImageFile && <button className="btn btn-secondary" style={{ fontSize: '12px', padding: '4px 8px' }} onClick={() => { setTplImageFile(null); setTplImagePreview(null); }}><Icon name="x" size={12} /> Remove</button>}
                                </div>
                            </div>

                            {/* Body Text */}
                            <div style={{ marginBottom: 'var(--space-3)' }}>
                                <label className="form-label">Body Text <span style={{ color: '#ef4444' }}>*</span></label>
                                <textarea className="form-input" rows={4} value={tplBody} onChange={e => setTplBody(e.target.value)} placeholder={'Hello {{1}},\n\nWe have an exciting offer for you!\n\nContact us at {{2}} for details.'} style={{ resize: 'vertical', fontFamily: 'inherit' }} />
                                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0 0' }}>Use {'{{1}}'}, {'{{2}}'} etc. for dynamic variables</p>
                            </div>

                            {/* Footer */}
                            <div style={{ marginBottom: 'var(--space-3)' }}>
                                <label className="form-label">Footer Text <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>(optional, max 60 chars)</span></label>
                                <input className="form-input" type="text" value={tplFooter} onChange={e => setTplFooter(e.target.value.slice(0, 60))} placeholder="e.g. Reply STOP to unsubscribe" />
                            </div>

                            {/* Call Button */}
                            <div style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-3)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', background: '#f9fafb' }}>
                                <label className="form-label" style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}><Icon name="phone" size={14} /> Call Button <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                                    <input className="form-input" type="text" value={tplCallText} onChange={e => setTplCallText(e.target.value.slice(0, 25))} placeholder="Button text (e.g. Call Now)" />
                                    <input className="form-input" type="tel" value={tplCallPhone} onChange={e => setTplCallPhone(e.target.value)} placeholder="Phone (e.g. +919876543210)" />
                                </div>
                            </div>

                            {/* Create Button */}
                            <button className="btn btn-primary" disabled={tplCreating || !tplName.trim() || !tplBody.trim()} onClick={handleCreateTemplate} style={{ width: '100%', padding: 'var(--space-3)', fontSize: 'var(--text-md)', background: '#6366f1', border: 'none', opacity: (!tplName.trim() || !tplBody.trim()) ? 0.5 : 1 }}>
                                {tplCreating ? <><Icon name="loader" size={14} style={{ marginRight: '4px' }} /> Creating Template...</> : <><Icon name="rocket" size={14} style={{ marginRight: '4px' }} /> Create Template</>}
                            </button>
                            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '8px 0 0', textAlign: 'center' }}>Template will be submitted to Meta for review & approval</p>
                        </div>

                        {/* Right: Live Preview */}
                        <div className="card" style={{ padding: 'var(--space-4)' }}>
                            <h3 style={{ marginTop: 0, marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: '6px' }}><Icon name="eye" size={16} /> Live Preview</h3>
                            <div style={{ background: '#e5ddd5', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', minHeight: '300px' }}>
                                <div style={{ maxWidth: '320px', marginLeft: 'auto', background: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                                    {/* Image Preview */}
                                    {tplImagePreview && <img src={tplImagePreview} alt="Header" style={{ width: '100%', height: '160px', objectFit: 'cover' }} />}
                                    {/* Body */}
                                    <div style={{ padding: '10px 12px' }}>
                                        <p style={{ fontSize: '14px', margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{tplBody || 'Your message body will appear here...'}</p>
                                        {/* Footer */}
                                        {tplFooter && <p style={{ fontSize: '12px', color: '#8696a0', margin: '8px 0 0', borderTop: '1px solid #f0f0f0', paddingTop: '6px' }}>{tplFooter}</p>}
                                        <span style={{ fontSize: '11px', color: '#8696a0', float: 'right', marginTop: '4px' }}>11:02</span>
                                    </div>
                                    {/* Call Button */}
                                    {tplCallText && (
                                        <div style={{ borderTop: '1px solid #e8e8e8', padding: '10px', textAlign: 'center' }}>
                                            <span style={{ color: '#00a5f4', fontSize: '14px', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Icon name="phone" size={14} /> {tplCallText}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            {/* Info */}
                            <div style={{ marginTop: 'var(--space-3)', padding: 'var(--space-3)', background: '#eff6ff', borderRadius: 'var(--radius-md)', fontSize: '12px', color: '#1e40af' }}>
                                <strong><Icon name="info" size={14} style={{ marginRight: '4px' }} /> How it works:</strong><br/>
                                1. Create template here → submitted to Meta<br/>
                                2. Meta reviews (usually within minutes)<br/>
                                3. Once approved, use the template name in broadcasts
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }
}

// Mini stat box component
function StatBox({ label, value, color }) {
    return (
        <div style={{
            background: `${color}10`, border: `1px solid ${color}30`, borderRadius: 'var(--radius-md)',
            padding: 'var(--space-3)', textAlign: 'center',
        }}>
            <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color }}>{value}</div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{label}</div>
        </div>
    );
}
