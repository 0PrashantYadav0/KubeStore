import { useState, useEffect, useCallback, useMemo } from 'react'
import {
    PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    AreaChart, Area, CartesianGrid, Legend, RadialBarChart, RadialBar
} from 'recharts'
import {
    fetchStores, createStore, deleteStore, restartStore,
    getStoreHealth, getStorePods, getStoreLogs, getStoreEvents,
    getMetrics, getAuditLog, getAggregatedPodMetrics
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

const COLORS = {
    primary: '#818cf8',
    secondary: '#a78bfa',
    success: '#34d399',
    warning: '#fbbf24',
    error: '#f87171',
    info: '#60a5fa',
    purple: '#c084fc',
    teal: '#2dd4bf',
    rose: '#fb7185',
    orange: '#fb923c',
}

const PIE_COLORS = [COLORS.success, COLORS.info, COLORS.warning, COLORS.error, COLORS.purple]

const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
        <div className="chart-tooltip">
            {label && <div className="chart-tooltip-label">{label}</div>}
            {payload.map((entry, i) => (
                <div key={i} className="chart-tooltip-item">
                    <span className="chart-tooltip-dot" style={{ background: entry.color }} />
                    <span className="chart-tooltip-name">{entry.name || entry.dataKey}:</span>
                    <span className="chart-tooltip-value">{entry.value}</span>
                </div>
            ))}
        </div>
    )
}

// ─── Icons ─────────────────────────────────────────────────────
const Icons = {
    cube: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
    ),
    chart: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3v18h18" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" />
        </svg>
    ),
    clock: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
        </svg>
    ),
    shield: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
    ),
    plus: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
    ),
    back: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
    ),
    link: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
    ),
    lock: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
    ),
    warn: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
    ),
    bag: (
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.3"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
    ),
    server: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="2" width="20" height="8" rx="2" /><rect x="2" y="14" width="20" height="8" rx="2" /><circle cx="6" cy="6" r="1" fill="currentColor" /><circle cx="6" cy="18" r="1" fill="currentColor" /></svg>
    ),
    activity: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
    ),
    zap: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
    ),
    check: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
    ),
    x: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
    ),
}

// ─── ChartCard wrapper ─────────────────────────────────────────
const ChartCard = ({ title, subtitle, children, className = '' }) => (
    <div className={`chart-card ${className}`}>
        <div className="chart-card-header">
            <h3 className="chart-card-title">{title}</h3>
            {subtitle && <p className="chart-card-subtitle">{subtitle}</p>}
        </div>
        <div className="chart-card-body">{children}</div>
    </div>
)

// ─── StatCard ──────────────────────────────────────────────────
const StatCard = ({ label, value, icon, color = 'primary', subtitle }) => (
    <div className="stat-card">
        <div className="stat-card-icon" style={{ color: COLORS[color], background: `${COLORS[color]}15` }}>
            {icon}
        </div>
        <div className="stat-card-content">
            <div className="stat-value" style={{ color: COLORS[color] }}>{value}</div>
            <div className="stat-label">{label}</div>
            {subtitle && <div className="stat-sublabel">{subtitle}</div>}
        </div>
    </div>
)

// Custom label for pie chart
const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }) => {
    if (percent < 0.05) return null
    const RADIAN = Math.PI / 180
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5
    const x = cx + radius * Math.cos(-midAngle * RADIAN)
    const y = cy + radius * Math.sin(-midAngle * RADIAN)
    return (
        <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
            {`${(percent * 100).toFixed(0)}%`}
        </text>
    )
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
    const [activeTab, setActiveTab] = useState('stores')
    const [metrics, setMetrics] = useState(null)
    const [podMetrics, setPodMetrics] = useState(null)
    const [auditLog, setAuditLog] = useState([])
    const [selectedStore, setSelectedStore] = useState(null)
    const [storeDetail, setStoreDetail] = useState(null)
    const [detailTab, setDetailTab] = useState('overview')

    // ─── Data fetching ─────────────────────────────────────────
    const loadStores = useCallback(async () => {
        try {
            const data = await fetchStores()
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
            Promise.all([getMetrics(), getAggregatedPodMetrics()]).then(([m, p]) => {
                setMetrics(m)
                setPodMetrics(p)
            })
            const interval = setInterval(() => {
                Promise.all([getMetrics(), getAggregatedPodMetrics()]).then(([m, p]) => {
                    setMetrics(m)
                    setPodMetrics(p)
                })
            }, 10000)
            return () => clearInterval(interval)
        } else if (activeTab === 'audit') {
            getAuditLog().then(d => setAuditLog(d.entries || []))
        }
    }, [activeTab])

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

    // ─── Derived data ──────────────────────────────────────────
    const stats = {
        total: stores.length,
        ready: stores.filter(s => s.status === 'ready').length,
        provisioning: stores.filter(s => s.status === 'provisioning').length,
        failed: stores.filter(s => s.status === 'failed').length,
    }

    const storeStatusData = useMemo(() => {
        const data = []
        if (stats.ready > 0) data.push({ name: 'Ready', value: stats.ready })
        if (stats.provisioning > 0) data.push({ name: 'Provisioning', value: stats.provisioning })
        if (stats.failed > 0) data.push({ name: 'Failed', value: stats.failed })
        return data
    }, [stats])

    const engineDistribution = useMemo(() => {
        const map = {}
        stores.forEach(s => {
            const e = s.engine || 'medusa'
            map[e] = (map[e] || 0) + 1
        })
        return Object.entries(map).map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }))
    }, [stores])

    const endpointChartData = useMemo(() => {
        if (!metrics?.endpoint_stats) return []
        return Object.entries(metrics.endpoint_stats)
            .map(([name, stat]) => ({
                name: name.replace('GET ', '').replace('POST ', '').replace('DELETE ', '').replace('/api/', ''),
                method: name.split(' ')[0],
                requests: stat.total || 0,
                errors: stat.errors || 0,
                success: (stat.total || 0) - (stat.errors || 0),
            }))
            .sort((a, b) => b.requests - a.requests)
            .slice(0, 10)
    }, [metrics])

    const timelineData = useMemo(() => {
        if (!metrics?.timeline?.length) return []
        // Group events by 5-min buckets
        const buckets = {}
        metrics.timeline.forEach(entry => {
            const t = new Date(entry.timestamp)
            const bucket = new Date(Math.floor(t.getTime() / 300000) * 300000)
            const key = bucket.toISOString()
            if (!buckets[key]) buckets[key] = { time: bucket.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), created: 0, deleted: 0, failed: 0 }
            if (entry.event === 'created') buckets[key].created++
            else if (entry.event === 'deleted') buckets[key].deleted++
            else if (entry.event === 'failed') buckets[key].failed++
        })
        return Object.values(buckets)
    }, [metrics])

    const podStatusData = useMemo(() => {
        if (!podMetrics) return []
        const data = []
        if (podMetrics.running_pods > 0) data.push({ name: 'Running', value: podMetrics.running_pods })
        if (podMetrics.pending_pods > 0) data.push({ name: 'Pending', value: podMetrics.pending_pods })
        if (podMetrics.failed_pods > 0) data.push({ name: 'Failed', value: podMetrics.failed_pods })
        return data
    }, [podMetrics])

    const perStoreRestarts = useMemo(() => {
        if (!podMetrics?.per_store_summary) return []
        return podMetrics.per_store_summary.map(s => ({
            name: s.store_name?.length > 12 ? s.store_name.slice(0, 12) + '...' : s.store_name,
            restarts: s.restarts,
            ready: s.ready,
            notReady: s.not_ready,
        }))
    }, [podMetrics])

    const provisionDurationsData = useMemo(() => {
        if (!metrics?.provision_durations?.length) return []
        return metrics.provision_durations.map((d, i) => ({
            name: `#${i + 1}`,
            duration: Math.round(d / 1000),
        }))
    }, [metrics])

    // ─── Render ────────────────────────────────────────────────
    return (
        <div className="app">
            {/* ── Header ── */}
            <header className="header">
                <div className="header-left">
                    <div className="header-logo">
                        <div className="header-logo-icon">{Icons.cube}</div>
                        <div>
                            <div className="header-title">KubeStore</div>
                            <div className="header-subtitle">Store Provisioning Platform</div>
                        </div>
                    </div>
                </div>
                <nav className="header-nav">
                    {[
                        { key: 'stores', label: 'Stores', icon: Icons.cube },
                        { key: 'metrics', label: 'Metrics', icon: Icons.chart },
                        { key: 'audit', label: 'Audit Log', icon: Icons.shield },
                    ].map(tab => (
                        <button
                            key={tab.key}
                            className={`nav-tab ${activeTab === tab.key ? 'active' : ''}`}
                            onClick={() => { setActiveTab(tab.key); setSelectedStore(null) }}
                        >
                            <span className="nav-tab-icon">{tab.icon}</span>
                            {tab.label}
                        </button>
                    ))}
                </nav>
                <div className="header-right">
                    <div className="header-status">
                        <span className="header-status-dot" />
                        <span className="header-status-text">{stats.total} store{stats.total !== 1 ? 's' : ''}</span>
                    </div>
                </div>
            </header>

            {/* ── Main ── */}
            <main className="main">
                {error && (
                    <div className="error-banner">
                        <span className="error-banner-message">{Icons.warn} {error}</span>
                        <button className="btn btn-sm btn-ghost" onClick={() => setError(null)}>Dismiss</button>
                    </div>
                )}

                {/* ── Stores Tab ── */}
                {activeTab === 'stores' && !selectedStore && (
                    <>
                        <div className="page-header">
                            <div>
                                <h1 className="page-title">Dashboard</h1>
                                <p className="page-description">Manage your e-commerce store instances</p>
                            </div>
                            <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                                {Icons.plus} New Store
                            </button>
                        </div>

                        <div className="stats-bar">
                            <StatCard label="Total Stores" value={stats.total} icon={Icons.server} color="primary" />
                            <StatCard label="Ready" value={stats.ready} icon={Icons.check} color="success" />
                            <StatCard label="Provisioning" value={stats.provisioning} icon={Icons.activity} color="warning" />
                            <StatCard label="Failed" value={stats.failed} icon={Icons.x} color="error" />
                        </div>

                        {loading ? (
                            <div className="empty-state"><span className="loader" /><p className="empty-state-description" style={{ marginTop: '1rem' }}>Loading stores...</p></div>
                        ) : stores.length === 0 ? (
                            <div className="empty-state">
                                <div className="empty-state-icon">{Icons.bag}</div>
                                <h3 className="empty-state-title">No stores yet</h3>
                                <p className="empty-state-description">Create your first e-commerce store to get started</p>
                                <button className="btn btn-primary" onClick={() => setShowModal(true)}>Create Store</button>
                            </div>
                        ) : (
                            <div className="store-grid">
                                {stores.map((store) => (
                                    <div key={store.id} className="store-card" onClick={() => { setSelectedStore(store); setDetailTab('overview') }}>
                                        <div className="store-card-header">
                                            <div className="store-card-left">
                                                <div className={`store-avatar ${store.engine || 'medusa'}`}>
                                                    {(store.engine || 'medusa')[0].toUpperCase()}
                                                </div>
                                                <div>
                                                    <div className="store-name">{store.name}</div>
                                                    <div className="store-id">{store.id} &middot; {store.engine || 'medusa'}</div>
                                                </div>
                                            </div>
                                            <span className={`status-badge ${store.status}`}>
                                                {store.status === 'provisioning' && <span className="loader-tiny" />}
                                                {store.status}
                                            </span>
                                        </div>

                                        <div className="store-meta">
                                            <span className="store-meta-item">
                                                {Icons.clock} {timeAgo(store.created_at)}
                                            </span>
                                            {store.url && (
                                                <a href={store.url} target="_blank" rel="noopener noreferrer" className="store-meta-item link" onClick={e => e.stopPropagation()}>
                                                    {Icons.link} Storefront
                                                </a>
                                            )}
                                            {store.admin_url && (
                                                <a href={store.admin_url} target="_blank" rel="noopener noreferrer" className="store-meta-item link" onClick={e => e.stopPropagation()}>
                                                    {Icons.lock} Admin
                                                </a>
                                            )}
                                        </div>

                                        {store.fail_reason && (
                                            <div className="store-error-msg">{store.fail_reason}</div>
                                        )}

                                        <div className="store-actions">
                                            <button className="btn btn-sm btn-danger-outline" onClick={(e) => { e.stopPropagation(); handleDeleteStore(store.id) }}
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
                        <button className="btn btn-sm btn-ghost" onClick={() => setSelectedStore(null)}>
                            {Icons.back} Back to stores
                        </button>
                        <div className="detail-header">
                            <div className="detail-header-left">
                                <div className={`store-avatar lg ${selectedStore.engine || 'medusa'}`}>
                                    {(selectedStore.engine || 'medusa')[0].toUpperCase()}
                                </div>
                                <div>
                                    <h2 className="detail-title">{selectedStore.name}</h2>
                                    <p className="detail-subtitle">{selectedStore.id} &middot; {selectedStore.engine || 'medusa'} &middot; Created {formatDate(selectedStore.created_at)}</p>
                                </div>
                            </div>
                            <div className="detail-header-actions">
                                <span className={`status-badge lg ${selectedStore.status}`}>{selectedStore.status}</span>
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
                                        {selectedStore.url && <a href={selectedStore.url} target="_blank" rel="noopener noreferrer" className="link-card">{(selectedStore.engine || 'medusa') === 'woocommerce' ? 'WordPress Site' : 'Storefront'} {Icons.link}</a>}
                                        {selectedStore.admin_url && <a href={selectedStore.admin_url} target="_blank" rel="noopener noreferrer" className="link-card">{(selectedStore.engine || 'medusa') === 'woocommerce' ? 'WP Admin' : 'Admin Panel'} {Icons.lock}</a>}
                                    </div>
                                </div>
                            </div>
                        )}

                        {detailTab === 'pods' && storeDetail && (
                            <div className="detail-content">
                                <div className="table-container">
                                    <table className="data-table">
                                        <thead><tr><th>Pod</th><th>Component</th><th>Status</th><th>Ready</th><th>Restarts</th><th>CPU</th><th>Memory</th></tr></thead>
                                        <tbody>
                                            {storeDetail.pods.map((pod, i) => (
                                                <tr key={i}>
                                                    <td className="font-mono text-xs">{pod.name}</td>
                                                    <td><span className="component-badge">{pod.component}</span></td>
                                                    <td><span className={`status-dot ${pod.status === 'Running' ? 'green' : pod.status === 'Pending' ? 'yellow' : 'red'}`} /> {pod.status}</td>
                                                    <td>{pod.ready === 'true' ? <span style={{ color: COLORS.success }}>Yes</span> : <span style={{ color: COLORS.error }}>No</span>}</td>
                                                    <td><span style={{ color: parseInt(pod.restarts) > 0 ? COLORS.warning : COLORS.success }}>{pod.restarts}</span></td>
                                                    <td className="text-muted">{pod.cpu || '-'}</td>
                                                    <td className="text-muted">{pod.memory || '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
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
                    <div className="metrics-page">
                        <div className="page-header">
                            <div>
                                <h1 className="page-title">Platform Metrics</h1>
                                <p className="page-description">Real-time observability into your store provisioning platform</p>
                            </div>
                        </div>

                        {metrics ? (
                            <>
                                {/* ── Top-level KPI Cards ── */}
                                <div className="kpi-grid">
                                    <StatCard label="Stores Created" value={metrics.stores_created || 0} icon={Icons.zap} color="primary" />
                                    <StatCard label="Stores Deleted" value={metrics.stores_deleted || 0} icon={Icons.x} color="rose" />
                                    <StatCard label="Active Stores" value={metrics.active_stores || 0} icon={Icons.check} color="success" />
                                    <StatCard label="Failures" value={metrics.provisioning_failures || 0} icon={Icons.warn} color="error" />
                                    <StatCard label="Avg Provision" value={metrics.avg_provisioning_time_ms ? `${Math.round(metrics.avg_provisioning_time_ms / 1000)}s` : 'N/A'} icon={Icons.clock} color="warning" />
                                    <StatCard label="API Requests" value={metrics.api_requests_total || 0} icon={Icons.activity} color="info" subtitle={`${metrics.api_errors_total || 0} errors`} />
                                    <StatCard label="API Success Rate" value={metrics.api_success_rate ? `${metrics.api_success_rate.toFixed(1)}%` : '100%'} icon={Icons.shield} color="teal" />
                                    <StatCard label="Total Pod Restarts" value={podMetrics?.total_restarts || 0} icon={Icons.server} color="orange" subtitle={`${podMetrics?.total_pods || 0} pods`} />
                                </div>

                                {/* ── Charts Row 1: Distributions ── */}
                                <div className="charts-row">
                                    <ChartCard title="Store Status" subtitle="Distribution by current status">
                                        {storeStatusData.length > 0 ? (
                                            <ResponsiveContainer width="100%" height={220}>
                                                <PieChart>
                                                    <Pie data={storeStatusData} cx="50%" cy="50%" innerRadius={50} outerRadius={85}
                                                        paddingAngle={3} dataKey="value" labelLine={false} label={renderCustomLabel}>
                                                        {storeStatusData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                                                    </Pie>
                                                    <Tooltip content={<CustomTooltip />} />
                                                    <Legend wrapperStyle={{ fontSize: 12, color: '#9090a8' }} />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        ) : <p className="chart-empty">No stores yet</p>}
                                    </ChartCard>

                                    <ChartCard title="Engine Distribution" subtitle="Stores by engine type">
                                        {engineDistribution.length > 0 ? (
                                            <ResponsiveContainer width="100%" height={220}>
                                                <PieChart>
                                                    <Pie data={engineDistribution} cx="50%" cy="50%" innerRadius={50} outerRadius={85}
                                                        paddingAngle={3} dataKey="value" labelLine={false} label={renderCustomLabel}>
                                                        {engineDistribution.map((_, i) => <Cell key={i} fill={[COLORS.primary, COLORS.teal, COLORS.purple][i % 3]} />)}
                                                    </Pie>
                                                    <Tooltip content={<CustomTooltip />} />
                                                    <Legend wrapperStyle={{ fontSize: 12, color: '#9090a8' }} />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        ) : <p className="chart-empty">No stores yet</p>}
                                    </ChartCard>

                                    <ChartCard title="Pod Health" subtitle="Pod status across all stores">
                                        {podStatusData.length > 0 ? (
                                            <ResponsiveContainer width="100%" height={220}>
                                                <PieChart>
                                                    <Pie data={podStatusData} cx="50%" cy="50%" innerRadius={50} outerRadius={85}
                                                        paddingAngle={3} dataKey="value" labelLine={false} label={renderCustomLabel}>
                                                        {podStatusData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                                                    </Pie>
                                                    <Tooltip content={<CustomTooltip />} />
                                                    <Legend wrapperStyle={{ fontSize: 12, color: '#9090a8' }} />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        ) : <p className="chart-empty">No pod data</p>}
                                    </ChartCard>
                                </div>

                                {/* ── Charts Row 2: Bar Charts ── */}
                                <div className="charts-row two-col">
                                    <ChartCard title="API Endpoint Traffic" subtitle="Requests and errors by endpoint">
                                        {endpointChartData.length > 0 ? (
                                            <ResponsiveContainer width="100%" height={280}>
                                                <BarChart data={endpointChartData} layout="vertical" margin={{ left: 10, right: 20 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                                    <XAxis type="number" tick={{ fill: '#9090a8', fontSize: 11 }} />
                                                    <YAxis type="category" dataKey="name" width={140} tick={{ fill: '#d0d0e0', fontSize: 11 }} />
                                                    <Tooltip content={<CustomTooltip />} />
                                                    <Legend wrapperStyle={{ fontSize: 12, color: '#9090a8' }} />
                                                    <Bar dataKey="success" name="Success" fill={COLORS.success} radius={[0, 4, 4, 0]} stackId="a" />
                                                    <Bar dataKey="errors" name="Errors" fill={COLORS.error} radius={[0, 4, 4, 0]} stackId="a" />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        ) : <p className="chart-empty">No request data yet</p>}
                                    </ChartCard>

                                    <ChartCard title="Pod Restarts per Store" subtitle="Restart count by store instance">
                                        {perStoreRestarts.length > 0 ? (
                                            <ResponsiveContainer width="100%" height={280}>
                                                <BarChart data={perStoreRestarts} margin={{ top: 5, right: 20, bottom: 5 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                                    <XAxis dataKey="name" tick={{ fill: '#d0d0e0', fontSize: 11 }} />
                                                    <YAxis tick={{ fill: '#9090a8', fontSize: 11 }} />
                                                    <Tooltip content={<CustomTooltip />} />
                                                    <Legend wrapperStyle={{ fontSize: 12, color: '#9090a8' }} />
                                                    <Bar dataKey="restarts" name="Restarts" fill={COLORS.warning} radius={[4, 4, 0, 0]} />
                                                    <Bar dataKey="ready" name="Ready" fill={COLORS.success} radius={[4, 4, 0, 0]} />
                                                    <Bar dataKey="notReady" name="Not Ready" fill={COLORS.error} radius={[4, 4, 0, 0]} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        ) : <p className="chart-empty">No pod data</p>}
                                    </ChartCard>
                                </div>

                                {/* ── Charts Row 3: Timeline ── */}
                                <div className="charts-row two-col">
                                    <ChartCard title="Store Event Timeline" subtitle="Store creation, deletion, and failures over time">
                                        {timelineData.length > 0 ? (
                                            <ResponsiveContainer width="100%" height={260}>
                                                <AreaChart data={timelineData} margin={{ top: 5, right: 20, bottom: 5 }}>
                                                    <defs>
                                                        <linearGradient id="gradCreated" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="5%" stopColor={COLORS.success} stopOpacity={0.3} />
                                                            <stop offset="95%" stopColor={COLORS.success} stopOpacity={0} />
                                                        </linearGradient>
                                                        <linearGradient id="gradDeleted" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="5%" stopColor={COLORS.info} stopOpacity={0.3} />
                                                            <stop offset="95%" stopColor={COLORS.info} stopOpacity={0} />
                                                        </linearGradient>
                                                        <linearGradient id="gradFailed" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="5%" stopColor={COLORS.error} stopOpacity={0.3} />
                                                            <stop offset="95%" stopColor={COLORS.error} stopOpacity={0} />
                                                        </linearGradient>
                                                    </defs>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                                    <XAxis dataKey="time" tick={{ fill: '#9090a8', fontSize: 11 }} />
                                                    <YAxis tick={{ fill: '#9090a8', fontSize: 11 }} allowDecimals={false} />
                                                    <Tooltip content={<CustomTooltip />} />
                                                    <Legend wrapperStyle={{ fontSize: 12, color: '#9090a8' }} />
                                                    <Area type="monotone" dataKey="created" name="Created" stroke={COLORS.success} fill="url(#gradCreated)" strokeWidth={2} />
                                                    <Area type="monotone" dataKey="deleted" name="Deleted" stroke={COLORS.info} fill="url(#gradDeleted)" strokeWidth={2} />
                                                    <Area type="monotone" dataKey="failed" name="Failed" stroke={COLORS.error} fill="url(#gradFailed)" strokeWidth={2} />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        ) : <p className="chart-empty">No timeline data yet. Create a store to see activity.</p>}
                                    </ChartCard>

                                    <ChartCard title="Provisioning Duration" subtitle="Time to provision each store (seconds)">
                                        {provisionDurationsData.length > 0 ? (
                                            <ResponsiveContainer width="100%" height={260}>
                                                <AreaChart data={provisionDurationsData} margin={{ top: 5, right: 20, bottom: 5 }}>
                                                    <defs>
                                                        <linearGradient id="gradDuration" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.3} />
                                                            <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0} />
                                                        </linearGradient>
                                                    </defs>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                                    <XAxis dataKey="name" tick={{ fill: '#9090a8', fontSize: 11 }} />
                                                    <YAxis tick={{ fill: '#9090a8', fontSize: 11 }} unit="s" />
                                                    <Tooltip content={<CustomTooltip />} />
                                                    <Area type="monotone" dataKey="duration" name="Duration (s)" stroke={COLORS.primary} fill="url(#gradDuration)" strokeWidth={2} dot={{ fill: COLORS.primary, r: 3 }} />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        ) : <p className="chart-empty">No provisioning data yet</p>}
                                    </ChartCard>
                                </div>

                                {/* ── Pod Detail Table ── */}
                                {podMetrics?.pods?.length > 0 && (
                                    <ChartCard title="All Pods" subtitle={`${podMetrics.total_pods} pods across ${podMetrics.per_store_summary?.length || 0} stores`} className="full-width">
                                        <div className="table-container">
                                            <table className="data-table">
                                                <thead>
                                                    <tr>
                                                        <th>Store</th>
                                                        <th>Component</th>
                                                        <th>Status</th>
                                                        <th>Ready</th>
                                                        <th>Restarts</th>
                                                        <th>CPU</th>
                                                        <th>Memory</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {podMetrics.pods.map((pod, i) => (
                                                        <tr key={i}>
                                                            <td className="font-mono text-xs">{pod.store_name}</td>
                                                            <td><span className="component-badge">{pod.component}</span></td>
                                                            <td>
                                                                <span className={`status-dot ${pod.status === 'Running' ? 'green' : pod.status === 'Pending' ? 'yellow' : 'red'}`} />
                                                                {pod.status}
                                                            </td>
                                                            <td>{pod.ready ? <span style={{ color: COLORS.success }}>Yes</span> : <span style={{ color: COLORS.error }}>No</span>}</td>
                                                            <td><span style={{ color: pod.restarts > 0 ? COLORS.warning : COLORS.success, fontWeight: pod.restarts > 0 ? 600 : 400 }}>{pod.restarts}</span></td>
                                                            <td className="text-muted">{pod.cpu || '-'}</td>
                                                            <td className="text-muted">{pod.memory || '-'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </ChartCard>
                                )}
                            </>
                        ) : (
                            <div className="empty-state"><span className="loader" /><p className="empty-state-description" style={{ marginTop: '1rem' }}>Loading metrics...</p></div>
                        )}
                    </div>
                )}

                {/* ── Audit Tab ── */}
                {activeTab === 'audit' && (
                    <div className="audit-page">
                        <div className="page-header">
                            <div>
                                <h1 className="page-title">Audit Log</h1>
                                <p className="page-description">Security and compliance event trail</p>
                            </div>
                        </div>
                        <div className="events-list">
                            {auditLog.length === 0 ? (
                                <p className="text-muted" style={{ padding: '2rem', textAlign: 'center' }}>No audit entries yet</p>
                            ) : auditLog.slice().reverse().map((entry, i) => (
                                <div key={i} className="event-item">
                                    <div className="event-meta">
                                        <span className={`event-type ${entry.action?.includes('FAILED') || entry.action?.includes('EXCEEDED') ? 'warning' : 'normal'}`}>{entry.action}</span>
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
                        <div className="modal-header">
                            <h3 className="modal-title">Create New Store</h3>
                            <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
                        </div>
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
