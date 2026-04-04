import { useStore } from '../stores/store';
import Icon from './Icons';

/**
 * Sidebar Navigation
 * SPEED: Pure component with minimal re-renders
 * SECURITY: Role-based menu items
 */
export default function Sidebar({ isOpen, onClose }) {
    const { currentView, setCurrentView, user, logout } = useStore();

    const isAdmin = user?.role === 'admin';

    // Admin sees all menu items, Employee sees limited options
    const navItems = isAdmin
        ? [
            { id: 'dashboard', label: 'Dashboard', icon: 'bar-chart' },
            { id: 'leads', label: 'New Leads', icon: 'users' },
            { id: 'warm-leads', label: 'Warm Leads', icon: 'flame' },
            { id: 'clients', label: 'Clients', icon: 'trophy' },
            { id: 'inventory', label: 'Inventory', icon: 'home' },
            { id: 'followups', label: 'Follow-ups', icon: 'phone' },
            { id: 'archived-leads', label: 'Archives', icon: 'trash' },
            { id: 'all-clients', label: 'All Clients', icon: 'clipboard' },
            { id: 'team', label: 'Team', icon: 'briefcase' },
            { id: 'whatsapp', label: 'WA Broadcast', icon: 'message-circle' },

        ]
        : [
            { id: 'dashboard', label: 'Home', icon: 'home' },
            { id: 'my-leads', label: 'My Leads', icon: 'clipboard' },
            { id: 'leads', label: 'Add Lead', icon: 'plus' },
            { id: 'clients', label: 'Add Client', icon: 'trophy' },
            { id: 'inventory', label: 'Inventory', icon: 'building' },
            { id: 'followups', label: 'My Follow-ups', icon: 'phone' },
        ];

    const handleNavClick = (view) => {
        setCurrentView(view);
        if (window.innerWidth <= 768 && onClose) {
            onClose();
        }
    };

    return (
        <aside className={`sidebar ${isOpen ? 'mobile-open' : ''}`}>
            <div className="sidebar-header-mobile">
                <div className="sidebar-logo p-0">
                    <img src="/assets/M.png" alt="Logo" style={{ width: '120px', height: 'auto' }} />
                </div>
                <button className="btn-icon mobile-close-btn" onClick={onClose}><Icon name="x" size={18} /></button>
            </div>

            <nav className="sidebar-nav">
                {navItems.map(item => (
                    <button
                        key={item.id}
                        className={`nav-item ${currentView === item.id ? 'active' : ''}`}
                        onClick={() => handleNavClick(item.id)}
                    >
                        <Icon name={item.icon} size={18} />
                        {item.label}
                    </button>
                ))}
            </nav>

            <div style={{ marginTop: 'auto', padding: 'var(--space-4)' }}>
                <div style={{
                    fontSize: 'var(--text-sm)',
                    color: 'var(--text-muted)',
                    marginBottom: 'var(--space-2)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)'
                }}>
                    <span style={{
                        background: isAdmin ? 'var(--accent-primary)' : 'var(--accent-success)',
                        color: 'white',
                        padding: '2px 6px',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: 'var(--text-xs)',
                        textTransform: 'uppercase',
                    }}>
                        {isAdmin ? 'Admin' : 'Agent'}
                    </span>
                    {user?.name || 'User'}
                </div>
                <button className="btn btn-secondary" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }} onClick={logout}>
                    <Icon name="log-out" size={15} />
                    Logout
                </button>
            </div>
        </aside>
    );
}
