const API_BASE = '/api';

export async function fetchStores() {
    const response = await fetch(`${API_BASE}/stores`);
    if (!response.ok) {
        throw new Error('Failed to fetch stores');
    }
    return response.json();
}

export async function createStore(name, engine = "medusa") {
    const response = await fetch(`${API_BASE}/stores`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, engine }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create store');
    }

    return response.json();
}

export async function deleteStore(id) {
    const response = await fetch(`${API_BASE}/stores/${id}`, {
        method: 'DELETE',
    });

    if (!response.ok && response.status !== 204) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete store');
    }

    return true;
}

export async function getStore(id) {
    const response = await fetch(`${API_BASE}/stores/${id}`);
    if (!response.ok) {
        throw new Error('Failed to fetch store');
    }
    return response.json();
}

export async function restartStore(id) {
    const response = await fetch(`${API_BASE}/stores/${id}/restart`, {
        method: 'POST',
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to restart store');
    }
    return response.json();
}

export async function getStoreHealth(id) {
    const response = await fetch(`${API_BASE}/stores/${id}/health`);
    if (!response.ok) return null;
    return response.json();
}

export async function getStorePods(id) {
    const response = await fetch(`${API_BASE}/stores/${id}/pods`);
    if (!response.ok) return { pods: [] };
    return response.json();
}

export async function getStoreLogs(id, component = 'medusa', lines = 50) {
    const response = await fetch(`${API_BASE}/stores/${id}/logs?component=${component}&lines=${lines}`);
    if (!response.ok) return { logs: '' };
    return response.json();
}

export async function getStoreEvents(id) {
    const response = await fetch(`${API_BASE}/stores/${id}/events`);
    if (!response.ok) return { events: [] };
    return response.json();
}

export async function getMetrics() {
    const response = await fetch(`${API_BASE}/metrics`);
    if (!response.ok) return {};
    return response.json();
}

export async function getAggregatedPodMetrics() {
    const response = await fetch(`${API_BASE}/metrics/pods`);
    if (!response.ok) return { total_pods: 0, running_pods: 0, pending_pods: 0, failed_pods: 0, total_restarts: 0, pods: [], per_store_summary: [] };
    return response.json();
}

export async function getAuditLog() {
    const response = await fetch(`${API_BASE}/audit`);
    if (!response.ok) return { entries: [] };
    return response.json();
}
