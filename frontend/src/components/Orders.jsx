import { useState, useEffect } from 'preact/hooks';
import { useStore } from '../stores/store';
import Icon from './Icons';

export default function Orders() {
    const { showToast } = useStore();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const limit = 20;

    const [paymentStatusFilter, setPaymentStatusFilter] = useState('');
    const [fulfillmentStatusFilter, setFulfillmentStatusFilter] = useState('');

    const [selectedOrder, setSelectedOrder] = useState(null);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [updatingStatus, setUpdatingStatus] = useState(false);

    const [tempPaymentStatus, setTempPaymentStatus] = useState('');
    const [tempFulfillmentStatus, setTempFulfillmentStatus] = useState('');

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

    const fetchOrders = async () => {
        try {
            setLoading(true);
            let url = `/orders?page=${page}&limit=${limit}`;
            if (paymentStatusFilter) url += `&payment_status=${paymentStatusFilter}`;
            if (fulfillmentStatusFilter) url += `&fulfillment_status=${fulfillmentStatusFilter}`;

            const data = await api(url);
            setOrders(data.orders || []);
            setTotal(data.total || 0);
        } catch (error) {
            console.error('Fetch orders error:', error);
            showToast(error.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOrders();
    }, [page, paymentStatusFilter, fulfillmentStatusFilter]);

    const openOrderDetails = async (orderId) => {
        try {
            setLoadingDetails(true);
            setSelectedOrder({ id: orderId }); // Show modal with placeholder/ID first
            const order = await api(`/orders/${orderId}`);
            setSelectedOrder(order);
            setTempPaymentStatus(order.payment_status);
            setTempFulfillmentStatus(order.fulfillment_status);
        } catch (error) {
            console.error('Fetch order details error:', error);
            showToast(error.message, 'error');
            setSelectedOrder(null);
        } finally {
            setLoadingDetails(false);
        }
    };

    const closeOrderDetails = () => {
        setSelectedOrder(null);
    };

    const updateOrderStatus = async () => {
        if (!selectedOrder) return;
        try {
            setUpdatingStatus(true);
            await api(`/orders/${selectedOrder.id}/status`, {
                method: 'PATCH',
                body: JSON.stringify({
                    payment_status: tempPaymentStatus,
                    fulfillment_status: tempFulfillmentStatus
                })
            });
            showToast('Order status updated successfully!', 'success');
            // Refresh detail modal
            setSelectedOrder(prev => ({
                ...prev,
                payment_status: tempPaymentStatus,
                fulfillment_status: tempFulfillmentStatus
            }));
            // Refresh list
            fetchOrders();
        } catch (error) {
            console.error('Update order status error:', error);
            showToast(error.message, 'error');
        } finally {
            setUpdatingStatus(false);
        }
    };

    const getPaymentBadge = (status) => {
        switch (status) {
            case 'paid':
                return <span className="status-badge won">Paid</span>;
            case 'failed':
                return <span className="status-badge lost">Failed</span>;
            default:
                return <span className="status-badge proposal">Pending</span>;
        }
    };

    const getFulfillmentBadge = (status) => {
        switch (status) {
            case 'delivered':
                return <span className="status-badge won">Delivered</span>;
            case 'cancelled':
                return <span className="status-badge lost">Cancelled</span>;
            case 'shipped':
                return <span className="status-badge qualified">Shipped</span>;
            case 'processing':
                return <span className="status-badge contacted">Processing</span>;
            default:
                return <span className="status-badge proposal">Pending</span>;
        }
    };

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Orders</h1>
                    <p className="page-subtitle">Track and fulfill customer orders placed via WhatsApp Business</p>
                </div>
                <button className="btn btn-secondary btn-icon" onClick={fetchOrders} disabled={loading} title="Refresh">
                    <Icon name="refresh-cw" size={16} className={loading ? 'spin' : ''} />
                </button>
            </div>

            {/* Filter Section */}
            <div className="card" style={{ marginBottom: '20px', padding: '16px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
                    <div className="form-group" style={{ margin: 0, minWidth: '180px' }}>
                        <label className="form-label" style={{ fontWeight: 600 }}>Payment Status</label>
                        <select
                            className="form-select"
                            value={paymentStatusFilter}
                            onChange={e => { setPaymentStatusFilter(e.target.value); setPage(1); }}
                        >
                            <option value="">All Payments</option>
                            <option value="pending">Pending</option>
                            <option value="paid">Paid</option>
                            <option value="failed">Failed</option>
                        </select>
                    </div>
                    <div className="form-group" style={{ margin: 0, minWidth: '180px' }}>
                        <label className="form-label" style={{ fontWeight: 600 }}>Fulfillment Status</label>
                        <select
                            className="form-select"
                            value={fulfillmentStatusFilter}
                            onChange={e => { setFulfillmentStatusFilter(e.target.value); setPage(1); }}
                        >
                            <option value="">All Fulfillments</option>
                            <option value="pending">Pending</option>
                            <option value="processing">Processing</option>
                            <option value="shipped">Shipped</option>
                            <option value="delivered">Delivered</option>
                            <option value="cancelled">Cancelled</option>
                        </select>
                    </div>
                    {(paymentStatusFilter || fulfillmentStatusFilter) && (
                        <button
                            className="btn btn-secondary"
                            onClick={() => { setPaymentStatusFilter(''); setFulfillmentStatusFilter(''); setPage(1); }}
                            style={{ alignSelf: 'flex-end', height: '38px', padding: '0 16px' }}
                        >
                            Reset Filters
                        </button>
                    )}
                </div>
            </div>

            {/* Table */}
            <div className="card" style={{ overflow: 'auto' }}>
                <table className="table">
                    <thead>
                        <tr>
                            <th>Order ID</th>
                            <th>Customer</th>
                            <th>Date</th>
                            <th>Total Amount</th>
                            <th>Payment</th>
                            <th>Fulfillment</th>
                            <th style={{ width: '90px', textAlign: 'center' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={7} style={{ textAlign: 'center', padding: '40px' }}>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                                        <Icon name="loader" size={20} className="spin" />
                                        <span>Loading orders...</span>
                                    </div>
                                </td>
                            </tr>
                        ) : orders.length === 0 ? (
                            <tr>
                                <td colSpan={7} style={{ textAlign: 'center', padding: '40px', opacity: 0.5 }}>
                                    No orders found.
                                </td>
                            </tr>
                        ) : orders.map(order => (
                            <tr key={order.id}>
                                <td><span style={{ fontWeight: 600 }}>#{order.id}</span></td>
                                <td>
                                    <div style={{ fontWeight: 600 }}>{order.contact_name || 'Walk-in Customer'}</div>
                                    <div style={{ fontSize: '11px', opacity: 0.6 }}>{order.phone}</div>
                                </td>
                                <td>
                                    {new Date(order.created_at).toLocaleDateString(undefined, {
                                        year: 'numeric', month: 'short', day: 'numeric',
                                        hour: '2-digit', minute: '2-digit'
                                    })}
                                </td>
                                <td style={{ fontWeight: 600 }}>
                                    {order.currency} {parseFloat(order.total_amount).toFixed(2)}
                                </td>
                                <td>{getPaymentBadge(order.payment_status)}</td>
                                <td>{getFulfillmentBadge(order.fulfillment_status)}</td>
                                <td style={{ textAlign: 'center' }}>
                                    <button
                                        className="btn btn-secondary"
                                        style={{ padding: '6px 12px', fontSize: '12px' }}
                                        onClick={() => openOrderDetails(order.id)}
                                    >
                                        View Details
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {total > limit && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                        Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, total)} of {total} orders
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            className="btn btn-secondary"
                            disabled={page === 1}
                            onClick={() => setPage(p => p - 1)}
                            style={{ padding: '6px 12px', fontSize: '13px' }}
                        >
                            Previous
                        </button>
                        <span style={{ display: 'flex', alignItems: 'center', fontSize: '13px', fontWeight: 600, padding: '0 8px' }}>
                            Page {page} of {Math.ceil(total / limit)}
                        </span>
                        <button
                            className="btn btn-secondary"
                            disabled={page >= Math.ceil(total / limit)}
                            onClick={() => setPage(p => p + 1)}
                            style={{ padding: '6px 12px', fontSize: '13px' }}
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}

            {/* Order Details Modal */}
            {selectedOrder && (
                <div className="modal-overlay" onClick={closeOrderDetails}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '650px', width: '90%' }}>
                        <div className="modal-header">
                            <h2>Order Details #{selectedOrder.id}</h2>
                            <button className="btn-icon" onClick={closeOrderDetails}><Icon name="close" size={20} /></button>
                        </div>
                        <div className="modal-body">
                            {loadingDetails ? (
                                <div style={{ textAlign: 'center', padding: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                    <Icon name="loader" size={20} className="spin" />
                                    <span>Loading details...</span>
                                </div>
                            ) : (
                                <div>
                                    {/* Customer and Order metadata */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                                        <div>
                                            <h4 style={{ margin: '0 0 6px 0', fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Customer Info</h4>
                                            <div style={{ fontWeight: 600 }}>{selectedOrder.contact_name || 'Walk-in Customer'}</div>
                                            {selectedOrder.contact_email && <div style={{ fontSize: '13px' }}>{selectedOrder.contact_email}</div>}
                                            <div style={{ fontSize: '13px', fontFamily: 'monospace' }}>{selectedOrder.phone}</div>
                                        </div>
                                        <div>
                                            <h4 style={{ margin: '0 0 6px 0', fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Order Info</h4>
                                            <div style={{ fontSize: '13px' }}>
                                                <strong>Placed:</strong> {new Date(selectedOrder.created_at).toLocaleString()}
                                            </div>
                                            <div style={{ fontSize: '13px' }}>
                                                <strong>Total Amount:</strong> {selectedOrder.currency} {parseFloat(selectedOrder.total_amount).toFixed(2)}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Update Status Form */}
                                    <div style={{ background: 'var(--bg-tertiary)', padding: '14px 16px', borderRadius: '8px', marginBottom: '20px', border: '1px solid var(--border-color)' }}>
                                        <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 600 }}>Update Order Status</h4>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                                            <div className="form-group" style={{ margin: 0 }}>
                                                <label className="form-label" style={{ fontSize: '12px' }}>Payment Status</label>
                                                <select
                                                    className="form-select"
                                                    value={tempPaymentStatus}
                                                    onChange={e => setTempPaymentStatus(e.target.value)}
                                                >
                                                    <option value="pending">Pending</option>
                                                    <option value="paid">Paid</option>
                                                    <option value="failed">Failed</option>
                                                </select>
                                            </div>
                                            <div className="form-group" style={{ margin: 0 }}>
                                                <label className="form-label" style={{ fontSize: '12px' }}>Fulfillment Status</label>
                                                <select
                                                    className="form-select"
                                                    value={tempFulfillmentStatus}
                                                    onChange={e => setTempFulfillmentStatus(e.target.value)}
                                                >
                                                    <option value="pending">Pending</option>
                                                    <option value="processing">Processing</option>
                                                    <option value="shipped">Shipped</option>
                                                    <option value="delivered">Delivered</option>
                                                    <option value="cancelled">Cancelled</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
                                            <button
                                                className="btn btn-primary"
                                                style={{ fontSize: '12px', padding: '6px 12px' }}
                                                onClick={updateOrderStatus}
                                                disabled={updatingStatus}
                                            >
                                                {updatingStatus ? 'Updating...' : 'Save Status'}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Line Items Table */}
                                    <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Items Summary</h4>
                                    <div className="table-container" style={{ marginBottom: '20px' }}>
                                        <table style={{ fontSize: '13px' }}>
                                            <thead>
                                                <tr>
                                                    <th>Item Name</th>
                                                    <th>SKU</th>
                                                    <th style={{ textAlign: 'right' }}>Price</th>
                                                    <th style={{ textAlign: 'center' }}>Qty</th>
                                                    <th style={{ textAlign: 'right' }}>Subtotal</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {selectedOrder.items && selectedOrder.items.length > 0 ? (
                                                    selectedOrder.items.map(item => (
                                                        <tr key={item.id}>
                                                            <td style={{ fontWeight: 500 }}>{item.item_name}</td>
                                                            <td><code style={{ fontSize: '12px' }}>{item.sku || '—'}</code></td>
                                                            <td style={{ textAlign: 'right' }}>{selectedOrder.currency} {parseFloat(item.price).toFixed(2)}</td>
                                                            <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                                                            <td style={{ textAlign: 'right', fontWeight: 500 }}>
                                                                {selectedOrder.currency} {(parseFloat(item.price) * item.quantity).toFixed(2)}
                                                            </td>
                                                        </tr>
                                                    ))
                                                ) : (
                                                    <tr>
                                                        <td colSpan={5} style={{ textAlign: 'center', opacity: 0.5, padding: '16px' }}>No items in this order.</td>
                                                    </tr>
                                                )}
                                                <tr>
                                                    <td colSpan={4} style={{ textAlign: 'right', fontWeight: 600, borderTop: '1px solid var(--border-color)' }}>
                                                        Grand Total:
                                                    </td>
                                                    <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '14px', color: 'var(--accent-primary)', borderTop: '1px solid var(--border-color)' }}>
                                                        {selectedOrder.currency} {parseFloat(selectedOrder.total_amount || 0).toFixed(2)}
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Notes */}
                                    {selectedOrder.notes && (
                                        <div style={{ fontSize: '13px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                                            <strong>Order Notes:</strong>
                                            <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                                                {selectedOrder.notes}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={closeOrderDetails}>Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
