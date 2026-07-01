import { useState, useEffect } from 'preact/hooks';
import Icon from './Icons';
import '../styles/landing.css';

const FEATURES = [
    {
        icon: 'send',
        title: 'Bulk Broadcasts',
        desc: 'Send approved template messages to thousands of contacts instantly with smart tag and location filters.',
    },
    {
        icon: 'chat',
        title: 'Two-Way Chat Inbox',
        desc: 'Respond to customer messages in a unified inbox with 24-hour window awareness and template fallback.',
    },
    {
        icon: 'users',
        title: 'Smart Contact Manager',
        desc: 'Import via CSV, segment by tags, location, and budget — then target the right audience every time.',
    },
    {
        icon: 'bar-chart',
        title: 'Delivery Analytics',
        desc: 'Track sent, delivered, read, and failed counts for every campaign in real time.',
    },
    {
        icon: 'lock',
        title: 'Your API, Your Data',
        desc: 'Use your own Meta credentials. We never access your messages — complete data sovereignty.',
    },
    {
        icon: 'rocket',
        title: '2-Minute Setup',
        desc: 'Sign up, paste your WhatsApp Business API keys, import contacts, and start broadcasting.',
    },
];

const STEPS = [
    { num: '01', title: 'Create Account', desc: 'Sign up in 30 seconds — no credit card needed' },
    { num: '02', title: 'Connect WhatsApp', desc: 'Paste your Meta Business API credentials' },
    { num: '03', title: 'Import Contacts', desc: 'Upload CSV or add contacts manually with tags' },
    { num: '04', title: 'Go Live', desc: 'Send your first broadcast campaign today' },
];

const STATS = [
    { value: '10K+', label: 'Messages Sent' },
    { value: '500+', label: 'Active Businesses' },
    { value: '99.9%', label: 'Delivery Rate' },
];

export default function LandingPage({ onNavigate }) {
    const [scrolled, setScrolled] = useState(false);
    const [leadForm, setLeadForm] = useState({ name: '', email: '', phone: '', business: '' });
    const [leadStatus, setLeadStatus] = useState(''); // '' | 'sending' | 'sent' | 'error'

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener('scroll', onScroll);
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

    const handleLeadSubmit = async (e) => {
        e.preventDefault();
        setLeadStatus('sending');
        try {
            const res = await fetch(`${API_BASE}/api/v1/leads`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(leadForm),
            });
            const data = await res.json();
            if (data.success) {
                setLeadStatus('sent');
                setLeadForm({ name: '', email: '', phone: '', business: '' });
            } else {
                setLeadStatus('error');
            }
        } catch {
            setLeadStatus('error');
        }
    };

    const updateLead = (field) => (e) => setLeadForm({ ...leadForm, [field]: e.target.value });

    return (
        <div className="landing">
            {/* Background effects */}
            <div className="landing-bg-orbs" />
            <div className="landing-grid-overlay" />

            {/* ── Navbar ── */}
            <nav className={`landing-nav ${scrolled ? 'scrolled' : ''}`}>
                <div className="landing-nav-inner">
                    <div className="landing-logo">
                        <div className="landing-logo-icon">W</div>
                        <span className="landing-logo-text">WhatsApp Broadcast</span>
                    </div>
                    <div className="landing-nav-actions">
                        <button className="landing-btn landing-btn-ghost"
                            onClick={() => onNavigate('login')}>
                            Sign In
                        </button>
                        <button className="landing-btn landing-btn-primary"
                            onClick={() => onNavigate('register')}>
                            Get Started Free
                        </button>
                    </div>
                </div>
            </nav>

            {/* ── Hero ── */}
            <section className="landing-hero">
                <div className="landing-badge">
                    <span className="landing-badge-dot" />
                    Powered by Meta Cloud API v21.0
                </div>

                <h1>
                    WhatsApp Marketing{' '}
                    <span className="landing-hero-gradient">Made Effortless</span>
                </h1>

                <p>
                    Broadcast to thousands, chat with every customer, track every delivery — 
                    all from one beautiful dashboard. Connect your own Meta API.
                </p>

                <div className="landing-hero-actions">
                    <button className="landing-btn landing-btn-primary landing-btn-lg"
                        onClick={() => onNavigate('register')}>
                        Start Free — No Card Required
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                            <path d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                    </button>
                    <button className="landing-btn landing-btn-outline landing-btn-lg"
                        onClick={() => onNavigate('login')}>
                        Sign In
                    </button>
                </div>
            </section>

            {/* ── Stats ── */}
            <section className="landing-stats">
                <div className="landing-stats-inner">
                    {STATS.map((s, i) => (
                        <div className="landing-stat" key={i}>
                            <div className="landing-stat-value">{s.value}</div>
                            <div className="landing-stat-label">{s.label}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ── Features ── */}
            <section className="landing-section">
                <div className="landing-container">
                    <div className="landing-section-header">
                        <div className="landing-section-tag">Features</div>
                        <h2 className="landing-section-title">
                            Everything you need to grow with WhatsApp
                        </h2>
                        <p className="landing-section-subtitle">
                            From broadcasting to chatting — a complete toolkit
                            built for speed, simplicity, and scale.
                        </p>
                    </div>

                    <div className="landing-features-grid">
                        {FEATURES.map((f, i) => (
                            <div className="landing-feature-card" key={i}>
                                <div className="landing-feature-icon">
                                    <Icon name={f.icon} size={24} />
                                </div>
                                <div className="landing-feature-title">{f.title}</div>
                                <div className="landing-feature-desc">{f.desc}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── How it works ── */}
            <section className="landing-section">
                <div className="landing-container">
                    <div className="landing-section-header">
                        <div className="landing-section-tag">How it works</div>
                        <h2 className="landing-section-title">
                            Live in 4 simple steps
                        </h2>
                        <p className="landing-section-subtitle">
                            No complex setup. No developer needed. Just plug in and go.
                        </p>
                    </div>

                    <div className="landing-steps">
                        {STEPS.map((s, i) => (
                            <div className="landing-step" key={i}>
                                <div className="landing-step-num">{s.num}</div>
                                <div className="landing-step-title">{s.title}</div>
                                <div className="landing-step-desc">{s.desc}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Signup Form ── */}
            <section className="landing-section" id="signup">
                <div className="landing-container">
                    <div className="landing-form-wrapper">
                        <div className="landing-form-info">
                            <div className="landing-section-tag">Get Started</div>
                            <h2 className="landing-section-title" style={{ textAlign: 'left' }}>
                                Ready to scale your WhatsApp marketing?
                            </h2>
                            <p className="landing-section-subtitle" style={{ textAlign: 'left', margin: '0 0 24px' }}>
                                Fill in your details and our team will set you up within 24 hours. All platform features included.
                            </p>
                            <div className="landing-form-perks">
                                {['No credit card required', 'All features unlocked', 'Use your own Meta API', 'Dedicated onboarding support'].map((perk, i) => (
                                    <div className="landing-form-perk" key={i}>
                                        <Icon name="check" size={16} />
                                        <span>{perk}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="landing-form-card">
                            {leadStatus === 'sent' ? (
                                <div className="landing-form-success">
                                    <div className="landing-form-success-icon">
                                        <Icon name="check-circle" size={48} />
                                    </div>
                                    <h3>Thank you!</h3>
                                    <p>We'll get back to you within 24 hours.</p>
                                </div>
                            ) : (
                                <form onSubmit={handleLeadSubmit}>
                                    <h3 className="landing-form-title">Sign up for early access</h3>
                                    <div className="landing-form-group">
                                        <label>Your Name *</label>
                                        <input type="text" value={leadForm.name} onInput={updateLead('name')}
                                            placeholder="John Doe" required className="landing-form-input" />
                                    </div>
                                    <div className="landing-form-group">
                                        <label>Email Address *</label>
                                        <input type="email" value={leadForm.email} onInput={updateLead('email')}
                                            placeholder="you@business.com" required className="landing-form-input" />
                                    </div>
                                    <div className="landing-form-group">
                                        <label>Phone Number</label>
                                        <input type="tel" value={leadForm.phone} onInput={updateLead('phone')}
                                            placeholder="+91 9876543210" className="landing-form-input" />
                                    </div>
                                    <div className="landing-form-group">
                                        <label>Business Name</label>
                                        <input type="text" value={leadForm.business} onInput={updateLead('business')}
                                            placeholder="My Awesome Business" className="landing-form-input" />
                                    </div>
                                    <button type="submit" className="landing-btn landing-btn-primary"
                                        disabled={leadStatus === 'sending'}
                                        style={{ width: '100%', padding: '14px', fontSize: '15px', marginTop: '8px' }}>
                                        {leadStatus === 'sending' ? 'Submitting...' : 'Get Started Free →'}
                                    </button>
                                    {leadStatus === 'error' && (
                                        <p style={{ color: '#f87171', fontSize: '13px', marginTop: '12px', textAlign: 'center' }}>
                                            Something went wrong. Please try again.
                                        </p>
                                    )}
                                </form>
                            )}
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Footer ── */}
            <footer className="landing-footer">
                <p className="landing-footer-text">
                    © {new Date().getFullYear()} WhatsApp Broadcast Platform · 
                    <a href="https://broadcast.innodify.in" className="landing-footer-link"> broadcast.innodify.in</a>
                </p>
            </footer>
        </div>
    );
}

