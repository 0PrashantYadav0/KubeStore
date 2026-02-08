const API_BASE = '/api';

export async function fetchStores() {
    const response = await fetch(`${API_BASE}/stores`);
    if (!response.ok) {
        throw new Error('Failed to fetch stores');
    }
    return response.json();
}

export async function createStore(name) {
    const response = await fetch(`${API_BASE}/stores`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name }),
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
