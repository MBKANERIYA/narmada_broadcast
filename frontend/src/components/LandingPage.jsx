import { useState } from 'preact/hooks';
import Icon from './Icons';
import '../styles/landing.css';

const CONTACT_EMAIL = 'support@innodify.in';

const FEATURE_LINKS = [
    'Broadcasts',
    'Chat Inbox',
    'Catalogue',
    'Orders',
    'Smart FAQs',
    'AI Assistant',
];

const USE_CASES = [
    {
        label: 'Broadcast',
        title: 'Send approved WhatsApp template campaigns to your customer lists',
        desc: 'Create templates, organize contacts, and run broadcast campaigns from the workspace.',
        details: ['Create templates', 'Send broadcasts', 'Track campaign delivery'],
        tone: 'mint',
    },
    {
        label: 'Inbox',
        title: 'Handle replies and follow-ups from a team inbox',
        desc: 'Commerce plan teams can manage customer conversations with labels, unread counts, media replies, and template sends.',
        details: ['Team inbox', 'Labels and unread state', 'Template replies'],
        tone: 'pink',
    },
    {
        label: 'Commerce',
        title: 'Connect products, orders, payments, and support context',
        desc: 'Commerce plan adds Catalogue, Orders, Smart FAQs, AI Assistant, and Razorpay order payment links.',
        details: ['Catalogue', 'Orders', 'Smart FAQs and AI Assistant'],
        tone: 'yellow',
    },
];

const AI_CARDS = [
    {
        title: 'Smart FAQs',
        desc: 'Answer repeated store questions from your knowledge base with confidence-aware matching.',
        stat: 'FAQ',
        accent: 'pink',
    },
    {
        title: 'AI Assistant',
        desc: 'Commerce plan includes smart replies, learning suggestions, product search, and order-status flows.',
        stat: 'AI',
        accent: 'blue',
    },
];

const INTEGRATIONS = ['Meta WhatsApp Cloud API', 'WhatsApp Templates', 'CSV Contacts', 'Razorpay', 'Catalogue', 'Webhooks'];

const PRICING = [
    {
        name: 'Broadcast',
        price: 'INR 399',
        period: 'per month',
        desc: 'For stores that only need WhatsApp templates and broadcast campaigns.',
        cta: 'Choose Broadcast',
        features: ['Create templates', 'Send broadcasts', 'Manage broadcast contact lists'],
    },
    {
        name: 'Commerce',
        price: 'INR 449',
        period: 'per month',
        desc: 'For stores that want the full WhatsApp commerce workspace.',
        cta: 'Choose Commerce',
        featured: true,
        features: ['Everything in Broadcast', 'Chat Inbox', 'Catalogue', 'Orders', 'Smart FAQs', 'AI Assistant', 'Razorpay order payment links'],
    },
];

const FAQS = [
    {
        q: 'Do tenants share one WhatsApp API?',
        a: 'No. Every tenant connects their own Meta WhatsApp Cloud API credentials in Settings.',
    },
    {
        q: 'Are Meta messaging charges included?',
        a: 'Meta messaging charges are billed separately by Meta. The platform subscription covers the software workspace.',
    },
    {
        q: 'What is included in the Broadcast plan?',
        a: 'Broadcast includes WhatsApp template creation, contact lists for broadcasts, and campaign sending. Inbox, Catalogue, Orders, Smart FAQs, and AI Assistant are in Commerce.',
    },
];

export default function LandingPage({ onNavigate }) {
    const [leadForm, setLeadForm] = useState({ name: '', email: '', phone: '', business: '' });
    const [leadStatus, setLeadStatus] = useState('');
    const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

    const updateLead = (field) => (e) => setLeadForm({ ...leadForm, [field]: e.target.value });

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
                return;
            }
            setLeadStatus('error');
        } catch {
            setLeadStatus('error');
        }
    };

    return (
        <div className="landing">
            <header className="landing-header" id="top">
                <div className="landing-utility-bar">
                    <div className="landing-container landing-utility-inner">
                        <div>
                            <a href={`mailto:${CONTACT_EMAIL}`}>Support</a>
                            <a href="#product">Product</a>
                            <a href="#pricing">Pricing</a>
                        </div>
                        <div>
                            <button type="button" onClick={() => onNavigate('login')}>Log in</button>
                            <span aria-hidden="true">WhatsApp-first stores</span>
                        </div>
                    </div>
                </div>

                <div className="landing-announcement">
                    <span>Plans now match the platform: Broadcast at INR 399 and Commerce at INR 449.</span>
                    <a href="#pricing">Compare plans</a>
                </div>

                <nav className="landing-nav" aria-label="Primary">
                    <div className="landing-container landing-nav-inner">
                        <a href="#top" className="landing-logo" aria-label="WhatsApp Broadcast home">
                            <span className="landing-logo-bubble" />
                            <span>WhatsApp Broadcast</span>
                        </a>

                        <div className="landing-nav-links">
                            <a href="#features">Features</a>
                            <a href="#product">Workflow</a>
                            <a href="#pricing">Pricing</a>
                            <a href="#faq">FAQ</a>
                        </div>

                        <div className="landing-nav-actions">
                            <a className="landing-btn landing-btn-outline" href="#contact">Contact sales</a>
                            <button className="landing-btn landing-btn-green" type="button" onClick={() => onNavigate('register')}>
                                Create account
                            </button>
                        </div>

                        <button className="landing-menu-btn" type="button" aria-label="Open menu">
                            <span />
                            <span />
                            <span />
                        </button>
                    </div>
                </nav>
            </header>

            <main>
                <section className="landing-hero">
                    <div className="landing-container">
                        <h1>
                            WhatsApp broadcasts and
                            <br />
                            <span className="landing-highlight">commerce tools</span> for your store
                        </h1>
                        <p>
                            Run template campaigns, manage customer replies, keep products and orders close to the chat,
                            and connect each tenant to its own Meta WhatsApp Cloud API credentials.
                        </p>

                        <div className="landing-social-proof">
                            <span>Tenant-owned Meta credentials</span>
                            <span>No shared WhatsApp secret</span>
                            <span>{CONTACT_EMAIL}</span>
                        </div>

                        <div className="landing-hero-actions">
                            <a className="landing-btn landing-btn-outline landing-btn-lg" href="#contact">Contact sales</a>
                            <button className="landing-btn landing-btn-green landing-btn-lg" type="button" onClick={() => onNavigate('register')}>
                                Create account
                            </button>
                        </div>

                        <div className="landing-usecase-tabs" aria-label="Product areas">
                            <a href="#broadcast">Broadcast</a>
                            <a href="#inbox">Inbox</a>
                            <a href="#commerce">Commerce</a>
                        </div>
                    </div>
                </section>

                <section className="landing-trusted">
                    <div className="landing-container">
                        <h2>Built for WhatsApp-first store operations</h2>
                        <div className="landing-trusted-logos" aria-label="Example customer types">
                            <span>Boutiques</span>
                            <span>Local stores</span>
                            <span>Catalogue sellers</span>
                            <span>D2C teams</span>
                            <span>Agencies</span>
                        </div>
                    </div>
                </section>

                <section className="landing-core" id="product">
                    <div className="landing-container landing-core-grid">
                        <div>
                            <span className="landing-eyebrow">Meta WhatsApp Cloud API</span>
                            <h2>Start with broadcasts. Add commerce when your team needs the full workspace.</h2>
                            <p>
                                The Broadcast plan is intentionally focused: templates and broadcast sending. Commerce adds the
                                operational tools for conversations, products, orders, Smart FAQs, AI Assistant, and payment links.
                            </p>
                        </div>

                        <div className="landing-chat-visual" aria-label="WhatsApp workspace preview">
                            <div className="landing-chat-orbit">
                                <span>Meta</span>
                                <span>CSV</span>
                                <span>Pay</span>
                                <span>FAQ</span>
                                <span>Catalog</span>
                            </div>
                            <div className="landing-phone-card">
                                <div className="landing-phone-header">
                                    <span />
                                    <strong>Store Inbox</strong>
                                </div>
                                <div className="landing-message incoming">Do you have this product in stock?</div>
                                <div className="landing-message outgoing">Yes. I can share the catalogue item and payment link.</div>
                                <div className="landing-phone-actions">
                                    <button type="button">Assign</button>
                                    <button type="button">Send template</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="landing-ai" id="features">
                    <div className="landing-container">
                        <div className="landing-section-heading">
                            <span className="landing-eyebrow">Commerce automation</span>
                            <h2>Smart support for the questions your store answers every day</h2>
                            <p>Commerce includes Smart FAQs and AI Assistant tools for repeated questions, product search, and order status flows.</p>
                        </div>

                        <div className="landing-ai-panel">
                            {AI_CARDS.map((card) => (
                                <article className={`landing-ai-card ${card.accent}`} key={card.title}>
                                    <div className="landing-ai-stat">{card.stat}</div>
                                    <h3>{card.title}</h3>
                                    <p>{card.desc}</p>
                                    <a href="#pricing">See Commerce</a>
                                </article>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="landing-usecases">
                    <div className="landing-container">
                        <div className="landing-section-heading">
                            <h2>A practical workspace for WhatsApp-led sales and support</h2>
                        </div>

                        {USE_CASES.map((useCase, index) => (
                            <article className={`landing-usecase-panel ${useCase.tone}`} id={useCase.label.toLowerCase()} key={useCase.label}>
                                <div>
                                    <span className="landing-eyebrow">WhatsApp for {useCase.label}</span>
                                    <h3>{useCase.title}</h3>
                                    <p>{useCase.desc}</p>
                                    <ul>
                                        {useCase.details.map((detail) => (
                                            <li key={detail}><Icon name="check-circle" size={18} /> {detail}</li>
                                        ))}
                                    </ul>
                                </div>
                                <div className="landing-usecase-visual">
                                    <div className="landing-flow-card">
                                        <span>{index === 0 ? 'Campaign' : index === 1 ? 'Reply' : 'Order'}</span>
                                        <strong>{useCase.label} workflow</strong>
                                        <p>{index === 0 ? 'Approved template campaign sent to selected contacts.' : index === 1 ? 'Shopper reply managed in the shared inbox.' : 'Catalogue item and payment link kept with order context.'}</p>
                                    </div>
                                    <div className="landing-metric-row">
                                        {useCase.details.map((detail) => <strong key={detail}>{detail}</strong>)}
                                    </div>
                                </div>
                            </article>
                        ))}
                    </div>
                </section>

                <section className="landing-integrations">
                    <div className="landing-container landing-integrations-grid">
                        <div>
                            <span className="landing-eyebrow">Connected stack</span>
                            <h2>Use the integrations the platform actually supports.</h2>
                            <p>
                                Connect tenant-owned WhatsApp credentials, upload broadcast contacts, manage catalogue data,
                                and use Razorpay payment links for customer orders on Commerce.
                            </p>
                        </div>
                        <div className="landing-integrations-cloud">
                            {INTEGRATIONS.map((item) => <span key={item}>{item}</span>)}
                        </div>
                    </div>
                </section>

                <section className="landing-infra">
                    <div className="landing-container">
                        <h2>Simple plan packaging for real store workflows</h2>
                        <div className="landing-infra-grid">
                            <div><strong>399</strong><span>INR Broadcast plan</span></div>
                            <div><strong>449</strong><span>INR Commerce plan</span></div>
                            <div><strong>0</strong><span>shared WhatsApp secrets</span></div>
                            <div><strong>2</strong><span>clear monthly plans</span></div>
                        </div>
                    </div>
                </section>

                <section className="landing-pricing" id="pricing">
                    <div className="landing-container">
                        <div className="landing-section-heading">
                            <span className="landing-eyebrow">Pricing</span>
                            <h2>Choose the workspace your store needs right now</h2>
                            <p>Meta messaging charges are billed separately by Meta. Platform pricing covers the SaaS workspace.</p>
                        </div>

                        <div className="landing-pricing-grid">
                            {PRICING.map((plan) => (
                                <article className={`landing-price-card ${plan.featured ? 'featured' : ''}`} key={plan.name}>
                                    <h3>{plan.name}</h3>
                                    <div className="landing-price">
                                        <strong>{plan.price}</strong>
                                        <span>{plan.period}</span>
                                    </div>
                                    <p>{plan.desc}</p>
                                    <button className="landing-btn landing-btn-green" type="button" onClick={() => onNavigate('register')}>{plan.cta}</button>
                                    <ul>
                                        {plan.features.map((feature) => (
                                            <li key={feature}><Icon name="check" size={16} /> {feature}</li>
                                        ))}
                                    </ul>
                                </article>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="landing-contact" id="contact">
                    <div className="landing-container landing-contact-grid">
                        <div>
                            <span className="landing-eyebrow">Contact</span>
                            <h2>Need help setting this up for your store?</h2>
                            <p>Tell us what you sell and how you use WhatsApp today. You can also write directly to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
                        </div>

                        <div className="landing-form-card">
                            {leadStatus === 'sent' ? (
                                <div className="landing-form-success">
                                    <Icon name="check-circle" size={44} />
                                    <h3>We got it.</h3>
                                    <p>We will get back to you soon.</p>
                                </div>
                            ) : (
                                <form onSubmit={handleLeadSubmit}>
                                    <label>Name<input type="text" value={leadForm.name} onInput={updateLead('name')} required /></label>
                                    <label>Email<input type="email" value={leadForm.email} onInput={updateLead('email')} required /></label>
                                    <label>WhatsApp number<input type="tel" value={leadForm.phone} onInput={updateLead('phone')} /></label>
                                    <label>Business name<input type="text" value={leadForm.business} onInput={updateLead('business')} /></label>
                                    <button className="landing-btn landing-btn-green" type="submit" disabled={leadStatus === 'sending'}>
                                        {leadStatus === 'sending' ? 'Sending...' : 'Send request'}
                                    </button>
                                    {leadStatus === 'error' && <p className="landing-form-error">Could not send. Email {CONTACT_EMAIL}.</p>}
                                </form>
                            )}
                        </div>
                    </div>
                </section>

                <section className="landing-faq" id="faq">
                    <div className="landing-container landing-faq-grid">
                        <div>
                            <span className="landing-eyebrow">FAQ</span>
                            <h2>Clear answers before you start.</h2>
                        </div>
                        <div>
                            {FAQS.map((item) => (
                                <article className="landing-faq-item" key={item.q}>
                                    <h3>{item.q}</h3>
                                    <p>{item.a}</p>
                                </article>
                            ))}
                        </div>
                    </div>
                </section>
            </main>

            <footer className="landing-dark-footer">
                <div className="landing-container landing-footer-grid">
                    <div>
                        <a href="#top" className="landing-logo landing-logo-inverted">
                            <span className="landing-logo-bubble" />
                            <span>WhatsApp Broadcast</span>
                        </a>
                        <p>WhatsApp broadcast and commerce software for store owners.</p>
                        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
                    </div>
                    <div>
                        <h3>Product</h3>
                        {FEATURE_LINKS.map((item) => <a href="#features" key={item}>{item}</a>)}
                    </div>
                    <div>
                        <h3>Plans</h3>
                        <a href="#pricing">Broadcast at INR 399</a>
                        <a href="#pricing">Commerce at INR 449</a>
                        <a href="#faq">FAQ</a>
                    </div>
                    <div>
                        <h3>Platform</h3>
                        <button type="button" onClick={() => onNavigate('login')}>Log in</button>
                        <button type="button" onClick={() => onNavigate('register')}>Create account</button>
                    </div>
                </div>
            </footer>
        </div>
    );
}
