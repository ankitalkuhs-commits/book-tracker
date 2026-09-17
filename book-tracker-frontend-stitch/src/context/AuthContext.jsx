import { createContext, useContext, useState, useEffect } from 'react';
import { getToken, clearToken, getMyProfile, getVapidPublicKey, webSubscribe, webUnsubscribe } from '../services/api';
import { NOTE_VISIBILITY_KEY } from '../utils/noteVisibility';

const AuthContext = createContext(null);

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

async function registerWebPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
  if (!getToken() || Notification.permission !== 'granted') return;   // F-27: never prompt here; the banner asks
  try {
    // Register service worker
    const reg = await navigator.serviceWorker.register('/sw-push.js');
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const { public_key } = await getVapidPublicKey();
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(public_key),
      });
    }
    await webSubscribe(sub.toJSON(), navigator.userAgent.slice(0, 120));   // always: the server reassigns this endpoint (F-03)
  } catch (err) {
    if (import.meta.env.DEV) console.warn('Web push registration failed:', err?.message);
  }
}

async function unregisterWebPush(token) {
  try {
    if (!token || !('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration('/sw-push.js');
    const sub = reg && await reg.pushManager.getSubscription();
    if (sub) await webUnsubscribe(sub.toJSON(), token);   // the browser subscription is kept; the next login re-registers it
  } catch { /* best effort — server-side reassignment covers a failed call */ }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (token) {
      getMyProfile()
        .then((data) => {
          setUser(data);
          registerWebPush();
        })
        .catch(() => clearToken())
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = (userData) => {
    setUser(userData);
    // Register web push after login
    setTimeout(registerWebPush, 500);
  };

  const logout = () => {
    const token = getToken();                          // F-03 web: capture before clearing
    clearToken();
    localStorage.removeItem(NOTE_VISIBILITY_KEY);      // E2: the next account must start at "Only me"
    setUser(null);
    unregisterWebPush(token);                          // fire-and-forget
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
