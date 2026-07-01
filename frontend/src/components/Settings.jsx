import { useState, useEffect } from 'preact/hooks';
import { useStore } from '../stores/store';
import Icon from './Icons';

/**
 * Settings Component — Tenant admin settings page
 * Tabs: Firm Profile | WhatsApp | Chatbot & Hours
 */
export default function Settings() {
    const {
        tenantSettings,
        fetchTenantSettings,
        updateTenantProfile, updateWhatsAppConfig, disconnectWhatsApp,
        updateChatbotSettings,
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

    // Chatbot settings form
    const [botForm, setBotForm] = useState({
        enabled: true,
        after_hours_action: 'respond_normally',
        away_message: '',
        razorpay_key_id: '',
        razorpay_key_secret: '',
        razorpay_webhook_secret: '',
        address_prompt_template: '',
        payment_link_template: '',
        payment_success_template: '',
        store_hours: {
            enabled: false,
            timezone: 'Asia/Kolkata',
            start: '09:00',
            end: '18:00',
            days: [1, 2, 3, 4, 5],
        }
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

            let parsedBotSettings = {};
            if (tenantSettings.bot_settings) {
                try {
                    parsedBotSettings = typeof tenantSettings.bot_settings === 'string'
                        ? JSON.parse(tenantSettings.bot_settings)
                        : tenantSettings.bot_settings;
                } catch (e) {
                    console.error('Error parsing bot_settings:', e);
                }
            }

            setBotForm({
                enabled: parsedBotSettings.enabled !== false,
                after_hours_action: parsedBotSettings.after_hours_action || 'respond_normally',
                away_message: parsedBotSettings.away_message || '',
                razorpay_key_id: parsedBotSettings.razorpay_key_id || '',
                razorpay_key_secret: parsedBotSettings.razorpay_key_secret || '',
                razorpay_webhook_secret: parsedBotSettings.razorpay_webhook_secret || '',
                address_prompt_template: parsedBotSettings.address_prompt_template || 'Great! Your total is ₹{total}.\n\nPlease reply with your full delivery address to proceed.',
                payment_link_template: parsedBotSettings.payment_link_template || 'Thanks for the address!\n\nPlease complete your payment of {currency} {total} here:\n{link}',
                payment_success_template: parsedBotSettings.payment_success_template || '🎉 Payment Received!\n\nThank you for your payment of {currency} {total}. Your order #{order_id} is now confirmed and being processed.',
                store_hours: {
                    enabled: parsedBotSettings.store_hours?.enabled || false,
                    timezone: parsedBotSettings.store_hours?.timezone || 'Asia/Kolkata',
                    start: parsedBotSettings.store_hours?.start || '09:00',
                    end: parsedBotSettings.store_hours?.end || '18:00',
                    days: Array.isArray(parsedBotSettings.store_hours?.days)
                        ? parsedBotSettings.store_hours.days
                        : [1, 2, 3, 4, 5],
                }
            });
        }
    }, [tenantSettings]);

    const handleDayToggle = (dayNum) => {
        setBotForm(prev => {
            const currentDays = prev.store_hours.days || [];
            let newDays;
            if (currentDays.includes(dayNum)) {
                newDays = currentDays.filter(d => d !== dayNum);
            } else {
                newDays = [...currentDays, dayNum].sort();
            }
            return {
                ...prev,
                store_hours: {
                    ...prev.store_hours,
                    days: newDays
                }
            };
        });
    };

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

    const handleChatbotSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await updateChatbotSettings(botForm);
            showToast('Chatbot settings updated!', 'success');
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
        { id: 'chatbot', label: 'Chatbot & Hours', icon: 'message-circle' },
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

            {/* ── Chatbot & Hours Tab ── */}
            {activeTab === 'chatbot' && (
                <div className="card" style={{ maxWidth: '600px' }}>
                    <h2 style={{ marginBottom: '16px' }}>Chatbot & Business Hours</h2>
                    <form onSubmit={handleChatbotSave}>
                        {/* Enabled Toggle */}
                        <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                            <input
                                type="checkbox"
                                id="bot-enabled"
                                checked={botForm.enabled}
                                onChange={e => setBotForm(f => ({ ...f, enabled: e.target.checked }))}
                                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                            />
                            <label htmlFor="bot-enabled" className="form-label" style={{ margin: 0, cursor: 'pointer', fontSize: '14px', fontWeight: 600 }}>
                                Enable Smart Auto-Responder Bot
                            </label>
                        </div>

                        {/* Store Hours section */}
                        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px', marginTop: '20px' }}>
                            <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>Business Hours & Timezone</h3>
                            
                            <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                                <input
                                    type="checkbox"
                                    id="hours-enabled"
                                    checked={botForm.store_hours.enabled}
                                    onChange={e => setBotForm(f => ({
                                        ...f,
                                        store_hours: { ...f.store_hours, enabled: e.target.checked }
                                    }))}
                                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                />
                                <label htmlFor="hours-enabled" className="form-label" style={{ margin: 0, cursor: 'pointer', fontWeight: 600 }}>
                                    Restrict chatbot during store hours
                                </label>
                            </div>

                            {botForm.store_hours.enabled && (
                                <div style={{ background: 'var(--bg-tertiary)', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
                                    {/* Timezone Select */}
                                    <div className="form-group">
                                        <label className="form-label">Timezone</label>
                                        <select
                                            className="form-select"
                                            value={botForm.store_hours.timezone}
                                            onChange={e => setBotForm(f => ({
                                                ...f,
                                                store_hours: { ...f.store_hours, timezone: e.target.value }
                                            }))}
                                        >
                                            <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                                            <option value="UTC">UTC / GMT</option>
                                            <option value="America/New_York">America/New_York (EST/EDT)</option>
                                            <option value="Europe/London">Europe/London (GMT/BST)</option>
                                            <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                                            <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
                                            <option value="Australia/Sydney">Australia/Sydney (AEST/AEDT)</option>
                                        </select>
                                    </div>

                                    {/* Start & End Times */}
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label className="form-label">Opening Time</label>
                                            <input
                                                type="time"
                                                className="form-input"
                                                value={botForm.store_hours.start}
                                                onChange={e => setBotForm(f => ({
                                                    ...f,
                                                    store_hours: { ...f.store_hours, start: e.target.value }
                                                }))}
                                                required
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Closing Time</label>
                                            <input
                                                type="time"
                                                className="form-input"
                                                value={botForm.store_hours.end}
                                                onChange={e => setBotForm(f => ({
                                                    ...f,
                                                    store_hours: { ...f.store_hours, end: e.target.value }
                                                }))}
                                                required
                                            />
                                        </div>
                                    </div>

                                    {/* Weekdays Checkboxes */}
                                    <div className="form-group" style={{ marginTop: '12px' }}>
                                        <label className="form-label" style={{ marginBottom: '8px' }}>Open Weekdays</label>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 16px' }}>
                                            {[
                                                { label: 'Sun', value: 0 },
                                                { label: 'Mon', value: 1 },
                                                { label: 'Tue', value: 2 },
                                                { label: 'Wed', value: 3 },
                                                { label: 'Thu', value: 4 },
                                                { label: 'Fri', value: 5 },
                                                { label: 'Sat', value: 6 }
                                            ].map(day => (
                                                <label key={day.value} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={botForm.store_hours.days.includes(day.value)}
                                                        onChange={() => handleDayToggle(day.value)}
                                                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                                    />
                                                    {day.label}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* After Hours Action & Away Message */}
                        {botForm.store_hours.enabled && (
                            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px', marginTop: '20px' }}>
                                <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>After-Hours Action</h3>

                                <div className="form-group">
                                    <label className="form-label">When messaging after store hours</label>
                                    <select
                                        className="form-select"
                                        value={botForm.after_hours_action}
                                        onChange={e => setBotForm(f => ({ ...f, after_hours_action: e.target.value }))}
                                    >
                                        <option value="respond_normally">Respond Normally (Use AI chatbot)</option>
                                        <option value="send_away_message">Send Away Message (Instant auto-reply)</option>
                                        <option value="remain_silent">Remain Silent (Do not auto-reply)</option>
                                    </select>
                                </div>

                                {botForm.after_hours_action === 'send_away_message' && (
                                    <div className="form-group">
                                        <label className="form-label">Away Message</label>
                                        <textarea
                                            className="form-textarea"
                                            rows={4}
                                            value={botForm.away_message}
                                            onChange={e => setBotForm(f => ({ ...f, away_message: e.target.value }))}
                                            placeholder="We are currently closed. Our team will get back to you when we are back online. Thank you!"
                                            required
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Razorpay Integration Settings */}
                        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px', marginTop: '20px' }}>
                            <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>Razorpay Integration</h3>
                            <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '12px' }}>
                                Add your Razorpay API keys to automatically generate dynamic payment links for customer orders and collect delivery addresses.
                            </p>
                            <div className="form-group">
                                <label className="form-label">Razorpay Key ID</label>
                                <input
                                    className="form-input"
                                    type="text"
                                    value={botForm.razorpay_key_id}
                                    onInput={e => setBotForm(f => ({ ...f, razorpay_key_id: e.target.value }))}
                                    placeholder="rzp_live_XXXXX..."
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Razorpay Key Secret</label>
                                <input
                                    className="form-input"
                                    type="password"
                                    value={botForm.razorpay_key_secret}
                                    onInput={e => setBotForm(f => ({ ...f, razorpay_key_secret: e.target.value }))}
                                    placeholder="Enter your Key Secret"
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Webhook Secret (Optional)</label>
                                <input
                                    className="form-input"
                                    type="password"
                                    value={botForm.razorpay_webhook_secret}
                                    onInput={e => setBotForm(f => ({ ...f, razorpay_webhook_secret: e.target.value }))}
                                    placeholder="Secret for verifying webhooks"
                                />
                            </div>
                        </div>

                        {/* Automated Order Messages Settings */}
                        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px', marginTop: '20px' }}>
                            <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>Automated Order Messages</h3>
                            <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '16px' }}>
                                Customize the messages sent automatically during the checkout flow. You can use dynamic variables like <code>{`{total}`}</code>, <code>{`{currency}`}</code>, <code>{`{link}`}</code>, and <code>{`{order_id}`}</code>.
                            </p>
                            
                            <div className="form-group">
                                <label className="form-label">Address Collection Prompt</label>
                                <textarea
                                    className="form-textarea"
                                    rows={3}
                                    value={botForm.address_prompt_template}
                                    onInput={e => setBotForm(f => ({ ...f, address_prompt_template: e.target.value }))}
                                    placeholder="Great! Your total is ₹{total}. Please reply with your full delivery address to proceed."
                                    required
                                />
                            </div>
                            
                            <div className="form-group">
                                <label className="form-label">Payment Link Message</label>
                                <textarea
                                    className="form-textarea"
                                    rows={3}
                                    value={botForm.payment_link_template}
                                    onInput={e => setBotForm(f => ({ ...f, payment_link_template: e.target.value }))}
                                    placeholder="Thanks for the address! Please complete your payment of {currency} {total} here: {link}"
                                    required
                                />
                            </div>
                            
                            <div className="form-group">
                                <label className="form-label">Payment Success Confirmation</label>
                                <textarea
                                    className="form-textarea"
                                    rows={3}
                                    value={botForm.payment_success_template}
                                    onInput={e => setBotForm(f => ({ ...f, payment_success_template: e.target.value }))}
                                    placeholder="🎉 Payment Received! Thank you for your payment of {currency} {total}. Your order #{order_id} is now confirmed and being processed."
                                    required
                                />
                            </div>
                        </div>

                        <button type="submit" className="btn btn-primary" disabled={saving} style={{ marginTop: '20px', width: '100%' }}>
                            {saving ? 'Saving Settings...' : 'Save Settings'}
                        </button>
                    </form>
                </div>
            )}
        </div>
    );
}
