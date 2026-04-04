import { useEffect, useState, useRef } from 'preact/hooks';
import { useStore } from './stores/store';
import Icon from './components/Icons';
import Dashboard from './components/Dashboard';
import Leads from './components/Leads';
import FollowUps from './components/FollowUps';
import Clients from './components/Clients';
import AllClients from './components/AllClients';
import Inventory from './components/Inventory';
import Projects from './components/Projects';
import Team from './components/Team';
import Login from './components/Login';
import Sidebar from './components/Sidebar';
import WhatsAppBroadcast from './components/WhatsAppBroadcast';

import Toast from './components/Toast';

/**
 * Main App Component
 * RELIABILITY: Route-based rendering with auth protection
 * SPEED: Lazy component mounting - only render active view
 */
export default function App() {
    const { isAuthenticated, currentView, fetchSources, fetchUsers, fetchDueReminders, dueReminders } = useStore();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const notifiedIdsRef = useRef(new Set()); // Track which reminders have been notified

    // Request notification permission and set up reminder checking
    useEffect(() => {
        if (isAuthenticated) {
            fetchSources();
            fetchUsers();

            // Request notification permission
            if ('Notification' in window && Notification.permission === 'default') {
                Notification.requestPermission().then(permission => {
                    console.log('Notification permission:', permission);
                });
            }

            // Check for due reminders every 60 seconds
            const checkReminders = async () => {
                await fetchDueReminders();
            };

            checkReminders(); // Initial check
            const intervalId = setInterval(checkReminders, 60000); // Every 60 seconds

            return () => clearInterval(intervalId);
        }
    }, [isAuthenticated]);

    // Show browser notification when new due reminders arrive
    useEffect(() => {
        if (!isAuthenticated || !dueReminders || dueReminders.length === 0) return;
        if ('Notification' in window && Notification.permission === 'granted') {
            dueReminders.forEach(reminder => {
                // Only notify once per reminder
                if (!notifiedIdsRef.current.has(reminder.id)) {
                    notifiedIdsRef.current.add(reminder.id);

                    const notification = new Notification('Follow-up Reminder', {
                        body: `${reminder.lead_name || 'Lead'}: ${reminder.notes || 'Time to follow up!'}`,
                        icon: '/assets/M.png',
                        tag: `reminder-${reminder.id}`,
                        requireInteraction: true
                    });

                    notification.onclick = () => {
                        window.focus();
                        notification.close();
                    };
                }
            });
        }
    }, [dueReminders, isAuthenticated]);

    // Show login if not authenticated
    if (!isAuthenticated) {
        return (
            <>
                <Login />
                <Toast />
            </>
        );
    }

    // Render current view
    const renderView = () => {
        switch (currentView) {
            case 'leads':
                return <Leads mode="new" />;
            case 'my-leads':
                return <Leads mode="my-leads" />;
            case 'warm-leads':
                return <Leads mode="warm" />;
            case 'archived-leads':
                return <Leads mode="archived" />;
            case 'followups':
                return <FollowUps />;
            case 'clients':
                return <Clients />;
            case 'inventory':
                return <Inventory />;
            case 'projects':
                return <Projects />;
            case 'all-clients':
                return <AllClients />;
            case 'team':
                return <Team />;
            case 'whatsapp':
                return <WhatsAppBroadcast />;

            case 'dashboard':
            default:
                return <Dashboard />;
        }
    };

    return (
        <div className="app-layout">
            <Sidebar isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />

            {/* Mobile Header */}
            <header className="mobile-header">
                <button className="btn-icon" onClick={() => setIsMobileMenuOpen(true)}>
                    <Icon name="menu" size={22} />
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <img src="/assets/M.png" alt="Logo" style={{ height: '60px', width: 'auto' }} />
                </div>
                <div style={{ width: '32px' }}></div> {/* Spacer for centering */}
            </header>

            <main className="main-content">
                {renderView()}
            </main>

            {/* Mobile Overlay */}
            {isMobileMenuOpen && (
                <div className="sidebar-overlay" onClick={() => setIsMobileMenuOpen(false)} />
            )}

            {/* Toast Notifications */}
            <Toast />
        </div>
    );
}

