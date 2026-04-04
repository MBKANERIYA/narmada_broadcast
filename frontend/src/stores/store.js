/**
 * Zustand Store for CRM State Management
 * RELIABILITY: Persists to localStorage for offline-first capability
 * SPEED: In-memory state with selective persistence
 * SUSTAINABILITY: Minimal boilerplate, ~2KB library
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Remove trailing slash from API URL if present
const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

console.log('API Base URL:', API_BASE_URL);

// API helper with error handling
const api = async (path, options = {}) => {
    const token = localStorage.getItem('token');
    const headers = {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
    };

    const url = `${API_BASE_URL}/api/v1${path}`;
    console.log('Fetching:', url);

    try {
        const res = await fetch(url, { ...options, headers });

        if (!res.ok) {
            const errorText = await res.text();
            let error;
            try {
                error = JSON.parse(errorText);
            } catch (e) {
                // If not JSON, use text or status
                error = { error: errorText || `Request failed (${res.status} ${res.statusText})` };
            }
            throw new Error(error.error || `Request failed (${res.status})`);
        }

        if (res.status === 204) return null;
        return res.json();
    } catch (error) {
        console.error(`API Error [${path}]:`, error);
        throw error;
    }
};

// Lead statuses for pipeline
export const LEAD_STATUSES = [
    { id: 'new', label: 'New', color: 'new' },
    { id: 'contacted', label: 'Contacted', color: 'contacted' },
    { id: 'qualified', label: 'Qualified', color: 'qualified' },
];

// Main store with persistence
export const useStore = create(
    persist(
        (set, get) => ({
            // Auth state
            user: null,
            isAuthenticated: false,

            // Data state
            leads: [],
            warmLeads: [],
            followUps: [],
            sources: [],
            users: [],
            dashboardStats: null,
            isLoading: false,
            error: null,
            currentView: 'dashboard',
            isModalOpen: false,

            // Cold Lead Reminders state
            coldReminders: [],
            dueReminders: [],

            // Toast notification state
            toast: null,
            showToast: (message, type = 'success', duration = 3000) => {
                set({ toast: { message, type, duration } });
            },
            clearToast: () => set({ toast: null }),

            // Actions
            setIsLoading: (isLoading) => set({ isLoading }),
            setCurrentView: (view) => set({ currentView: view }),
            openModal: () => set({ isModalOpen: true }),
            closeModal: () => set({ isModalOpen: false }),

            // Cold Reminders Actions
            fetchReminders: async () => {
                try {
                    const reminders = await api('/reminders');
                    set({ coldReminders: reminders });
                } catch (error) {
                    console.error('Fetch reminders error:', error);
                }
            },

            fetchDueReminders: async () => {
                try {
                    // Send client's current time formatted as YYYY-MM-DD HH:mm:ss for direct DB comparison
                    const now = new Date();
                    const localTime = now.getFullYear() + '-' +
                        String(now.getMonth() + 1).padStart(2, '0') + '-' +
                        String(now.getDate()).padStart(2, '0') + ' ' +
                        String(now.getHours()).padStart(2, '0') + ':' +
                        String(now.getMinutes()).padStart(2, '0') + ':' +
                        String(now.getSeconds()).padStart(2, '0');

                    const reminders = await api(`/reminders/due?clientTime=${encodeURIComponent(localTime)}`);
                    set({ dueReminders: reminders });
                } catch (error) {
                    console.error('Fetch due reminders error:', error);
                }
            },

            createReminder: async (reminderData) => {
                await api('/reminders', {
                    method: 'POST',
                    body: JSON.stringify(reminderData)
                });
                get().fetchReminders();
            },

            completeReminder: async (id) => {
                await api(`/reminders/${id}/complete`, { method: 'PATCH' });
                get().fetchReminders();
                get().fetchDueReminders();
            },

            deleteReminder: async (id) => {
                await api(`/reminders/${id}`, { method: 'DELETE' });
                get().fetchReminders();
            },

            // Projects State & Actions
            projects: [],

            fetchProjects: async () => {
                try {
                    const projects = await api('/projects');
                    set({ projects });
                } catch (error) {
                    console.error('Fetch projects error:', error);
                }
            },

            createProject: async (projectData) => {
                await api('/projects', {
                    method: 'POST',
                    body: JSON.stringify(projectData)
                });
                get().fetchProjects();
            },

            updateProject: async (id, projectData) => {
                await api(`/projects/${id}`, {
                    method: 'PUT',
                    body: JSON.stringify(projectData)
                });
                get().fetchProjects();
            },

            deleteProject: async (id) => {
                await api(`/projects/${id}`, { method: 'DELETE' });
                get().fetchProjects();
            },

            // Auth
            login: async (email, password) => {
                try {
                    const data = await api('/auth/login', {
                        method: 'POST',
                        body: JSON.stringify({ email, password }),
                    });
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('user', JSON.stringify(data.user));
                    set({ user: data.user, isAuthenticated: true, error: null }); // Re-added isAuthenticated for consistency
                    return true;
                } catch (error) {
                    set({ error: error.message });
                    return false;
                }
            },

            logout: () => {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                set({ user: null, isAuthenticated: false, dashboardStats: null, leads: [], followUps: [] }); // Re-added isAuthenticated for consistency
            },

            // Leads
            fetchLeads: async (filters = {}) => {
                set({ isLoading: true }); // Keep original isLoading behavior
                try {
                    const queryParams = new URLSearchParams(filters).toString();
                    const leads = await api(`/leads?${queryParams}`);
                    set({ leads, isLoading: false }); // Keep original isLoading behavior
                } catch (error) {
                    set({ error: error.message, isLoading: false }); // Keep original isLoading behavior
                }
            },

            fetchWarmLeads: async () => {
                try {
                    const leads = await api('/leads?escalated=1');
                    set({ warmLeads: leads });
                } catch (error) {
                    console.error('Failed to fetch warm leads:', error);
                }
            },

            // Clients
            clients: [],
            fetchClients: async (search = '') => {
                try {
                    const query = search ? `?search=${search}` : '';
                    const clients = await api(`/clients${query}`);
                    set({ clients });
                } catch (error) {
                    console.error('Failed to fetch clients:', error);
                }
            },

            createClient: async (data) => {
                try {
                    await api('/clients', {
                        method: 'POST',
                        body: JSON.stringify(data),
                    });
                    get().fetchClients();
                } catch (error) {
                    set({ error: error.message });
                    throw error;
                }
            },

            deleteClient: async (id) => {
                try {
                    await api(`/clients/${id}`, { method: 'DELETE' });
                    get().fetchClients();
                } catch (error) {
                    set({ error: error.message });
                }
            },

            updateClient: async (id, data) => {
                try {
                    await api(`/clients/${id}`, {
                        method: 'PUT',
                        body: JSON.stringify(data)
                    });
                    get().fetchClients();
                } catch (error) {
                    set({ error: error.message });
                    throw error;
                }
            },

            deleteLead: async (id) => {
                try {
                    await api(`/leads/${id}`, { method: 'DELETE' });
                    get().fetchLeads();
                    get().fetchWarmLeads();
                } catch (error) {
                    set({ error: error.message });
                }
            },

            // Lead Workflows
            convertLeadToClient: async (id, dealData = {}) => {
                try {
                    await api(`/leads/${id}/convert-client`, {
                        method: 'PUT',
                        body: JSON.stringify(dealData)
                    });
                    // Refresh all lists
                    get().fetchLeads();
                    get().fetchWarmLeads();
                    get().fetchClients();
                } catch (error) {
                    set({ error: error.message });
                }
            },

            rejectLead: async (id) => {
                try {
                    await api(`/leads/${id}/reject`, { method: 'PATCH' });
                    // Refresh lists
                    get().fetchLeads();
                    get().fetchWarmLeads();
                } catch (error) {
                    set({ error: error.message });
                }
            },

            restoreLead: async (id) => {
                try {
                    await api(`/leads/${id}/restore`, { method: 'PATCH' });
                    // Refresh archived leads list and warm leads
                    get().fetchLeads({ archived: '1' });
                    get().fetchWarmLeads();
                } catch (error) {
                    set({ error: error.message });
                }
            },

            // Inventory (Properties)
            inventory: [],
            fetchInventory: async () => {
                try {
                    const items = await api('/inventory');
                    set({ inventory: items });
                } catch (error) {
                    console.error('Failed to fetch inventory:', error);
                }
            },

            addInventory: async (data) => {
                try {
                    await api('/inventory', {
                        method: 'POST',
                        body: JSON.stringify(data)
                    });
                    get().fetchInventory();
                    return true;
                } catch (error) {
                    set({ error: error.message });
                    throw error;
                }
            },

            updateInventory: async (id, data) => {
                try {
                    await api(`/inventory/${id}`, {
                        method: 'PUT',
                        body: JSON.stringify(data)
                    });
                    get().fetchInventory();
                    return true;
                } catch (error) {
                    set({ error: error.message });
                    throw error;
                }
            },

            deleteInventory: async (id) => {
                try {
                    await api(`/inventory/${id}`, { method: 'DELETE' });
                    get().fetchInventory();
                    return true;
                } catch (error) {
                    set({ error: error.message });
                    throw error;
                }
            },

            // Site Visits
            visits: [],
            fetchVisits: async (fromDate, toDate) => {
                try {
                    let url = '/visits';
                    const params = [];
                    if (fromDate) params.push(`from_date=${fromDate}`);
                    if (toDate) params.push(`to_date=${toDate}`);
                    if (params.length) url += '?' + params.join('&');

                    const visits = await api(url);
                    set({ visits });
                } catch (error) {
                    console.error('Failed to fetch visits:', error);
                }
            },

            scheduleVisit: async (data) => {
                try {
                    await api('/visits', {
                        method: 'POST',
                        body: JSON.stringify(data),
                    });
                    get().fetchVisits();
                    return true;
                } catch (error) {
                    set({ error: error.message });
                    throw error;
                }
            },

            completeVisit: async (id) => {
                try {
                    await api(`/visits/${id}/status`, {
                        method: 'PATCH',
                        body: JSON.stringify({ status: 'completed' }),
                    });
                    // Optimistically remove from the list
                    set(state => ({
                        visits: state.visits.filter(v => v.id !== id)
                    }));
                } catch (error) {
                    set({ error: error.message });
                    throw error;
                }
            },

            createLead: async (leadData) => {
                const tempId = Date.now();
                const optimisticLead = { ...leadData, id: tempId, status: 'new', created_at: new Date().toISOString() };

                // SPEED: Optimistic update - show immediately
                set(state => ({ leads: [optimisticLead, ...state.leads], isModalOpen: false }));

                try {
                    const result = await api('/leads', {
                        method: 'POST',
                        body: JSON.stringify(leadData),
                    });
                    // Replace temp with real ID
                    set(state => ({
                        leads: state.leads.map(l => l.id === tempId ? { ...l, id: result.id } : l)
                    }));
                    return result;
                } catch (error) {
                    // Rollback on failure
                    set(state => ({
                        leads: state.leads.filter(l => l.id !== tempId),
                        error: error.message
                    }));
                    throw error;
                }
            },

            updateLead: async (id, updates) => {
                const originalLeads = get().leads;

                // SPEED: Optimistic update
                set(state => ({
                    leads: state.leads.map(l => l.id === id ? { ...l, ...updates } : l)
                }));

                try {
                    await api(`/leads/${id}`, {
                        method: 'PUT',
                        body: JSON.stringify(updates),
                    });
                } catch (error) {
                    // Rollback on failure
                    set({ leads: originalLeads, error: error.message });
                    throw error;
                }
            },

            updateLeadStatus: async (id, status, notes = null) => {
                const originalLeads = get().leads;
                const userId = get().user?.id || 1;

                // SPEED: Optimistic update
                set(state => ({
                    leads: state.leads.map(l => l.id === id ? { ...l, status } : l)
                }));

                try {
                    await api(`/leads/${id}/status`, {
                        method: 'PATCH',
                        body: JSON.stringify({ status, notes, user_id: userId }),
                    });
                } catch (error) {
                    set({ leads: originalLeads, error: error.message });
                    throw error;
                }
            },

            deleteLead: async (id) => {
                const originalLeads = get().leads;

                set(state => ({
                    leads: state.leads.filter(l => l.id !== id)
                }));

                try {
                    await api(`/leads/${id}`, { method: 'DELETE' });
                    // Refresh stats to remove ghost counts
                    get().fetchDashboard();
                    get().fetchWarmLeads();
                    // Also refresh visits if the deleted lead had one
                    if (get().user?.role === 'admin') {
                        const today = new Date().toISOString().split('T')[0];
                        const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
                        get().fetchVisits(today, tomorrow);
                    }
                } catch (error) {
                    set({ leads: originalLeads, error: error.message });
                    throw error;
                }
            },

            // Dashboard
            fetchDashboard: async () => {
                set({ isLoading: true });
                try {
                    const stats = await api('/dashboard');
                    set({ dashboardStats: stats, isLoading: false });
                } catch (error) {
                    set({ error: error.message, isLoading: false });
                }
            },

            // Sources
            fetchSources: async () => {
                try {
                    const sources = await api('/sources');
                    set({ sources });
                } catch (error) {
                    console.error('Failed to fetch sources:', error);
                }
            },

            // Follow-ups
            fetchFollowUps: async (pending = true) => {
                try {
                    const followUps = await api(`/followups?pending=${pending}`);
                    set({ followUps });
                } catch (error) {
                    set({ error: error.message });
                }
            },

            createFollowUp: async (data) => {
                try {
                    const result = await api('/followups', {
                        method: 'POST',
                        body: JSON.stringify(data),
                    });
                    get().fetchFollowUps();
                    return result;
                } catch (error) {
                    set({ error: error.message });
                    throw error;
                }
            },

            completeFollowUp: async (id, outcomeData = {}) => {
                try {
                    await api(`/followups/${id}/complete`, {
                        method: 'PATCH',
                        body: JSON.stringify(outcomeData)
                    });
                    set(state => ({
                        followUps: state.followUps.filter(f => f.id !== id)
                    }));

                    // If rescheduled, fetch follow-ups again to show the new one
                    if (outcomeData.outcome === 'try_again' || outcomeData.outcome === 'rescheduled') {
                        get().fetchFollowUps();
                    }
                    // If escalated or rejected, fetch leads to update status if on leads page
                    if (outcomeData.outcome === 'escalated' || outcomeData.outcome === 'rejected') {
                        get().fetchLeads();
                    }
                } catch (error) {
                    set({ error: error.message });
                }
            },

            // Users for assignment
            fetchUsers: async () => {
                try {
                    const users = await api('/users');
                    set({ users });
                } catch (error) {
                    console.error('Failed to fetch users:', error);
                }
            },

            deleteUser: async (id) => {
                try {
                    await api(`/users/${id}`, { method: 'DELETE' });
                    // Optimistic update
                    set(state => ({
                        users: state.users.filter(u => u.id !== id)
                    }));
                } catch (error) {
                    set({ error: error.message });
                    throw error;
                }
            },

            registerUser: async (userData) => {
                try {
                    await api('/auth/register', {
                        method: 'POST',
                        body: JSON.stringify(userData)
                    });
                    // Refresh users list
                    get().fetchUsers();
                } catch (error) {
                    set({ error: error.message });
                    throw error;
                }
            },

            // WhatsApp Broadcast State & Actions
            whatsappRecipients: null,
            whatsappCampaigns: [],

            fetchWhatsAppRecipients: async (type = 'all', status = '', search = '') => {
                try {
                    let url = `/whatsapp/recipients?type=${type}`;
                    if (status) url += `&status=${status}`;
                    if (search) url += `&search=${encodeURIComponent(search)}`;

                    const data = await api(url);
                    set({ whatsappRecipients: data });
                } catch (error) {
                    console.error('Failed to fetch WhatsApp recipients:', error);
                }
            },

            sendWhatsAppBroadcast: async (broadcastData) => {
                const data = await api('/whatsapp/broadcast', {
                    method: 'POST',
                    body: JSON.stringify(broadcastData),
                });
                return data;
            },

            sendWhatsAppMessage: async (messageData) => {
                const data = await api('/whatsapp/send', {
                    method: 'POST',
                    body: JSON.stringify(messageData),
                });
                return data;
            },

            fetchWhatsAppCampaigns: async () => {
                try {
                    const campaigns = await api('/whatsapp/campaigns');
                    set({ whatsappCampaigns: campaigns });
                } catch (error) {
                    console.error('Failed to fetch WhatsApp campaigns:', error);
                }
            },

            fetchWhatsAppCampaignDetail: async (id) => {
                const detail = await api(`/whatsapp/campaigns/${id}`);
                return detail;
            },

            // WhatsApp Template Management
            whatsappTemplates: [],

            uploadTemplateImage: async (imageFile) => {
                const token = localStorage.getItem('token');
                const formData = new FormData();
                formData.append('image', imageFile);

                const url = `${API_BASE_URL}/api/v1/whatsapp/templates/upload-image`;
                const res = await fetch(url, {
                    method: 'POST',
                    headers: {
                        ...(token && { Authorization: `Bearer ${token}` }),
                    },
                    body: formData,
                });

                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.error || 'Failed to upload image');
                }

                const data = await res.json();
                return data.headerHandle;
            },

            createWhatsAppTemplate: async (templateData) => {
                const data = await api('/whatsapp/templates', {
                    method: 'POST',
                    body: JSON.stringify(templateData),
                });
                return data;
            },

            fetchWhatsAppTemplates: async () => {
                try {
                    const templates = await api('/whatsapp/templates');
                    set({ whatsappTemplates: templates });
                    return templates;
                } catch (error) {
                    console.error('Failed to fetch WhatsApp templates:', error);
                    return [];
                }
            },

            deleteWhatsAppTemplate: async (templateName) => {
                await api(`/whatsapp/templates/${encodeURIComponent(templateName)}`, {
                    method: 'DELETE',
                });
                // Refresh templates list
                get().fetchWhatsAppTemplates();
            },

            // UI actions
            setCurrentView: (view) => set({ currentView: view }),
            setSelectedLead: (lead) => set({ selectedLead: lead }),
            openModal: () => set({ isModalOpen: true }),
            closeModal: () => set({ isModalOpen: false, selectedLead: null }),
            clearError: () => set({ error: null }),
        }),
        {
            name: 'crm-mahalaxmi-storage',
            // RELIABILITY: Only persist essential data
            partialize: (state) => ({
                user: state.user,
                isAuthenticated: state.isAuthenticated,
                currentView: state.currentView,
            }),
        }
    )
);
