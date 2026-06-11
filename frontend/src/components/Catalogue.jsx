import { useState, useEffect } from 'preact/hooks';
import { useStore } from '../stores/store';
import Icon from './Icons';

export default function Catalogue() {
    const { showToast } = useStore();
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        mrp: '',
        selling_price: '',
        category: '',
        sku: '',
        image_url: ''
    });

    const api = async (path, options = {}) => {
        const token = localStorage.getItem('token');
        const slug = localStorage.getItem('tenant_slug') || 'default';
        const res = await fetch(`/api/v1${path}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
                'x-tenant-slug': slug,
                ...options.headers,
            },
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Request failed');
        }
        if (res.status === 204) return null;
        return res.json();
    };

    const fetchProducts = async () => {
        try {
            setLoading(true);
            const data = await api('/products');
            setProducts(data.products || []);
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProducts();
    }, []);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleOpenModal = (product = null) => {
        if (product) {
            setEditingProduct(product);
            setFormData({
                name: product.name || '',
                description: product.description || '',
                mrp: product.mrp || '',
                selling_price: product.selling_price || '',
                category: product.category || '',
                sku: product.sku || '',
                image_url: product.image_url || ''
            });
        } else {
            setEditingProduct(null);
            setFormData({
                name: '', description: '', mrp: '', selling_price: '', category: '', sku: '', image_url: ''
            });
        }
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            if (editingProduct) {
                await api(`/products/${editingProduct.id}`, {
                    method: 'PUT',
                    body: JSON.stringify(formData)
                });
                showToast('Product updated successfully');
            } else {
                await api('/products', {
                    method: 'POST',
                    body: JSON.stringify(formData)
                });
                showToast('Product added successfully');
            }
            setShowModal(false);
            fetchProducts();
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('Are you sure you want to delete this product?')) return;
        try {
            await api(`/products/${id}`, { method: 'DELETE' });
            showToast('Product deleted');
            fetchProducts();
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
                <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    <Icon name="loader" size={32} />
                    <p style={{ marginTop: '12px' }}>Loading catalogue...</p>
                </div>
            </div>
        );
    }

    return (
        <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                        <Icon name="tag" size={22} style={{ marginRight: '8px' }} />
                        Product Catalogue
                    </h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '4px 0 0' }}>
                        Manage your products for WhatsApp sharing
                    </p>
                </div>
                <button className="btn btn-primary" onClick={() => handleOpenModal()} style={{ gap: '6px', display: 'flex', alignItems: 'center' }}>
                    <Icon name="plus" size={16} /> Add Product
                </button>
            </div>

            {products.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
                    <Icon name="tag" size={48} strokeWidth={1.5} style={{ opacity: 0.4 }} />
                    <p style={{ marginTop: '12px' }}>No products found in your catalogue.</p>
                    <button className="btn btn-primary" onClick={() => handleOpenModal()} style={{ marginTop: '16px' }}>
                        Create First Product
                    </button>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
                    {products.map(product => (
                        <div key={product.id} className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ 
                                height: '200px', 
                                background: 'var(--bg-secondary)', 
                                backgroundImage: product.image_url ? `url(${product.image_url})` : 'none',
                                backgroundSize: 'cover',
                                backgroundPosition: 'center',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                {!product.image_url && <Icon name="image" size={40} color="var(--border)" />}
                            </div>
                            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 600 }}>{product.name}</h3>
                                    {product.selling_price > 0 && (
                                        <span style={{ fontWeight: 700, color: '#10B981', fontSize: '15px' }}>
                                            ₹{product.selling_price}
                                        </span>
                                    )}
                                </div>
                                <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 12px 0', flex: 1, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                    {product.description || 'No description provided.'}
                                </p>
                                <div style={{ display: 'flex', gap: '8px', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px', flexWrap: 'wrap' }}>
                                    {product.category && <span style={{ padding: '2px 8px', background: 'var(--bg-secondary)', borderRadius: '12px' }}>{product.category}</span>}
                                    {product.sku && <span style={{ padding: '2px 8px', background: 'var(--bg-secondary)', borderRadius: '12px' }}>SKU: {product.sku}</span>}
                                </div>
                                <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                                    <button className="btn btn-ghost" onClick={() => handleOpenModal(product)} style={{ flex: 1, padding: '6px' }}>
                                        <Icon name="pencil" size={14} style={{ marginRight: '6px' }} /> Edit
                                    </button>
                                    <button className="btn btn-ghost" onClick={() => handleDelete(product.id)} style={{ flex: 1, padding: '6px', color: '#EF4444' }}>
                                        <Icon name="trash" size={14} style={{ marginRight: '6px' }} /> Delete
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay">
                    <div className="modal" style={{ maxWidth: '600px' }}>
                        <div className="modal-header">
                            <h2>{editingProduct ? 'Edit Product' : 'Add New Product'}</h2>
                            <button className="btn-icon" onClick={() => setShowModal(false)}>
                                <Icon name="x" size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <form onSubmit={handleSubmit} id="productForm">
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                        <label className="form-label">Product Name *</label>
                                        <input type="text" className="form-input" name="name" value={formData.name} onChange={handleInputChange} required />
                                    </div>
                                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                        <label className="form-label">Description</label>
                                        <textarea className="form-input" name="description" value={formData.description} onChange={handleInputChange} rows="3" />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Selling Price (₹)</label>
                                        <input type="number" step="0.01" className="form-input" name="selling_price" value={formData.selling_price} onChange={handleInputChange} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">MRP (₹)</label>
                                        <input type="number" step="0.01" className="form-input" name="mrp" value={formData.mrp} onChange={handleInputChange} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Category</label>
                                        <input type="text" className="form-input" name="category" value={formData.category} onChange={handleInputChange} placeholder="e.g. Electronics, Clothing" />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">SKU</label>
                                        <input type="text" className="form-input" name="sku" value={formData.sku} onChange={handleInputChange} />
                                    </div>
                                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                        <label className="form-label">Image URL</label>
                                        <input type="url" className="form-input" name="image_url" value={formData.image_url} onChange={handleInputChange} placeholder="https://example.com/image.jpg" />
                                        {formData.image_url && (
                                            <div style={{ marginTop: '10px' }}>
                                                <img src={formData.image_url} alt="Preview" style={{ height: '100px', borderRadius: '8px', objectFit: 'cover' }} />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </form>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                            <button className="btn btn-primary" type="submit" form="productForm" disabled={submitting}>
                                {submitting ? 'Saving...' : 'Save Product'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
