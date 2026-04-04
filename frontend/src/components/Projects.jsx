import { useEffect, useState } from 'preact/hooks';
import { useStore } from '../stores/store';

/**
 * Projects Component
 * Manages real estate projects/buildings with unit type tracking
 */

const UNIT_TYPES = ['1BHK', '2BHK', '3BHK', '4BHK', 'Studio', 'Penthouse', 'Shop', 'Office', 'Plot'];

export default function Projects() {
    const { projects, fetchProjects, createProject, updateProject, deleteProject, isLoading, user, showToast } = useStore();
    const [showModal, setShowModal] = useState(false);
    const [editingProject, setEditingProject] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [formData, setFormData] = useState({
        name: '',
        location: '',
        builder: '',
        description: '',
        unit_types: {}
    });

    const isAdmin = user?.role === 'admin';

    useEffect(() => {
        fetchProjects();
    }, []);

    const resetForm = () => {
        setFormData({
            name: '',
            location: '',
            builder: '',
            description: '',
            unit_types: {}
        });
        setEditingProject(null);
    };

    const openAddModal = () => {
        resetForm();
        setShowModal(true);
    };

    const openEditModal = (project) => {
        setEditingProject(project);
        setFormData({
            name: project.name,
            location: project.location || '',
            builder: project.builder || '',
            description: project.description || '',
            unit_types: project.unit_types ? (typeof project.unit_types === 'string' ? JSON.parse(project.unit_types) : project.unit_types) : {}
        });
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.name.trim()) {
            showToast('Project name is required', 'error');
            return;
        }

        try {
            const total_units = Object.values(formData.unit_types).reduce((sum, count) => sum + (parseInt(count) || 0), 0);
            const projectData = { ...formData, total_units };

            if (editingProject) {
                await updateProject(editingProject.id, projectData);
                showToast('Project updated', 'success');
            } else {
                await createProject(projectData);
                showToast('Project created', 'success');
            }
            setShowModal(false);
            resetForm();
        } catch (error) {
            showToast('Failed to save project', 'error');
        }
    };

    const handleDelete = async (id) => {
        if (confirm('Delete this project?')) {
            try {
                await deleteProject(id);
                showToast('Project deleted', 'success');
            } catch (error) {
                showToast('Failed to delete', 'error');
            }
        }
    };

    const updateUnitCount = (type, value) => {
        setFormData(prev => ({
            ...prev,
            unit_types: {
                ...prev.unit_types,
                [type]: Math.max(0, parseInt(value) || 0)
            }
        }));
    };

    const filteredProjects = projects.filter(p =>
        p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.builder?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const getTotalUnits = (project) => {
        const types = project.unit_types ? (typeof project.unit_types === 'string' ? JSON.parse(project.unit_types) : project.unit_types) : {};
        return Object.values(types).reduce((sum, count) => sum + (parseInt(count) || 0), 0);
    };

    const getUnitTypesDisplay = (project) => {
        const types = project.unit_types ? (typeof project.unit_types === 'string' ? JSON.parse(project.unit_types) : project.unit_types) : {};
        return Object.entries(types)
            .filter(([_, count]) => count > 0)
            .map(([type, count]) => `${type}: ${count}`)
            .join(' • ') || 'No units defined';
    };

    return (
        <div className="content-section">
            {/* Header */}
            <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 'var(--space-6)',
                gap: 'var(--space-4)'
            }}>
                <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: '700', margin: 0 }}>
                    🏗️ Projects
                </h1>
                <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
                    <input
                        type="text"
                        className="form-input"
                        placeholder="Search projects..."
                        value={searchTerm}
                        onInput={(e) => setSearchTerm(e.target.value)}
                        style={{ width: '200px' }}
                    />
                    <button className="btn btn-primary" onClick={openAddModal}>
                        + Add Project
                    </button>
                </div>
            </div>

            {/* Projects Grid */}
            {isLoading && projects.length === 0 ? (
                <div className="loading" />
            ) : filteredProjects.length === 0 ? (
                <div className="card full-width" style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
                    <div style={{ fontSize: '48px', marginBottom: 'var(--space-4)' }}>🏗️</div>
                    <h2>No Projects Yet</h2>
                    <p style={{ color: 'var(--text-muted)' }}>Add your first project to track buildings and units.</p>
                </div>
            ) : (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                    gap: 'var(--space-4)'
                }}>
                    {filteredProjects.map(project => (
                        <div key={project.id} className="card" style={{ padding: 'var(--space-4)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-3)' }}>
                                <div>
                                    <h3 style={{ marginBottom: '4px', fontSize: '16px' }}>{project.name}</h3>
                                    <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                                        {project.location && <span>📍 {project.location}</span>}
                                        {project.builder && <span style={{ marginLeft: '12px' }}>🏢 {project.builder}</span>}
                                    </div>
                                </div>
                                <div style={{
                                    background: 'var(--accent-primary)',
                                    color: 'white',
                                    padding: '4px 10px',
                                    borderRadius: 'var(--radius-md)',
                                    fontSize: '13px',
                                    fontWeight: '600'
                                }}>
                                    {getTotalUnits(project)} units
                                </div>
                            </div>

                            {/* Unit Types Display */}
                            <div style={{
                                background: 'var(--bg-tertiary)',
                                padding: 'var(--space-3)',
                                borderRadius: 'var(--radius-md)',
                                marginBottom: 'var(--space-3)',
                                fontSize: '12px'
                            }}>
                                {getUnitTypesDisplay(project)}
                            </div>

                            {project.description && (
                                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: 'var(--space-3)' }}>
                                    {project.description}
                                </p>
                            )}

                            {/* Actions */}
                            <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
                                <button className="btn btn-secondary btn-sm" onClick={() => openEditModal(project)}>
                                    ✏️ Edit
                                </button>
                                {isAdmin && (
                                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(project.id)}>
                                        🗑️
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
                    <div className="modal" style={{ maxWidth: '500px' }}>
                        <div className="modal-header">
                            <h2 className="modal-title">{editingProject ? 'Edit Project' : 'Add New Project'}</h2>
                            <button className="btn-icon" onClick={() => setShowModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Project Name *</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formData.name}
                                        onInput={(e) => setFormData(d => ({ ...d, name: e.target.value }))}
                                        placeholder="e.g., Skyline Residency"
                                        required
                                    />
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Location</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={formData.location}
                                            onInput={(e) => setFormData(d => ({ ...d, location: e.target.value }))}
                                            placeholder="e.g., Andheri West, Mumbai"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Builder</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={formData.builder}
                                            onInput={(e) => setFormData(d => ({ ...d, builder: e.target.value }))}
                                            placeholder="e.g., ABC Developers"
                                        />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Description</label>
                                    <textarea
                                        className="form-textarea"
                                        value={formData.description}
                                        onInput={(e) => setFormData(d => ({ ...d, description: e.target.value }))}
                                        placeholder="Brief description of the project..."
                                        rows={2}
                                    />
                                </div>

                                {/* Unit Types */}
                                <div className="form-group">
                                    <label className="form-label">Available Units per Type</label>
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(3, 1fr)',
                                        gap: 'var(--space-2)'
                                    }}>
                                        {UNIT_TYPES.map(type => (
                                            <div key={type} style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                background: 'var(--bg-tertiary)',
                                                padding: '6px 8px',
                                                borderRadius: 'var(--radius-sm)',
                                                fontSize: '13px'
                                            }}>
                                                <span style={{ flex: 1 }}>{type}</span>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={formData.unit_types[type] || 0}
                                                    onInput={(e) => updateUnitCount(type, e.target.value)}
                                                    style={{
                                                        width: '50px',
                                                        padding: '4px',
                                                        border: '1px solid var(--border-color)',
                                                        borderRadius: '4px',
                                                        textAlign: 'center'
                                                    }}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                    <div style={{ marginTop: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>
                                        Total: {Object.values(formData.unit_types).reduce((sum, c) => sum + (parseInt(c) || 0), 0)} units
                                    </div>
                                </div>
                            </div>

                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    {editingProject ? 'Update Project' : 'Create Project'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
