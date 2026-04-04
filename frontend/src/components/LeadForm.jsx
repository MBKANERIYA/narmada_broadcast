import { useState, useEffect } from 'preact/hooks';
import { useStore, LEAD_STATUSES } from '../stores/store';

/**
 * Lead Form Modal
 * RELIABILITY: Form validation before submit
 * SPEED: Optimistic updates close modal immediately
 */
export default function LeadForm() {
    const {
        selectedLead, closeModal, createLead, updateLead, deleteLead,
        sources, users, user
    } = useStore();

    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        email: '',
        budget_min: '',
        budget_min_unit: 'L',
        budget_max: '',
        budget_max_unit: 'L',
        location: '',
        interest: '',
        motive_to_buy: '',
        contact_person: '',
        source: '',
        status: 'new',
        assigned_to: '',
    });

    const [isSubmitting, setIsSubmitting] = useState(false);

    const getBudgetBreakdown = (value) => {
        if (!value) return { val: '', unit: 'L' };
        if (value >= 10000000 && value % 100000 === 0) {
            return { val: String(value / 10000000), unit: 'Cr' };
        }
        return { val: String(value / 100000), unit: 'L' };
    };

    // Populate form when editing OR set contact_person when adding new
    useEffect(() => {
        if (selectedLead) {
            const minBudget = getBudgetBreakdown(selectedLead.budget_min);
            const maxBudget = getBudgetBreakdown(selectedLead.budget_max);

            setFormData({
                name: selectedLead.name || '',
                phone: selectedLead.phone || '',
                email: selectedLead.email || '',
                budget_min: minBudget.val,
                budget_min_unit: minBudget.unit,
                budget_max: maxBudget.val,
                budget_max_unit: maxBudget.unit,
                location: selectedLead.location || '',
                interest: selectedLead.interest || '',
                motive_to_buy: selectedLead.motive_to_buy || '',
                contact_person: selectedLead.contact_person || '',
                source: selectedLead.source_name || selectedLead.source || '',
                status: selectedLead.status || 'new',
                assigned_to: selectedLead.assigned_to || '',
            });
        } else {
            // New lead - auto-fill contact_person with logged-in user's name
            setFormData(prev => ({ ...prev, contact_person: user?.name || '' }));
        }
    }, [selectedLead, user]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            const data = {
                ...formData,
                budget_min: formData.budget_min ? parseFloat(formData.budget_min) * (formData.budget_min_unit === 'Cr' ? 10000000 : 100000) : null,
                budget_max: formData.budget_max ? parseFloat(formData.budget_max) * (formData.budget_max_unit === 'Cr' ? 10000000 : 100000) : null,
                assigned_to: formData.assigned_to ? parseInt(formData.assigned_to) : null,
            };

            if (selectedLead) {
                await updateLead(selectedLead.id, data);
            } else {
                await createLead(data);
            }
            closeModal();
        } catch (error) {
            console.error('Failed to save lead:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (confirm('Are you sure you want to delete this lead?')) {
            await deleteLead(selectedLead.id);
            closeModal();
        }
    };

    // Delhi NCR locations for quick selection
    const locations = [
        'Gurugram', 'Noida', 'Delhi', 'Faridabad', 'Ghaziabad',
        'Greater Noida', 'Dwarka', 'South Delhi', 'North Delhi'
    ];

    return (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
            <div className="modal" style={{ maxWidth: '600px' }}>
                <div className="modal-header">
                    <h2 className="modal-title">{selectedLead ? 'Edit Lead' : 'Add New Lead'}</h2>
                    <button className="btn-icon" onClick={closeModal}>✕</button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        {/* Basic Info */}
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Name *</label>
                                <input
                                    type="text"
                                    name="name"
                                    className="form-input"
                                    value={formData.name}
                                    onInput={handleChange}
                                    placeholder="Full name"
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Phone</label>
                                <input
                                    type="tel"
                                    name="phone"
                                    className="form-input"
                                    value={formData.phone}
                                    onInput={handleChange}
                                    placeholder="+91 9876543210"
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Email</label>
                            <input
                                type="email"
                                name="email"
                                className="form-input"
                                value={formData.email}
                                onInput={handleChange}
                                placeholder="email@example.com"
                            />
                        </div>

                        {/* Budget - in Lakhs/Crores */}
                        <div className="form-row">
                            <div className="form-group">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                    <label className="form-label" style={{ marginBottom: 0 }}>Budget Min</label>
                                    <select
                                        name="budget_min_unit"
                                        className="form-select"
                                        style={{ width: 'auto', padding: '2px 24px 2px 8px', fontSize: '12px', height: '24px', lineHeight: '1' }}
                                        value={formData.budget_min_unit}
                                        onChange={handleChange}
                                    >
                                        <option value="L">Lakhs</option>
                                        <option value="Cr">Crores</option>
                                    </select>
                                </div>
                                <input
                                    type="number"
                                    name="budget_min"
                                    className="form-input"
                                    value={formData.budget_min}
                                    onInput={handleChange}
                                    placeholder="e.g., 50"
                                    min="0"
                                    step="any"
                                />
                            </div>
                            <div className="form-group">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                    <label className="form-label" style={{ marginBottom: 0 }}>Budget Max</label>
                                    <select
                                        name="budget_max_unit"
                                        className="form-select"
                                        style={{ width: 'auto', padding: '2px 24px 2px 8px', fontSize: '12px', height: '24px', lineHeight: '1' }}
                                        value={formData.budget_max_unit}
                                        onChange={handleChange}
                                    >
                                        <option value="L">Lakhs</option>
                                        <option value="Cr">Crores</option>
                                    </select>
                                </div>
                                <input
                                    type="number"
                                    name="budget_max"
                                    className="form-input"
                                    value={formData.budget_max}
                                    onInput={handleChange}
                                    placeholder="e.g., 100"
                                    min="0"
                                    step="any"
                                />
                            </div>
                        </div>

                        {/* Location and Interest - with custom entry support */}
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Location</label>
                                <input
                                    type="text"
                                    name="location"
                                    className="form-input"
                                    value={formData.location}
                                    onInput={handleChange}
                                    placeholder="Type or select location"
                                    list="location-options"
                                />
                                <datalist id="location-options">
                                    {locations.map(loc => (
                                        <option key={loc} value={loc} />
                                    ))}
                                </datalist>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Interest</label>
                                <input
                                    type="text"
                                    name="interest"
                                    className="form-input"
                                    value={formData.interest}
                                    onInput={handleChange}
                                    placeholder="Type or select property type"
                                    list="interest-options"
                                />
                                <datalist id="interest-options">
                                    <option value="1 BHK" />
                                    <option value="2 BHK" />
                                    <option value="3 BHK" />
                                    <option value="4 BHK" />
                                    <option value="Villa" />
                                    <option value="Plot" />
                                    <option value="Commercial" />
                                    <option value="Penthouse" />
                                    <option value="Studio" />
                                </datalist>
                            </div>
                        </div>

                        {/* Motive to Buy - with custom entry support */}
                        <div className="form-group">
                            <label className="form-label">Motive to Buy</label>
                            <input
                                type="text"
                                name="motive_to_buy"
                                className="form-input"
                                value={formData.motive_to_buy}
                                onInput={handleChange}
                                placeholder="Type or select motive"
                                list="motive-options"
                            />
                            <datalist id="motive-options">
                                <option value="Investment" />
                                <option value="Self Use" />
                                <option value="Relocation" />
                                <option value="Upgrade" />
                                <option value="First Home" />
                                <option value="Rental Income" />
                                <option value="Office Space" />
                            </datalist>
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Submitted By</label>
                                <input
                                    type="text"
                                    name="contact_person"
                                    className="form-input"
                                    value={formData.contact_person}
                                    readOnly
                                    style={{
                                        background: 'var(--bg-tertiary)',
                                        cursor: 'not-allowed',
                                        color: 'var(--text-muted)'
                                    }}
                                    title="Auto-filled with your name"
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Source</label>
                                <input
                                    type="text"
                                    name="source"
                                    className="form-input"
                                    value={formData.source}
                                    onInput={handleChange}
                                    placeholder="e.g., Facebook, Referral, Walk-in"
                                />
                            </div>
                        </div>

                        {/* Status and Assignment */}
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Status</label>
                                <select
                                    name="status"
                                    className="form-select"
                                    value={formData.status}
                                    onChange={handleChange}
                                >
                                    {LEAD_STATUSES.map(s => (
                                        <option key={s.id} value={s.id}>{s.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Assign To</label>
                                <select
                                    name="assigned_to"
                                    className="form-select"
                                    value={formData.assigned_to}
                                    onChange={handleChange}
                                >
                                    <option value="">Unassigned</option>
                                    {users.map(user => (
                                        <option key={user.id} value={user.id}>{user.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="modal-footer">
                        {selectedLead && (
                            <button type="button" className="btn btn-danger" onClick={handleDelete}>
                                Delete
                            </button>
                        )}
                        <div style={{ flex: 1 }} />
                        <button type="button" className="btn btn-secondary" onClick={closeModal}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                            {isSubmitting ? 'Saving...' : selectedLead ? 'Update Lead' : 'Create Lead'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
