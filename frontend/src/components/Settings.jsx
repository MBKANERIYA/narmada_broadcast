import { useState, useEffect } from 'preact/hooks';
import { useStore } from '../stores/store';
import Icon from './Icons';

/**
 * Settings Component — Tenant admin settings page
 * Tabs: Firm Profile | WhatsApp | Subscription
 */
export default function Settings() {
    const {
        tenantSettings,
        fetchTenantSettings,
        updateTenantProfile, updateWhatsAppConfig, disconnectWhatsApp,
        showToast, tenant
    } = useStore();

    const [activeTab, setActiveTab] = useState('profile');
    const [saving, setSaving] = useState(false);

    // Profile form
    const [profileForm, setProfileForm] = useState({
        name: '', email: '', phone: '', logo_url: '', primary_color: '#25D366',
    });

    const [waForm, setWaForm] = useState({
        whatsapp_access_token: '',
        whatsapp_phone_number_id: '',
        whatsapp_business_account_id: '',
        whatsapp_catalog_id: '',
    });

    useEffect(() => {
        fetchTenantSettings();
    }, []);

    useEffect(() => {
        if (tenantSettings) {
            setProfileForm({
                name: tenantSettings.name || '',
                email: tenantSettings.email || '',
                phone: tenantSettings.phone || '',
                logo_url: tenantSettings.logo_url || '',
                primary_color: tenantSettings.primary_color || '#25D366',
            });
        }
    }, [tenantSettings]);

    const handleProfileSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await updateTenantProfile(profileForm);
            showToast('Firm profile updated!', 'success');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleWhatsAppSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await updateWhatsAppConfig(waForm);
            showToast('WhatsApp configured! Credentials verified with Meta.', 'success');
            setWaForm({ whatsapp_access_token: '', whatsapp_phone_number_id: '', whatsapp_business_account_id: '', whatsapp_catalog_id: '' });
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDisconnectWhatsApp = async () => {
        if (!confirm('Disconnect WhatsApp? You won\'t be able to send broadcasts until you reconnect.')) return;
        try {
            await disconnectWhatsApp();
            showToast('WhatsApp disconnected', 'info');
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    const tabs = [
        { id: 'profile', label: 'Firm Profile', icon: 'briefcase' },
        { id: 'whatsapp', label: 'WhatsApp', icon: 'whatsapp' },
        { id: 'subscription', label: 'Subscription', icon: 'settings' },
    ];

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Settings</h1>
                    <p className="page-subtitle">Manage your firm's profile, integrations, and subscription</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="tabs">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                    >
                        <Icon name={tab.icon} size={16} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* ── Profile Tab ── */}
            {activeTab === 'profile' && (
                <div className="card" style={{ maxWidth: '600px' }}>
                    <h2 style={{ marginBottom: '16px' }}>Firm Profile</h2>
                    <form onSubmit={handleProfileSave}>
                        <div className="form-group">
                            <label className="form-label">Firm Name *</label>
                            <input className="form-input" value={profileForm.name}
                                onInput={e => setProfileForm(p => ({ ...p, name: e.target.value }))} required />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Contact Email *</label>
                            <input type="email" className="form-input" value={profileForm.email}
                                onInput={e => setProfileForm(p => ({ ...p, email: e.target.value }))} required />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Phone</label>
                            <input className="form-input" value={profileForm.phone}
                                onInput={e => setProfileForm(p => ({ ...p, phone: e.target.value }))}
                                placeholder="+91 98765 43210" />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Logo URL</label>
                            <input className="form-input" value={profileForm.logo_url}
                                onInput={e => setProfileForm(p => ({ ...p, logo_url: e.target.value }))}
                                placeholder="https://example.com/logo.png" />
                            {profileForm.logo_url && (
                                <div style={{ marginTop: '8px' }}>
                                    <img src={profileForm.logo_url} alt="Logo preview"
                                        style={{ maxHeight: '60px', borderRadius: '8px' }} />
                                </div>
                            )}
                        </div>
                        <div className="form-group">
                            <label className="form-label">Brand Color</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input type="color" value={profileForm.primary_color}
                                    onInput={e => setProfileForm(p => ({ ...p, primary_color: e.target.value }))}
                                    style={{ width: '48px', height: '36px', border: 'none', cursor: 'pointer', borderRadius: '6px' }} />
                                <input className="form-input" value={profileForm.primary_color}
                                    onInput={e => setProfileForm(p => ({ ...p, primary_color: e.target.value }))}
                                    style={{ maxWidth: '120px' }} />
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Your Platform URL</label>
                            <div style={{
                                padding: '8px 12px', background: 'var(--bg-tertiary)',
                                borderRadius: '8px', fontSize: '13px',
                                fontFamily: 'monospace', color: 'var(--accent-primary)',
                            }}>
                                {tenantSettings?.slug || '...'}.yourdomain.com
                            </div>
                        </div>
                        <button type="submit" className="btn btn-primary" disabled={saving} style={{ marginTop: '8px' }}>
                            {saving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </form>
                </div>
            )}

            {/* ── WhatsApp Tab ── */}
            {activeTab === 'whatsapp' && (
                <div style={{ maxWidth: '600px' }}>
                    {/* Status */}
                    <div className="card" style={{ marginBottom: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                                <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '4px' }}>
                                    WhatsApp Integration
                                </h3>
                                <p style={{
                                    color: tenantSettings?.whatsapp_configured ? 'var(--accent-success)' : 'var(--text-muted)',
                                    fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', margin: 0,
                                }}>
                                    <span style={{
                                        width: '8px', height: '8px', borderRadius: '50%',
                                        background: tenantSettings?.whatsapp_configured ? 'var(--accent-success)' : 'var(--accent-danger)',
                                        display: 'inline-block',
                                    }} />
                                    {tenantSettings?.whatsapp_configured ? 'Connected' : 'Not Connected'}
                                </p>
                            </div>
                            {tenantSettings?.whatsapp_configured && (
                                <button className="btn btn-secondary" onClick={handleDisconnectWhatsApp}
                                    style={{ fontSize: '12px' }}>Disconnect</button>
                            )}
                        </div>

                        {tenantSettings?.whatsapp_configured && (
                            <div style={{
                                marginTop: '12px', padding: '12px',
                                background: 'var(--bg-tertiary)', borderRadius: '8px',
                                fontSize: '13px', color: 'var(--text-secondary)',
                                display: 'flex', flexDirection: 'column', gap: '4px',
                            }}>
                                <div><strong>Phone Number ID:</strong> {tenantSettings.whatsapp_phone_number_id}</div>
                                <div><strong>Business Account ID:</strong> {tenantSettings.whatsapp_business_account_id}</div>
                                {tenantSettings.whatsapp_catalog_id && <div><strong>Commerce Catalog ID:</strong> {tenantSettings.whatsapp_catalog_id}</div>}
                                <div><strong>Access Token:</strong> ••••••{tenantSettings.whatsapp_access_token?.slice(-6)}</div>
                            </div>
                        )}
                    </div>

                    {/* Config Form */}
                    <div className="card">
                        <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '4px' }}>
                            {tenantSettings?.whatsapp_configured ? 'Update Credentials' : 'Connect WhatsApp'}
                        </h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '16px' }}>
                            Get these from{' '}
                            <a href="https://developers.facebook.com" target="_blank" rel="noopener">
                                Meta Developer Portal
                            </a>{' '}
                            → Your App → WhatsApp → API Setup
                        </p>

                        <form onSubmit={handleWhatsAppSave}>
                            <div className="form-group">
                                <label className="form-label">Permanent Access Token *</label>
                                <input type="password" className="form-input"
                                    value={waForm.whatsapp_access_token}
                                    onInput={e => setWaForm(f => ({ ...f, whatsapp_access_token: e.target.value }))}
                                    placeholder="EAAxxxxx..." required />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Phone Number ID *</label>
                                <input className="form-input"
                                    value={waForm.whatsapp_phone_number_id}
                                    onInput={e => setWaForm(f => ({ ...f, whatsapp_phone_number_id: e.target.value }))}
                                    placeholder="123456789012345" required />
                            </div>
                            <div className="form-group">
                                <label className="form-label">WhatsApp Business Account ID *</label>
                                <input className="form-input"
                                    value={waForm.whatsapp_business_account_id}
                                    onInput={e => setWaForm(f => ({ ...f, whatsapp_business_account_id: e.target.value }))}
                                    placeholder="123456789012345" required />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Commerce Catalog ID (Optional for Products)</label>
                                <input className="form-input"
                                    value={waForm.whatsapp_catalog_id}
                                    onInput={e => setWaForm(f => ({ ...f, whatsapp_catalog_id: e.target.value }))}
                                    placeholder="e.g. 543210987654321" />
                            </div>

                            <div className="info-box" style={{ marginBottom: '16px' }}>
                                <strong>Note:</strong> We'll verify these credentials with Meta's API before saving. Make sure your token is a permanent (System User) token, not a temporary one.
                            </div>

                            <button type="submit" className="btn btn-primary" disabled={saving}>
                                {saving ? 'Verifying & Saving...' : 'Save & Verify'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Subscription Tab ── */}
            {activeTab === 'subscription' && (
                <div style={{ maxWidth: '600px' }}>
                    <div className="card">
                        <h2 style={{ marginBottom: '16px' }}>Current Plan</h2>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                            <div style={{
                                background: 'var(--accent-primary)', color: 'white',
                                padding: '6px 16px', borderRadius: '8px',
                                fontWeight: 700, textTransform: 'uppercase', fontSize: '14px',
                            }}>
                                {tenant?.subscription_plan || 'Trial'}
                            </div>
                            <span className="status-badge won" style={{ textTransform: 'uppercase' }}>
                                {tenant?.subscription_status || 'Active'}
                            </span>
                        </div>

                        <div style={{
                            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px',
                        }}>
                            <div style={{
                                background: 'var(--bg-tertiary)', padding: '12px',
                                borderRadius: '8px',
                            }}>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                                    Plan
                                </div>
                                <div style={{ fontSize: '18px', fontWeight: 700, textTransform: 'capitalize' }}>
                                    {tenant?.subscription_plan || 'Trial'}
                                </div>
                            </div>
                            <div style={{
                                background: 'var(--bg-tertiary)', padding: '12px',
                                borderRadius: '8px',
                            }}>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                                    Status
                                </div>
                                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent-success)', textTransform: 'capitalize' }}>
                                    {tenant?.subscription_status || 'Active'}
                                </div>
                            </div>
                        </div>

                        <div className="info-box">
                            <strong>Need to upgrade?</strong> Contact support to change your plan. All plans include unlimited contacts and broadcasts. Meta charges for message delivery separately.
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
