import { useStore } from '../stores/store';
import Icon from './Icons';

const NAV_ITEMS = [
    { id: 'contacts', label: 'Contacts', icon: 'contacts' },
    { id: 'broadcast', label: 'Broadcast', icon: 'whatsapp' },
    { id: 'chat', label: 'Chat Inbox', icon: 'chat' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
];

export default function Sidebar({ isOpen, onClose }) {
    const { currentView, setCurrentView, user, tenant, logout, totalUnread } = useStore();

    const handleNav = (viewId) => {
        setCurrentView(viewId);
        onClose?.();
    };

    const firmName = tenant?.name || 'WhatsApp Broadcast';

    return (
        <aside className={`sidebar ${isOpen ? 'sidebar--open' : ''}`}>
            {/* Logo */}
            <div className="sidebar-logo">
                <div style={{
                    width: '36px', height: '36px',
                    background: 'linear-gradient(135deg, #25D366, #128C7E)',
                    borderRadius: '10px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '16px', fontWeight: 800, color: 'white',
                    boxShadow: '0 2px 12px rgba(37, 211, 102, 0.2)',
                    flexShrink: 0,
                }}>W</div>
                <span className="sidebar-logo-text" style={{
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{firmName}</span>
            </div>

            {/* Navigation */}
            <nav className="sidebar-nav">
                {NAV_ITEMS.map(item => (
                    <button
                        key={item.id}
                        className={`sidebar-nav-item ${currentView === item.id ? 'active' : ''}`}
                        onClick={() => handleNav(item.id)}
                    >
                        <Icon name={item.icon} size={18} />
                        <span>{item.label}</span>
                        {item.id === 'chat' && totalUnread > 0 && (
                            <span style={{
                                marginLeft: 'auto',
                                minWidth: '20px', height: '20px',
                                borderRadius: '10px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '11px', fontWeight: 700,
                                background: '#ef4444', color: '#fff',
                                padding: '0 6px',
                            }}>
                                {totalUnread > 99 ? '99+' : totalUnread}
                            </span>
                        )}
                    </button>
                ))}
            </nav>

            {/* User */}
            <div className="sidebar-footer">
                <div className="sidebar-user">
                    <div style={{
                        width: '34px', height: '34px', borderRadius: '50%',
                        background: 'linear-gradient(135deg, #25D366, #128C7E)',
                        color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: '14px', flexShrink: 0,
                    }}>
                        {(user?.name || 'U').charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                            fontWeight: 600, fontSize: '13px',
                            color: 'var(--text-primary)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                            {user?.name || 'User'}
                        </div>
                        <div style={{
                            fontSize: '11px', color: 'var(--text-muted)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                            {user?.email || ''}
                        </div>
                    </div>
                    <button className="btn-icon" onClick={logout} title="Logout"
                        style={{ color: 'var(--text-muted)' }}>
                        <Icon name="logout" size={18} />
                    </button>
                </div>
            </div>
        </aside>
    );
}
