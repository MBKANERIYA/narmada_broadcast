import { useState } from 'preact/hooks';
import { useStore } from '../stores/store';

/**
 * Login Component
 * RELIABILITY: Form validation and error display
 */
export default function Login() {
    const { login, isLoading, error } = useStore();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        await login(email, password);
    };

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            width: '100vw',
            padding: 'var(--space-4)',
        }}>
            <div className="card" style={{ width: '100%', maxWidth: '400px' }}>
                <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 'var(--space-4)' }}>
                        <img src="/assets/M.png" alt="Mahalaxmi Logo" style={{ width: '160px', height: 'auto' }} />
                    </div>

                    <p style={{ color: 'var(--text-muted)' }}>Real Estate Lead Management</p>
                </div>

                {error && (
                    <div style={{
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid var(--accent-danger)',
                        borderRadius: 'var(--radius-md)',
                        padding: 'var(--space-3)',
                        marginBottom: 'var(--space-4)',
                        color: 'var(--accent-danger)',
                        fontSize: 'var(--text-sm)',
                    }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label">Email</label>
                        <input
                            type="email"
                            className="form-input"
                            value={email}
                            onInput={(e) => setEmail(e.target.value)}
                            placeholder="agent@mahalaxmi.com"
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Password</label>
                        <input
                            type="password"
                            className="form-input"
                            value={password}
                            onInput={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary"
                        style={{ width: '100%', marginTop: 'var(--space-4)' }}
                        disabled={isLoading}
                    >
                        {isLoading ? 'Signing in...' : 'Sign In'}
                    </button>
                </form>

                <p style={{
                    textAlign: 'center',
                    marginTop: 'var(--space-6)',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--text-muted)'
                }}>
                    First time? <a href="#" onClick={(e) => { e.preventDefault(); alert('Contact admin for account creation'); }}>Contact Admin</a>
                </p>
            </div>
        </div>
    );
}
