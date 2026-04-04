import { useEffect, useState } from 'preact/hooks';
import { useStore } from '../stores/store';

/**
 * All Clients Component - Admin Only
 * Shows both rejected leads and converted clients with filters and CSV export
 */
export default function AllClients() {
    const { leads, fetchLeads, clients, fetchClients, user, isLoading } = useStore();
    const [activeTab, setActiveTab] = useState('all'); // all, clients, rejected
    const [filters, setFilters] = useState({
        search: '',
        source: '',
        location: '',
        dateFrom: '',
        dateTo: ''
    });

    const isAdmin = user?.role === 'admin';

    useEffect(() => {
        fetchLeads();
        fetchClients();
    }, []);

    // If not admin, show access denied
    if (!isAdmin) {
        return (
            <div className="content-section">
                <div className="card" style={{ textAlign: 'center', padding: 'var(--space-12)' }}>
                    <div style={{ fontSize: '48px', marginBottom: 'var(--space-4)' }}>🔒</div>
                    <h2>Access Restricted</h2>
                    <p style={{ color: 'var(--text-muted)' }}>This section is only accessible to administrators.</p>
                </div>
            </div>
        );
    }

    // Get rejected leads
    const rejectedLeads = leads.filter(l => l.status === 'rejected').map(l => ({
        ...l,
        type: 'rejected',
        deal_date: l.updated_at || l.created_at
    }));

    // Transform clients to common format
    const convertedClients = clients.map(c => ({
        ...c,
        type: 'client',
        status: 'client'
    }));

    // Combine all data based on active tab
    let allData = [];
    if (activeTab === 'all') {
        allData = [...convertedClients, ...rejectedLeads];
    } else if (activeTab === 'clients') {
        allData = convertedClients;
    } else {
        allData = rejectedLeads;
    }

    // Apply filters
    const filteredData = allData.filter(item => {
        // Search filter
        if (filters.search) {
            const searchLower = filters.search.toLowerCase();
            if (!item.name?.toLowerCase().includes(searchLower) &&
                !item.phone?.includes(filters.search) &&
                !item.email?.toLowerCase().includes(searchLower)) {
                return false;
            }
        }

        // Source filter
        if (filters.source && item.source !== filters.source) return false;

        // Location filter
        if (filters.location && !item.location?.toLowerCase().includes(filters.location.toLowerCase())) return false;

        // Date range filter
        if (filters.dateFrom) {
            const itemDate = new Date(item.deal_date || item.created_at);
            if (itemDate < new Date(filters.dateFrom)) return false;
        }
        if (filters.dateTo) {
            const itemDate = new Date(item.deal_date || item.created_at);
            if (itemDate > new Date(filters.dateTo + 'T23:59:59')) return false;
        }

        return true;
    });

    // Get unique sources for filter dropdown
    const uniqueSources = [...new Set([...leads, ...clients].map(item => item.source).filter(Boolean))];

    // Clear all filters
    const clearFilters = () => {
        setFilters({ search: '', source: '', location: '', dateFrom: '', dateTo: '' });
    };

    // Download CSV
    const downloadCSV = (downloadAll = false) => {
        const dataToExport = downloadAll ? allData : filteredData;

        if (dataToExport.length === 0) {
            alert('No data to export');
            return;
        }

        const headers = ['Name', 'Phone', 'Email', 'Location', 'Source', 'Status', 'Type', 'Interest', 'Date', 'Notes'];
        const rows = dataToExport.map(item => [
            item.name || '',
            item.phone || '',
            item.email || '',
            item.location || '',
            item.source || '',
            item.status || '',
            item.type || '',
            item.interest || '',
            item.deal_date || item.created_at || '',
            (item.notes || '').replace(/,/g, ';').replace(/\n/g, ' ')
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `all_clients_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const hasActiveFilters = filters.search || filters.source || filters.location || filters.dateFrom || filters.dateTo;

    return (
        <div className="content-section">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
                <div>
                    <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: '700' }}>📊 All Clients</h1>
                    <p style={{ color: 'var(--text-muted)', marginTop: 'var(--space-1)', fontSize: '14px' }}>
                        View all converted clients and rejected leads
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <button className="btn btn-secondary" onClick={() => downloadCSV(false)} title="Download filtered data">
                        📥 Export Filtered ({filteredData.length})
                    </button>
                    <button className="btn btn-primary" onClick={() => downloadCSV(true)} title="Download all data">
                        📥 Export All ({allData.length})
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
                {[
                    { key: 'all', label: 'All', count: convertedClients.length + rejectedLeads.length },
                    { key: 'clients', label: '✅ Clients', count: convertedClients.length },
                    { key: 'rejected', label: '❌ Rejected', count: rejectedLeads.length }
                ].map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        style={{
                            padding: 'var(--space-2) var(--space-4)',
                            borderRadius: 'var(--radius-md)',
                            border: 'none',
                            cursor: 'pointer',
                            fontWeight: activeTab === tab.key ? '600' : '400',
                            background: activeTab === tab.key ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                            color: activeTab === tab.key ? 'white' : 'var(--text-primary)'
                        }}
                    >
                        {tab.label} ({tab.count})
                    </button>
                ))}
            </div>

            {/* Filters */}
            <div className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--space-3)', alignItems: 'end' }}>
                    <div>
                        <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Search</label>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Name, phone, email..."
                            value={filters.search}
                            onInput={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Source</label>
                        <select
                            className="form-select"
                            value={filters.source}
                            onChange={(e) => setFilters(f => ({ ...f, source: e.target.value }))}
                        >
                            <option value="">All Sources</option>
                            {uniqueSources.map(src => (
                                <option key={src} value={src}>{src}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Location</label>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Filter by location..."
                            value={filters.location}
                            onInput={(e) => setFilters(f => ({ ...f, location: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>From Date</label>
                        <input
                            type="date"
                            className="form-input"
                            value={filters.dateFrom}
                            onInput={(e) => setFilters(f => ({ ...f, dateFrom: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>To Date</label>
                        <input
                            type="date"
                            className="form-input"
                            value={filters.dateTo}
                            onInput={(e) => setFilters(f => ({ ...f, dateTo: e.target.value }))}
                        />
                    </div>
                    {hasActiveFilters && (
                        <button className="btn btn-secondary" onClick={clearFilters} style={{ height: '38px' }}>
                            ✕ Clear
                        </button>
                    )}
                </div>
            </div>

            {/* Results count */}
            <div style={{ marginBottom: 'var(--space-3)', color: 'var(--text-muted)', fontSize: '14px' }}>
                Showing {filteredData.length} of {allData.length} records
            </div>

            {/* Data Table */}
            {isLoading && allData.length === 0 ? (
                <div className="loading" />
            ) : filteredData.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
                    <div style={{ fontSize: '48px', marginBottom: 'var(--space-4)' }}>📭</div>
                    <h3>No records found</h3>
                    <p style={{ color: 'var(--text-muted)' }}>
                        {hasActiveFilters ? 'Try adjusting your filters' : 'No data available yet'}
                    </p>
                </div>
            ) : (
                <div className="card full-width">
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Phone</th>
                                    <th>Location</th>
                                    <th>Source</th>
                                    <th>Type</th>
                                    <th>Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredData.map((item, idx) => (
                                    <tr key={`${item.type}-${item.id || idx}`}>
                                        <td style={{ fontWeight: '500' }}>
                                            <div>{item.name}</div>
                                            {item.email && (
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.email}</div>
                                            )}
                                        </td>
                                        <td>{item.phone || '-'}</td>
                                        <td>{item.location || '-'}</td>
                                        <td>
                                            <span style={{
                                                fontSize: '11px',
                                                background: 'var(--bg-tertiary)',
                                                padding: '2px 6px',
                                                borderRadius: '4px'
                                            }}>
                                                {item.source || '-'}
                                            </span>
                                        </td>
                                        <td>
                                            <span style={{
                                                padding: '3px 8px',
                                                borderRadius: '10px',
                                                fontSize: '11px',
                                                fontWeight: '600',
                                                background: item.type === 'client' ? '#D1FAE5' : '#FEE2E2',
                                                color: item.type === 'client' ? '#065F46' : '#991B1B'
                                            }}>
                                                {item.type === 'client' ? '✅ Client' : '❌ Rejected'}
                                            </span>
                                        </td>
                                        <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                            {new Date(item.deal_date || item.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
