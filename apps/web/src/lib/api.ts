export const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4100').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const TOKEN_KEY = 'sp.token';
const SHOP_KEY = 'sp.viewShop'; // admin "view as shop"

export const session = {
  token: () => (typeof window === 'undefined' ? null : localStorage.getItem(TOKEN_KEY)),
  set(token: string) {
    localStorage.setItem(TOKEN_KEY, token);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(SHOP_KEY);
  },
  viewShop: () => (typeof window === 'undefined' ? null : sessionStorage.getItem(SHOP_KEY)),
  setViewShop(id: string | null) {
    if (id) sessionStorage.setItem(SHOP_KEY, id);
    else sessionStorage.removeItem(SHOP_KEY);
  },
};

export async function api<T = any>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = session.token();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const shop = session.viewShop();
  if (shop) headers.set('X-Shop-Id', shop);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(init.json);
  }
  let res: Response;
  try {
    res = await fetch(API_URL + path, { ...init, headers, body, cache: 'no-store' });
  } catch {
    throw new ApiError(0, 'No internet connection. Check your network and try again.');
  }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) {
    if (res.status === 401 && token && typeof window !== 'undefined' && !path.startsWith('/api/auth')) {
      session.clear();
      window.location.href = '/login';
    }
    throw new ApiError(res.status, data?.error || 'Something went wrong. Please try again.');
  }
  return data as T;
}

/** Upload with progress (fetch has no upload progress). */
export function uploadFile<T>(path: string, file: File, onProgress: (pct: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', API_URL + path);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let data: any = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new ApiError(xhr.status, data?.error || 'Upload failed. Please try again.'));
    };
    xhr.onerror = () => reject(new ApiError(0, 'Upload failed. Check your internet and try again.'));
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}

/** Open an authenticated file (PDF) in a new tab. */
export async function openAuthed(path: string) {
  const win = window.open('', '_blank');
  const headers: Record<string, string> = {};
  const token = session.token();
  if (token) headers.Authorization = `Bearer ${token}`;
  const shop = session.viewShop();
  if (shop) headers['X-Shop-Id'] = shop;
  const res = await fetch(API_URL + path, { headers });
  if (!res.ok) {
    win?.close();
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data?.error || 'Could not open the file');
  }
  const url = URL.createObjectURL(await res.blob());
  if (win) win.location.href = url;
}
