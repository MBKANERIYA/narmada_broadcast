import { useState } from 'preact/hooks';
import { useStore } from '../stores/store';

/**
 * Auth Component — Login / Register with tab toggle
 * Register = self-service tenant signup (like AiSensy/Wati)
 */
export default function AuthPage({ initialMode = 'login', onBack }) {
    const { login, register, isLoading, error, clearError } = useStore();
    const [mode, setMode] = useState(initialMode);
    const [form, setForm] = useState({ name: '', firmName: '', email: '', password: '' });

    const switchMode = (m) => {
        setMode(m);
        clearError?.();
        setForm({ name: '', firmName: '', email: '', password: '' });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (mode === 'login') {
            await login(form.email, form.password);
        } else {
            await register(form.name, form.firmName, form.email, form.password);
        }
    };

    const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

    return (
        <div className="auth-page">
            <section className="auth-panel" aria-label={mode === 'login' ? 'Sign in' : 'Create account'}>
                {onBack && (
                    <button type="button" onClick={onBack} className="auth-back">
                        Back
                    </button>
                )}

                <div className="auth-brand">
                    <div className="auth-brand-mark">W</div>
                    <div>
                        <h1>{mode === 'login' ? 'Welcome Back' : 'Create Account'}</h1>
                        <p>
                            {mode === 'login'
                                ? 'Sign in to manage your WhatsApp store workflows.'
                                : 'Set up your business workspace and start broadcasting.'}
                        </p>
                    </div>
                </div>

                <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
                    {['login', 'register'].map(m => (
                        <button
                            key={m}
                            type="button"
                            role="tab"
                            aria-selected={mode === m}
                            className={mode === m ? 'is-active' : ''}
                            onClick={() => switchMode(m)}
                        >
                            {m === 'login' ? 'Sign In' : 'Sign Up'}
                        </button>
                    ))}
                </div>

                {error && <div className="auth-error">{error}</div>}

                <form onSubmit={handleSubmit} className="auth-form">
                    {mode === 'register' && (
                        <>
                            <label>
                                <span>Your Name</span>
                                <input type="text" value={form.name} onInput={update('name')} placeholder="John Doe" required />
                            </label>
                            <label>
                                <span>Business Name</span>
                                <input type="text" value={form.firmName} onInput={update('firmName')} placeholder="My Business" required />
                            </label>
                        </>
                    )}

                    <label>
                        <span>Email</span>
                        <input type="email" value={form.email} onInput={update('email')} placeholder="you@business.com" required />
                    </label>

                    <label>
                        <span>Password</span>
                        <input type="password" value={form.password} onInput={update('password')} placeholder="Enter password" required minLength={6} />
                    </label>

                    <button type="submit" className="auth-submit" disabled={isLoading}>
                        {isLoading
                            ? (mode === 'login' ? 'Signing in...' : 'Creating account...')
                            : (mode === 'login' ? 'Sign In' : 'Create Account')}
                    </button>
                </form>

                <p className="auth-switch">
                    {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
                    <a href="#" onClick={(e) => { e.preventDefault(); switchMode(mode === 'login' ? 'register' : 'login'); }}>
                        {mode === 'login' ? 'Sign up free' : 'Sign in'}
                    </a>
                </p>
            </section>
        </div>
    );
}
