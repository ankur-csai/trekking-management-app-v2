// api.js — a thin wrapper around fetch() so every API call automatically
// sends the session cookie and handles JSON in/out consistently.
// This is the ONE place that knows how to talk to the backend.

const api = {
  async request(method, url, body) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',   // <-- sends the Flask session cookie
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(url, opts);
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error((data && data.error) || 'Request failed');
    }
    return data;
  },
  get(url) { return this.request('GET', url); },
  post(url, body) { return this.request('POST', url, body); },
  put(url, body) { return this.request('PUT', url, body); },
  del(url) { return this.request('DELETE', url); },
};
