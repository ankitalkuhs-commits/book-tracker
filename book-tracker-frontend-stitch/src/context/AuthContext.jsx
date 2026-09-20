import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { getToken, clearToken, cacheClear, getMyProfile, getVapidPublicKey, webSubscribe, webUnsubscribe } from '../services/api';
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
  // true only while a stored token is being checked by /profile/me. Signed-in pages no longer wait
  // for it (F-69): only /admin and /onboarding do. With no token it starts false, so "/" never
  // sends a signed-out visitor to /home.
  const [loading, setLoading] = useState(() => !!getToken());
  const answered = useRef(!getToken());   // has this load's /profile/me answered?
  const earlyPatch = useRef(null);        // profile edits saved before it answered (R-04)

  useEffect(() => {
    if (!getToken()) return;
    // K-02: React StrictMode double-invokes this effect in dev, sending two /profile/me. `ignore`
    // is set by this invocation's own cleanup, so only the live invocation's answer is ever applied —
    // a stale duplicate can never overwrite a newer edit.
    let ignore = false;
    getMyProfile()
      .then((data) => {
        if (ignore) return;
        answered.current = true;
        setUser(data && earlyPatch.current ? { ...data, ...earlyPatch.current } : data);
        earlyPatch.current = null;
        registerWebPush();
      })
      .catch(() => { if (!ignore) clearToken(); })      // unchanged: a failed check signs out (E-5)
      .finally(() => { if (!ignore) { answered.current = true; setLoading(false); } });
    return () => { ignore = true; };
  }, []);

  const login = (userData) => {
    cacheClear();                                     // F-71: nothing cached before this sign-in is served to it
    setUser(userData);
    setTimeout(registerWebPush, 500);
  };

  // A saved profile edit (name, bio, yearly_goal, profile_picture). Never creates a user object:
  // before /profile/me answers, the edit is held and laid over its answer.
  const updateUser = (patch) => {
    if (!answered.current) earlyPatch.current = { ...(earlyPatch.current || {}), ...patch };
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const logout = () => {
    const token = getToken();                          // F-03 web: capture before clearing
    clearToken();
    cacheClear();                                      // F-71: the next account in this tab must not get this one's GETs
    localStorage.removeItem(NOTE_VISIBILITY_KEY);      // E2: the next account must start at "Only me"
    setUser(null);
    unregisterWebPush(token);                          // fire-and-forget; DELETE is never cached
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
