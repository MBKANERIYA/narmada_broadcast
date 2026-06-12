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
    const [searchQuery, setSearchQuery] = useState('');

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

    const filteredFaqs = faqs.filter(faq => 
        (faq.question || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (faq.answer || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Smart Knowledge Base</h1>
                    <p className="page-subtitle">Add frequently asked questions. The AI Semantic Engine will automatically match customer questions to these answers.</p>
                </div>
            </div>

            {/* Stats Bar */}
            <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                <div className="stat-card">
                    <span className="stat-label">Total FAQs</span>
                    <span className="stat-value">{faqs.length}</span>
                    <span className="stat-change">Active Questions</span>
                </div>
                <div className="stat-card">
                    <span className="stat-label">AI Status</span>
                    <span className="stat-value" style={{ color: 'var(--accent-success)' }}>Active</span>
                    <span className="stat-change">Semantic Matching</span>
                </div>
                <div className="stat-card">
                    <span className="stat-label">NLP Model</span>
                    <span className="stat-value" style={{ fontSize: '18px', fontWeight: 'bold', padding: '4px 0', margin: '4px 0' }}>MiniLM-L6 (Local)</span>
                    <span className="stat-change">On-Device Embeddings</span>
                </div>
            </div>

            <div className="faq-grid-container">
                {/* Left Column: Add Form */}
                <div className="faq-form-column">
                    <div className="card" style={{ padding: '24px' }}>
                        <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Icon name="plus" size={18} style={{ color: 'var(--accent-primary)' }} />
                            Add New FAQ
                        </h2>
                        
                        {error && (
                            <div style={{ padding: '12px', background: '#FEE2E2', color: '#B91C1C', borderRadius: '8px', fontSize: '14px', marginBottom: '16px' }}>
                                {error}
                            </div>
                        )}
                        
                        <form onSubmit={handleAdd}>
                            <div className="form-group">
                                <label className="form-label">Question (or Topic)</label>
                                <div style={{ position: 'relative' }}>
                                    <Icon name="chat" size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                    <input 
                                        className="form-input" 
                                        type="text" 
                                        value={question} 
                                        onChange={e => setQuestion(e.target.value)} 
                                        placeholder="e.g. What are your store hours?"
                                        style={{ paddingLeft: '36px', width: '100%' }}
                                        required
                                    />
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Exact Reply</label>
                                <textarea 
                                    className="form-input" 
                                    value={answer} 
                                    onChange={e => setAnswer(e.target.value)} 
                                    placeholder="e.g. We are open Monday to Friday, 9 AM to 5 PM."
                                    rows={4}
                                    style={{ width: '100%', resize: 'vertical', minHeight: '100px' }}
                                    required
                                />
                            </div>
                            <button type="submit" className="btn btn-primary full-width" disabled={isSaving} style={{ marginTop: '8px' }}>
                                {isSaving ? 'Training Engine...' : <><Icon name="check" size={16} /> Save & Train</>}
                            </button>
                        </form>
                    </div>
                </div>

                {/* Right Column: List */}
                <div className="faq-list-column">
                    <div className="card" style={{ padding: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>Active FAQs</h2>
                            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', background: 'var(--bg-tertiary)', padding: '4px 10px', borderRadius: '12px', fontWeight: 500 }}>
                                {filteredFaqs.length} {filteredFaqs.length === 1 ? 'item' : 'items'}
                            </span>
                        </div>

                        {/* Search Bar */}
                        {faqs.length > 0 && (
                            <div className="search-bar" style={{ marginBottom: '20px' }}>
                                <Icon name="search" size={18} />
                                <input 
                                    type="text" 
                                    value={searchQuery} 
                                    onInput={e => setSearchQuery(e.target.value)}
                                    placeholder="Search active FAQs..." 
                                    className="search-input" 
                                />
                            </div>
                        )}
                        
                        {isLoading ? (
                            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Loading knowledge base...</div>
                        ) : faqs.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px dashed var(--border-color)' }}>
                                <Icon name="search" size={32} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
                                <h3 style={{ fontSize: '15px', fontWeight: 500, marginBottom: '4px' }}>No FAQs yet</h3>
                                <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Add your first FAQ on the left so the bot can start answering customer queries automatically.</p>
                            </div>
                        ) : filteredFaqs.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px dashed var(--border-color)' }}>
                                <Icon name="search" size={32} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
                                <h3 style={{ fontSize: '15px', fontWeight: 500, marginBottom: '4px' }}>No matches found</h3>
                                <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>No FAQs match your search query "{searchQuery}". Try a different keyword.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                {filteredFaqs.map(faq => (
                                    <div key={faq.id} className="faq-item-card">
                                        <div className="faq-question-container">
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', flex: 1 }}>
                                                <Icon name="chat" size={16} style={{ color: 'var(--accent-primary)', marginTop: '3px', flexShrink: 0 }} />
                                                <h3 className="faq-question-text">{faq.question}</h3>
                                            </div>
                                            <button 
                                                onClick={() => handleDelete(faq.id)}
                                                className="faq-delete-btn"
                                                title="Delete FAQ"
                                            >
                                                <Icon name="x" size={16} />
                                            </button>
                                        </div>
                                        <div className="faq-answer-text">
                                            {faq.answer}
                                        </div>
                                        <div className="faq-footer">
                                            <div className="faq-footer-item">
                                                <Icon name="check" size={12} style={{ color: 'var(--accent-success)' }} />
                                                <span>Semantic Match Ready</span>
                                            </div>
                                            <div>
                                                Added: {new Date(faq.created_at).toLocaleDateString()}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
