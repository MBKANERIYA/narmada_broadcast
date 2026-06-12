import { useState, useEffect } from 'preact/hooks';
import { useStore } from '../stores/store';
import Icon from './Icons';

export default function KnowledgeBase() {
    const { tenant } = useStore();
    const [faqs, setFaqs] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    
    // Form state
    const [question, setQuestion] = useState('');
    const [answer, setAnswer] = useState('');
    const [error, setError] = useState(null);

    const fetchFaqs = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/v1/knowledge-base', {
                headers: { 
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'x-tenant-slug': localStorage.getItem('tenant_slug') || 'default'
                }
            });
            if (res.ok) {
                const data = await res.json();
                setFaqs(data.faqs || []);
            }
        } catch (err) {
            console.error('Failed to fetch FAQs:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchFaqs();
    }, []);

    const handleAdd = async (e) => {
        e.preventDefault();
        if (!question.trim() || !answer.trim()) return;
        
        setIsSaving(true);
        setError(null);
        try {
            const res = await fetch('/api/v1/knowledge-base', {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'x-tenant-slug': localStorage.getItem('tenant_slug') || 'default',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ question, answer })
            });
            const data = await res.json();
            
            if (res.ok) {
                setQuestion('');
                setAnswer('');
                fetchFaqs(); // refresh
                
                // Show success toast
                const evt = new CustomEvent('toast', { detail: { type: 'success', message: 'Smart FAQ added successfully!' }});
                window.dispatchEvent(evt);
            } else {
                setError(data.error || 'Failed to add FAQ');
            }
        } catch (err) {
            setError('Network error adding FAQ');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('Are you sure you want to delete this FAQ?')) return;
        
        try {
            const res = await fetch(`/api/v1/knowledge-base/${id}`, {
                method: 'DELETE',
                headers: { 
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'x-tenant-slug': localStorage.getItem('tenant_slug') || 'default'
                }
            });
            if (res.ok) {
                setFaqs(faqs.filter(f => f.id !== id));
            }
        } catch (err) {
            console.error('Failed to delete', err);
        }
    };

    return (
        <div className="view-container">
            <div className="view-header">
                <div>
                    <h1 className="view-title">Smart Knowledge Base</h1>
                    <p className="view-subtitle">Add frequently asked questions. The AI Semantic Engine will automatically match customer questions to these answers.</p>
                </div>
            </div>

            <div className="view-content" style={{ display: 'flex', gap: '24px', flexDirection: 'column' }}>
                
                {/* Add Form */}
                <div className="card" style={{ padding: '24px' }}>
                    <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Add New FAQ</h2>
                    
                    {error && (
                        <div style={{ padding: '12px', background: '#FEE2E2', color: '#B91C1C', borderRadius: '8px', fontSize: '14px', marginBottom: '16px' }}>
                            {error}
                        </div>
                    )}
                    
                    <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div>
                            <label className="form-label">Question (or Topic)</label>
                            <input 
                                className="form-input" 
                                type="text" 
                                value={question} 
                                onChange={e => setQuestion(e.target.value)} 
                                placeholder="e.g. What are your store hours?"
                                required
                            />
                        </div>
                        <div>
                            <label className="form-label">Exact Reply</label>
                            <textarea 
                                className="form-input" 
                                value={answer} 
                                onChange={e => setAnswer(e.target.value)} 
                                placeholder="e.g. We are open Monday to Friday, 9 AM to 5 PM."
                                rows={3}
                                style={{ resize: 'vertical' }}
                                required
                            />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button type="submit" className="btn btn-primary" disabled={isSaving}>
                                {isSaving ? 'Training Engine...' : 'Save & Train'}
                            </button>
                        </div>
                    </form>
                </div>

                {/* List */}
                <div className="card" style={{ padding: '24px' }}>
                    <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Active FAQs</h2>
                    
                    {isLoading ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Loading knowledge base...</div>
                    ) : faqs.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px dashed var(--border)' }}>
                            <Icon name="search" size={32} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
                            <h3 style={{ fontSize: '15px', fontWeight: 500, marginBottom: '4px' }}>No FAQs yet</h3>
                            <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Add your first FAQ above so the bot can start answering customer queries automatically.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {faqs.map(faq => (
                                <div key={faq.id} style={{ padding: '16px', border: '1px solid var(--border)', borderRadius: '8px', background: '#f8fafc' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>{faq.question}</div>
                                            <div style={{ fontSize: '14px', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{faq.answer}</div>
                                        </div>
                                        <button 
                                            onClick={() => handleDelete(faq.id)}
                                            style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: '4px' }}
                                            title="Delete FAQ"
                                        >
                                            <Icon name="x" size={18} />
                                        </button>
                                    </div>
                                    <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
                                        Added: {new Date(faq.created_at).toLocaleDateString()}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
