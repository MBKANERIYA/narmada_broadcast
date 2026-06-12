import { useStore } from '../stores/store';
import Icon from './Icons';

const NAV_ITEMS = [
    { id: 'contacts', label: 'Contacts', icon: 'contacts' },
    { id: 'broadcast', label: 'Broadcast', icon: 'whatsapp' },
    { id: 'chat', label: 'Chat Inbox', icon: 'chat' },
    { id: 'catalogue', label: 'Catalogue', icon: 'tag' },
    { id: 'knowledge', label: 'Smart FAQs', icon: 'message' },
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
                    width: '34px', height: '34px',
                    background: '#25D366',
                    borderRadius: '8px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '15px', fontWeight: 800, color: 'white',
                    flexShrink: 0,
                }}>W</div>
                <span className="sidebar-logo-text">{firmName}</span>
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
                                background: '#EF4444', color: '#fff',
                                padding: '0 6px',
                            }}>
                                {totalUnread > 99 ? '99+' : totalUnread}
                            </span>
                        )}
                    </button>
                ))}

                {/* Admin Panel — visible only for admin users */}
                {user?.role === 'admin' && (
                    <>
                        <div style={{ height: '1px', background: 'var(--border)', margin: '8px 12px' }} />
                        <button
                            className={`sidebar-nav-item ${currentView === 'admin' ? 'active' : ''}`}
                            onClick={() => handleNav('admin')}
                            style={{ color: currentView === 'admin' ? undefined : '#F59E0B' }}
                        >
                            <Icon name="lock" size={18} />
                            <span>Admin Panel</span>
                        </button>
                    </>
                )}
            </nav>

            {/* User */}
            <div className="sidebar-footer">
                <div className="sidebar-user">
                    <div style={{
                        width: '32px', height: '32px', borderRadius: '50%',
                        background: '#25D366', color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: '13px', flexShrink: 0,
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
                    <button className="btn-icon" onClick={logout} title="Logout">
                        <Icon name="logout" size={18} />
                    </button>
                </div>
            </div>
        </aside>
    );
}
