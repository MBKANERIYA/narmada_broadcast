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

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener('scroll', onScroll);
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

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

            {/* ── CTA ── */}
            <section className="landing-cta">
                <div className="landing-cta-card">
                    <h2 className="landing-cta-title">
                        Ready to scale your WhatsApp marketing?
                    </h2>
                    <p className="landing-cta-desc">
                        Free 14-day trial. No credit card. Your own Meta API credentials.
                    </p>
                    <button className="landing-btn landing-btn-primary landing-btn-lg"
                        onClick={() => onNavigate('register')}
                        style={{ position: 'relative' }}>
                        Create Your Free Account
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                            <path d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                    </button>
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
