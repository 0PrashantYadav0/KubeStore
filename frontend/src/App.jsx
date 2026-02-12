import { useState, useEffect, useCallback } from 'react'
import {
    fetchStores, createStore, deleteStore, restartStore,
    getStoreHealth, getStorePods, getStoreLogs, getStoreEvents,
    getMetrics, getAuditLog
} from './api/stores'

// ─── Helpers ───────────────────────────────────────────────────
const formatDate = (d) => new Date(d).toLocaleString()
const timeAgo = (d) => {
    const s = Math.floor((Date.now() - new Date(d)) / 1000)
    if (s < 60) return `${s}s ago`
    if (s < 3600) return `${Math.floor(s / 60)}m ago`
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`
    return `${Math.floor(s / 86400)}d ago`
}

// ─── App ───────────────────────────────────────────────────────
function App() {
    const [stores, setStores] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [showModal, setShowModal] = useState(false)
    const [newStoreName, setNewStoreName] = useState('')
    const [newStoreEngine, setNewStoreEngine] = useState('medusa')
    const [creating, setCreating] = useState(false)
    const [deletingId, setDeletingId] = useState(null)
    const [activeTab, setActiveTab] = useState('stores') // stores | metrics | audit
    const [metrics, setMetrics] = useState(null)
    const [auditLog, setAuditLog] = useState([])
    const [selectedStore, setSelectedStore] = useState(null)
    const [storeDetail, setStoreDetail] = useState(null)
    const [detailTab, setDetailTab] = useState('overview') // overview | pods | logs | events

    // ─── Data fetching ─────────────────────────────────────────
    const loadStores = useCallback(async () => {
        try {
            const data = await fetchStores()
            // Sort stores by creation time (newest first)
            const sorted = (data.stores || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            setStores(sorted)
            setError(null)
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadStores()
        const interval = setInterval(loadStores, 5000)
        return () => clearInterval(interval)
    }, [loadStores])

    useEffect(() => {
        if (activeTab === 'metrics') {
            getMetrics().then(setMetrics)
        } else if (activeTab === 'audit') {
            getAuditLog().then(d => setAuditLog(d.entries || []))
        }
    }, [activeTab])

    // Load store detail when a store is selected
    useEffect(() => {
        if (!selectedStore) { setStoreDetail(null); return }
        const load = async () => {
            const [health, pods, events] = await Promise.all([
                getStoreHealth(selectedStore.id),
                getStorePods(selectedStore.id),
                getStoreEvents(selectedStore.id),
            ])
            setStoreDetail({ health, pods: pods?.pods || [], events: events?.events || [], logs: '' })
        }
        load()
    }, [selectedStore])

    const loadLogs = async (component) => {
        if (!selectedStore) return
        const data = await getStoreLogs(selectedStore.id, component, 100)
        setStoreDetail(prev => ({ ...prev, logs: data.logs || 'No logs available' }))
    }

    // ─── Actions ───────────────────────────────────────────────
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
        if (!confirm('Are you sure you want to delete this store? This will remove all data.')) return
        setDeletingId(id)
        try {
            await deleteStore(id)
            if (selectedStore?.id === id) setSelectedStore(null)
            loadStores()
        } catch (err) {
            setError(err.message)
        } finally {
            setDeletingId(null)
        }
    }

    const handleRestart = async (id) => {
        try {
            await restartStore(id)
            setError(null)
        } catch (err) {
            setError(err.message)
        }
    }

    const stats = {
        total: stores.length,
        ready: stores.filter(s => s.status === 'ready').length,
        provisioning: stores.filter(s => s.status === 'provisioning').length,
        failed: stores.filter(s => s.status === 'failed').length,
    }

    // ─── Render ────────────────────────────────────────────────
    return (
        <div className="app">
            {/* ── Header ── */}
            <header className="header">
                <div className="header-logo">
                    <div className="header-logo-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                    </div>
                    <div>
                        <div className="header-title">KubeStore</div>
                        <div className="header-subtitle">Store Provisioning Platform</div>
                    </div>
                </div>
                <nav className="header-nav">
                    {['stores', 'metrics', 'audit'].map(tab => (
                        <button
                            key={tab}
                            className={`nav-tab ${activeTab === tab ? 'active' : ''}`}
                            onClick={() => { setActiveTab(tab); setSelectedStore(null) }}
                        >
                            {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </button>
                    ))}
                </nav>
            </header>

            {/* ── Main ── */}
            <main className="main">
                {/* Error Banner */}
                {error && (
                    <div className="error-banner">
                        <span className="error-banner-message">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                                <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                            </svg>
                            {error}
                        </span>
                        <button className="btn btn-sm btn-secondary" onClick={() => setError(null)}>Dismiss</button>
                    </div>
                )}

                {activeTab === 'stores' && !selectedStore && (
                    <>
                        {/* Stats */}
                        <div className="stats-bar">
                            <div className="stat-card"><div className="stat-label">Total</div><div className="stat-value primary">{stats.total}</div></div>
                            <div className="stat-card"><div className="stat-label">Ready</div><div className="stat-value success">{stats.ready}</div></div>
                            <div className="stat-card"><div className="stat-label">Provisioning</div><div className="stat-value warning">{stats.provisioning}</div></div>
                            <div className="stat-card"><div className="stat-label">Failed</div><div className="stat-value error">{stats.failed}</div></div>
                        </div>

                        {/* Toolbar */}
                        <div className="toolbar">
                            <h2 className="toolbar-title">Your Stores</h2>
                            <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                                Create Store
                            </button>
                        </div>

                        {/* Store List */}
                        {loading ? (
                            <div className="empty-state"><span className="loader" /><p style={{ marginTop: '1rem' }}>Loading stores...</p></div>
                        ) : stores.length === 0 ? (
                            <div className="empty-state">
                                <div className="empty-state-icon">
                                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                                    </svg>
                                </div>
                                <h3 className="empty-state-title">No stores yet</h3>
                                <p className="empty-state-description">Create your first e-commerce store to get started</p>
                                <button className="btn btn-primary" onClick={() => setShowModal(true)}>Create Store</button>
                            </div>
                        ) : (
                            <div className="store-grid">
                                {stores.map((store) => (
                                    <div key={store.id} className="store-card" onClick={() => { setSelectedStore(store); setDetailTab('overview') }}>
                                        <div className="store-card-header">
                                            <div>
                                                <div className="store-name">{store.name}</div>
                                                <div className="store-id">{store.id} &middot; {store.engine || 'medusa'}</div>
                                            </div>
                                            <span className={`status-badge ${store.status}`}>
                                                {store.status === 'provisioning' && <span className="loader-tiny" />}
                                                {store.status}
                                            </span>
                                        </div>

                                        <div className="store-meta">
                                            <span className="store-meta-item">
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                                                {timeAgo(store.created_at)}
                                            </span>
                                            {store.url && (
                                                <a href={store.url} target="_blank" rel="noopener noreferrer" className="store-meta-item link" onClick={e => e.stopPropagation()}>
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                                                    Store
                                                </a>
                                            )}
                                            {store.admin_url && (
                                                <a href={store.admin_url} target="_blank" rel="noopener noreferrer" className="store-meta-item link" onClick={e => e.stopPropagation()}>
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                                    Admin
                                                </a>
                                            )}
                                        </div>

                                        {store.fail_reason && (
                                            <div className="store-error-msg">{store.fail_reason}</div>
                                        )}

                                        <div className="store-actions">
                                            <button className="btn btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); handleDeleteStore(store.id) }}
                                                disabled={deletingId === store.id || store.status === 'deleting'}>
                                                {deletingId === store.id ? <span className="loader-tiny" /> : 'Delete'}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {/* ── Store Detail Panel ── */}
                {activeTab === 'stores' && selectedStore && (
                    <div className="detail-panel">
                        <button className="btn btn-sm btn-secondary" onClick={() => setSelectedStore(null)}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
                            Back to stores
                        </button>
                        <div className="detail-header">
                            <div>
                                <h2 className="detail-title">{selectedStore.name}</h2>
                                <p className="detail-subtitle">{selectedStore.id} &middot; {selectedStore.engine || 'medusa'} &middot; Created {formatDate(selectedStore.created_at)}</p>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <span className={`status-badge ${selectedStore.status}`}>{selectedStore.status}</span>
                                {selectedStore.status === 'ready' && (
                                    <button className="btn btn-sm btn-secondary" onClick={() => handleRestart(selectedStore.id)}>Restart</button>
                                )}
                            </div>
                        </div>

                        <div className="detail-tabs">
                            {['overview', 'pods', 'logs', 'events'].map(t => (
                                <button key={t} className={`detail-tab ${detailTab === t ? 'active' : ''}`} onClick={() => { setDetailTab(t); if (t === 'logs') loadLogs((selectedStore.engine || 'medusa') === 'woocommerce' ? 'wordpress' : 'medusa') }}>
                                    {t.charAt(0).toUpperCase() + t.slice(1)}
                                </button>
                            ))}
                        </div>

                        {detailTab === 'overview' && storeDetail && (
                            <div className="detail-content">
                                <div className="detail-section">
                                    <h4 className="detail-section-title">Health Status</h4>
                                    {storeDetail.health ? (
                                        <div className="health-grid">
                                            {(selectedStore.engine || 'medusa') === 'medusa' ? (
                                                <>
                                                    <div className={`health-item ${storeDetail.health.medusa_status === 'healthy' ? 'ok' : 'bad'}`}>
                                                        <span className="health-dot" /> Medusa: {storeDetail.health.medusa_status}
                                                    </div>
                                                    <div className={`health-item ${storeDetail.health.storefront_ok ? 'ok' : 'bad'}`}>
                                                        <span className="health-dot" /> Storefront: {storeDetail.health.storefront_ok ? 'Ready' : 'Not Ready'}
                                                    </div>
                                                    <div className={`health-item ${storeDetail.health.redis_ok ? 'ok' : 'bad'}`}>
                                                        <span className="health-dot" /> Redis: {storeDetail.health.redis_ok ? 'Ready' : 'Not Ready'}
                                                    </div>
                                                    <div className={`health-item ${storeDetail.health.postgres_ok ? 'ok' : 'bad'}`}>
                                                        <span className="health-dot" /> PostgreSQL: {storeDetail.health.postgres_ok ? 'Ready' : 'Not Ready'}
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <div className={`health-item ${storeDetail.health.wordpress_status === 'healthy' ? 'ok' : 'bad'}`}>
                                                        <span className="health-dot" /> WordPress: {storeDetail.health.wordpress_status || 'unknown'}
                                                    </div>
                                                    <div className={`health-item ${storeDetail.health.mariadb_ok ? 'ok' : 'bad'}`}>
                                                        <span className="health-dot" /> MariaDB: {storeDetail.health.mariadb_ok ? 'Ready' : 'Not Ready'}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    ) : <p className="text-muted">Loading health...</p>}
                                </div>
                                <div className="detail-section">
                                    <h4 className="detail-section-title">Links</h4>
                                    <div className="link-grid">
                                        {selectedStore.url && <a href={selectedStore.url} target="_blank" rel="noopener noreferrer" className="link-card">{(selectedStore.engine || 'medusa') === 'woocommerce' ? 'WordPress Site' : 'Storefront'}</a>}
                                        {selectedStore.admin_url && <a href={selectedStore.admin_url} target="_blank" rel="noopener noreferrer" className="link-card">{(selectedStore.engine || 'medusa') === 'woocommerce' ? 'WP Admin' : 'Admin Panel'}</a>}
                                    </div>
                                </div>
                            </div>
                        )}

                        {detailTab === 'pods' && storeDetail && (
                            <div className="detail-content">
                                <table className="data-table">
                                    <thead><tr><th>Pod</th><th>Component</th><th>Status</th><th>Ready</th><th>Restarts</th></tr></thead>
                                    <tbody>
                                        {storeDetail.pods.map((pod, i) => (
                                            <tr key={i}>
                                                <td className="font-mono text-xs">{pod.name}</td>
                                                <td><span className="component-badge">{pod.component}</span></td>
                                                <td><span className={`status-dot ${pod.status === 'Running' ? 'green' : 'yellow'}`} /> {pod.status}</td>
                                                <td>{pod.ready === 'true' ? 'Yes' : 'No'}</td>
                                                <td>{pod.restarts}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {detailTab === 'logs' && storeDetail && (
                            <div className="detail-content">
                                <div className="logs-toolbar">
                                    {((selectedStore.engine || 'medusa') === 'woocommerce'
                                        ? ['wordpress', 'mariadb']
                                        : ['medusa', 'storefront', 'redis', 'postgresql']
                                    ).map(c => (
                                        <button key={c} className="btn btn-sm btn-secondary" onClick={() => loadLogs(c)}>{c}</button>
                                    ))}
                                </div>
                                <pre className="logs-viewer">{storeDetail.logs || 'Select a component to view logs'}</pre>
                            </div>
                        )}

                        {detailTab === 'events' && storeDetail && (
                            <div className="detail-content">
                                <div className="events-list">
                                    {storeDetail.events.length === 0 ? (
                                        <p className="text-muted" style={{ padding: '2rem', textAlign: 'center' }}>No events</p>
                                    ) : storeDetail.events.slice(-30).reverse().map((ev, i) => (
                                        <div key={i} className={`event-item ${ev.type === 'Warning' ? 'warn' : ''}`}>
                                            <div className="event-meta">
                                                <span className={`event-type ${ev.type?.toLowerCase()}`}>{ev.type}</span>
                                                <span className="event-reason">{ev.reason}</span>
                                                <span className="event-object">{ev.object}</span>
                                            </div>
                                            <div className="event-message">{ev.message}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Metrics Tab ── */}
                {activeTab === 'metrics' && (
                    <div className="metrics-panel">
                        <h2 className="toolbar-title" style={{ marginBottom: '1.5rem' }}>Platform Metrics</h2>
                        {metrics ? (
                            <div className="metrics-grid">
                                <div className="metric-card"><div className="metric-value">{metrics.stores_created || 0}</div><div className="metric-label">Stores Created</div></div>
                                <div className="metric-card"><div className="metric-value">{metrics.stores_deleted || 0}</div><div className="metric-label">Stores Deleted</div></div>
                                <div className="metric-card"><div className="metric-value">{metrics.active_stores || 0}</div><div className="metric-label">Active Stores</div></div>
                                <div className="metric-card"><div className="metric-value">{metrics.provisioning_failures || 0}</div><div className="metric-label">Failures</div></div>
                                <div className="metric-card"><div className="metric-value">{metrics.avg_provisioning_time_ms ? `${Math.round(metrics.avg_provisioning_time_ms / 1000)}s` : 'N/A'}</div><div className="metric-label">Avg Provision Time</div></div>
                            </div>
                        ) : <p className="text-muted">Loading metrics...</p>}
                    </div>
                )}

                {/* ── Audit Tab ── */}
                {activeTab === 'audit' && (
                    <div className="audit-panel">
                        <h2 className="toolbar-title" style={{ marginBottom: '1.5rem' }}>Audit Log</h2>
                        <div className="events-list">
                            {auditLog.length === 0 ? (
                                <p className="text-muted" style={{ padding: '2rem', textAlign: 'center' }}>No audit entries yet</p>
                            ) : auditLog.slice().reverse().map((entry, i) => (
                                <div key={i} className="event-item">
                                    <div className="event-meta">
                                        <span className="event-type normal">{entry.action}</span>
                                        {entry.store_id && <span className="event-object">{entry.store_id}</span>}
                                        {entry.store_name && <span className="event-reason">{entry.store_name}</span>}
                                        <span className="event-time">{entry.timestamp ? timeAgo(entry.timestamp) : ''}</span>
                                    </div>
                                    {entry.detail && <div className="event-message">{entry.detail}</div>}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </main>

            {/* ── Create Store Modal ── */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <h3 className="modal-title">Create New Store</h3>
                        <p className="modal-description">A fully configured e-commerce store will be provisioned on Kubernetes.</p>
                        <form onSubmit={handleCreateStore}>
                            <div className="form-group">
                                <label className="form-label" htmlFor="storeName">Store Name</label>
                                <input id="storeName" type="text" className="form-input" placeholder="My Awesome Store"
                                    value={newStoreName} onChange={(e) => setNewStoreName(e.target.value)}
                                    minLength={3} maxLength={50} required autoFocus />
                            </div>
                            <div className="form-group">
                                <label className="form-label" htmlFor="storeEngine">Engine</label>
                                <select id="storeEngine" className="form-input" value={newStoreEngine} onChange={(e) => setNewStoreEngine(e.target.value)}>
                                    <option value="medusa">MedusaJS</option>
                                    <option value="woocommerce">WooCommerce</option>
                                </select>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={creating || !newStoreName.trim()}>
                                    {creating ? <><span className="loader-tiny" /> Creating...</> : 'Create Store'}
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
