import { useEffect, useState } from 'preact/hooks';
import { useStore } from './stores/store';
import Icon from './components/Icons';
import LandingPage from './components/LandingPage';
import AuthPage from './components/Login';
import Sidebar from './components/Sidebar';
import Contacts from './components/Contacts';
import WhatsAppBroadcast from './components/WhatsAppBroadcast';
import WhatsAppChat from './components/WhatsAppChat';
import Catalogue from './components/Catalogue';
import Settings from './components/Settings';
import AdminPanel from './components/AdminPanel';
import Toast from './components/Toast';
import KnowledgeBase from './components/KnowledgeBase';
import Orders from './components/Orders';

export default function App() {
    const { isAuthenticated, currentView, tenant } = useStore();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [page, setPage] = useState('landing'); // 'landing' | 'login' | 'register'

    useEffect(() => {
        if (isAuthenticated) {
            useStore.getState().initSocket();
        } else {
            useStore.getState().disconnectSocket();
        }
    }, [isAuthenticated]);

    // If authenticated, show dashboard
    if (isAuthenticated) {
        const renderView = () => {
            switch (currentView) {
                case 'contacts': return <Contacts />;
                case 'broadcast': return <WhatsAppBroadcast />;
                case 'chat': return <WhatsAppChat />;
                case 'catalogue': return <Catalogue />;
                case 'orders': return <Orders />;
                case 'knowledge': return <KnowledgeBase />;
                case 'settings': return <Settings />;
                case 'admin': return <AdminPanel />;
                default: return <Contacts />;
            }
        };

        const logoUrl = tenant?.logo_url || null;
        const firmName = tenant?.name || 'WhatsApp Broadcast';

        return (
            <div className="app-layout">
                <Sidebar isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />

                <header className="mobile-header">
                    <button className="btn-icon" onClick={() => setIsMobileMenuOpen(true)}>
                        <Icon name="menu" size={22} />
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {logoUrl && <img src={logoUrl} alt={firmName} style={{ height: '40px', width: 'auto' }} />}
                        <span style={{ fontWeight: 600, fontSize: '14px' }}>{firmName}</span>
                    </div>
                    <div style={{ width: '32px' }}></div>
                </header>

                <main className="main-content">
                    {renderView()}
                </main>

                {isMobileMenuOpen && (
                    <div className="sidebar-overlay" onClick={() => setIsMobileMenuOpen(false)} />
                )}

                <Toast />
            </div>
        );
    }

    // Not authenticated — show landing or auth
    if (page === 'login' || page === 'register') {
        return (
            <>
                <AuthPage
                    initialMode={page}
                    onBack={() => setPage('landing')}
                />
                <Toast />
            </>
        );
    }

    // Landing page
    return (
        <>
            <LandingPage onNavigate={(p) => setPage(p)} />
            <Toast />
        </>
    );
}
