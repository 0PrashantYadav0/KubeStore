import { useState, useEffect, useCallback } from 'react'
import { fetchStores, createStore, deleteStore } from './api/stores'

function App() {
    const [stores, setStores] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [showModal, setShowModal] = useState(false)
    const [newStoreName, setNewStoreName] = useState('')
    const [newStoreEngine, setNewStoreEngine] = useState('medusa')
    const [creating, setCreating] = useState(false)
    const [deletingId, setDeletingId] = useState(null)

    const loadStores = useCallback(async () => {
        try {
            const data = await fetchStores()
            setStores(data.stores || [])
            setError(null)
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadStores()
        // Poll for updates every 5 seconds
        const interval = setInterval(loadStores, 5000)
        return () => clearInterval(interval)
    }, [loadStores])

    const handleCreateStore = async (e) => {
        e.preventDefault()
        if (!newStoreName.trim()) return

        setCreating(true)
        try {
            await createStore(newStoreName.trim(), newStoreEngine)
            setNewStoreName('')
            setNewStoreEngine('medusa')
            setShowModal(false)
            loadStores()
        } catch (err) {
            setError(err.message)
        } finally {
            setCreating(false)
        }
    }

    const handleDeleteStore = async (id) => {
        if (!confirm('Are you sure you want to delete this store?')) return

        setDeletingId(id)
        try {
            await deleteStore(id)
            loadStores()
        } catch (err) {
            setError(err.message)
        } finally {
            setDeletingId(null)
        }
    }

    const stats = {
        total: stores.length,
        ready: stores.filter(s => s.status === 'ready').length,
        provisioning: stores.filter(s => s.status === 'provisioning').length,
    }

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleString()
    }

    return (
        <div className="app">
            {/* Header */}
            <header className="header">
                <div className="header-logo">
                    <div className="header-logo-icon">⚡</div>
                    <div>
                        <div className="header-title">KubeStore</div>
                        <div className="header-subtitle">Store Provisioning Platform</div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="main">
                {/* Stats Bar */}
                <div className="stats-bar">
                    <div className="stat-card">
                        <div className="stat-label">Total Stores</div>
                        <div className="stat-value primary">{stats.total}</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">Ready</div>
                        <div className="stat-value success">{stats.ready}</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">Provisioning</div>
                        <div className="stat-value warning">{stats.provisioning}</div>
                    </div>
                </div>

                {/* Error Banner */}
                {error && (
                    <div className="error-banner">
                        <span className="error-banner-message">⚠️ {error}</span>
                        <button className="btn btn-secondary" onClick={() => setError(null)}>
                            Dismiss
                        </button>
                    </div>
                )}

                {/* Toolbar */}
                <div className="toolbar">
                    <h2 className="toolbar-title">Your Stores</h2>
                    <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                        <span>+</span> Create Store
                    </button>
                </div>

                {/* Store List */}
                {loading ? (
                    <div className="empty-state">
                        <span className="loader" />
                        <p style={{ marginTop: '1rem' }}>Loading stores...</p>
                    </div>
                ) : stores.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">🏪</div>
                        <h3 className="empty-state-title">No stores yet</h3>
                        <p className="empty-state-description">
                            Create your first e-commerce store to get started
                        </p>
                        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                            <span>+</span> Create Store
                        </button>
                    </div>
                ) : (
                    <div className="store-grid">
                        {stores.map((store) => (
                            <div key={store.id} className="store-card">
                                <div className="store-card-header">
                                    <div>
                                        <div className="store-name">{store.name}</div>
                                        <div className="store-id">ID: {store.id}</div>
                                    </div>
                                    <span className={`status-badge ${store.status}`}>
                                        {store.status}
                                    </span>
                                </div>

                                <div className="store-details">
                                    {store.engine && (
                                        <div className="store-detail">
                                            <span className="store-detail-label">Engine</span>
                                            <span className="store-detail-value">{store.engine}</span>
                                        </div>
                                    )}
                                    <div className="store-detail">
                                        <span className="store-detail-label">Created</span>
                                        <span className="store-detail-value">
                                            {formatDate(store.created_at)}
                                        </span>
                                    </div>
                                    {store.url && (
                                        <div className="store-detail">
                                            <span className="store-detail-label">URL</span>
                                            <a
                                                href={store.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="store-url"
                                            >
                                                {store.url}
                                            </a>
                                        </div>
                                    )}
                                    {store.admin_url && (
                                        <div className="store-detail">
                                            <span className="store-detail-label">Admin</span>
                                            <a
                                                href={store.admin_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="store-url"
                                            >
                                                {store.admin_url}
                                            </a>
                                        </div>
                                    )}
                                    {store.fail_reason && (
                                        <div className="store-detail">
                                            <span className="store-detail-label">Error</span>
                                            <span className="store-detail-value" style={{ color: 'var(--color-error)' }}>
                                                {store.fail_reason}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                <div className="store-actions">
                                    {store.url && (
                                        <a
                                            href={store.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="btn btn-secondary"
                                        >
                                            Open Store
                                        </a>
                                    )}
                                    <button
                                        className="btn btn-danger"
                                        onClick={() => handleDeleteStore(store.id)}
                                        disabled={deletingId === store.id || store.status === 'deleting'}
                                    >
                                        {deletingId === store.id ? (
                                            <span className="loader" />
                                        ) : (
                                            'Delete'
                                        )}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>

            {/* Create Store Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <h3 className="modal-title">Create New Store</h3>
                        <form onSubmit={handleCreateStore}>
                            <div className="form-group">
                                <label className="form-label" htmlFor="storeName">
                                    Store Name
                                </label>
                                <input
                                    id="storeName"
                                    type="text"
                                    className="form-input"
                                    placeholder="My Awesome Store"
                                    value={newStoreName}
                                    onChange={(e) => setNewStoreName(e.target.value)}
                                    minLength={3}
                                    maxLength={50}
                                    required
                                    autoFocus
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label" htmlFor="storeEngine">
                                    Engine
                                </label>
                                <select
                                    id="storeEngine"
                                    className="form-input"
                                    value={newStoreEngine}
                                    onChange={(e) => setNewStoreEngine(e.target.value)}
                                >
                                    <option value="medusa">Medusa</option>
                                    <option value="woocommerce">WooCommerce (stub)</option>
                                </select>
                            </div>
                            <div className="modal-actions">
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setShowModal(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={creating || !newStoreName.trim()}
                                >
                                    {creating ? (
                                        <>
                                            <span className="loader" /> Creating...
                                        </>
                                    ) : (
                                        'Create Store'
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}

export default App
