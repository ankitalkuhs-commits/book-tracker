import React, { useEffect, useState } from 'react';

const DISMISSED_KEY = 'pwa_banner_dismissed_until';

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isInStandaloneMode() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

function isMobile() {
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}

export default function PWAInstallBanner() {
  const [show, setShow] = useState(false);
  const [isIOSDevice, setIsIOSDevice] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useEffect(() => {
    // Don't show if already installed
    if (isInStandaloneMode()) return;
    // Don't show on desktop
    if (!isMobile()) return;
    // Don't show if dismissed recently
    const dismissedUntil = localStorage.getItem(DISMISSED_KEY);
    if (dismissedUntil && Date.now() < parseInt(dismissedUntil)) return;

    setIsIOSDevice(isIOS());

    // Android/Chrome: capture the install prompt
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // iOS: always show the manual instruction banner
    if (isIOS()) {
      setShow(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShow(false);
      }
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    // Don't show again for 1 day
    localStorage.setItem(DISMISSED_KEY, Date.now() + 1 * 24 * 60 * 60 * 1000);
    setShow(false);
  };

  if (!show) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 9999,
      background: '#fff',
      borderTop: '1px solid #e5e7eb',
      boxShadow: '0 -4px 20px rgba(0,0,0,0.12)',
      padding: '16px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '12px',
    }}>
      {/* Icon */}
      <img
        src="/icon-192.png"
        alt="Track My Read"
        style={{ width: 48, height: 48, borderRadius: 10, flexShrink: 0 }}
      />

      {/* Text + action */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: '#111' }}>
          Install Track My Read
        </p>
        {isIOSDevice ? (
          <p style={{ margin: '4px 0 10px', fontSize: 13, color: '#555', lineHeight: 1.4 }}>
            Tap <strong>Share</strong> <span style={{ fontSize: 16 }}>⎙</span> then{' '}
            <strong>"Add to Home Screen"</strong> for the full app experience.
          </p>
        ) : (
          <p style={{ margin: '4px 0 10px', fontSize: 13, color: '#555', lineHeight: 1.4 }}>
            Add to your home screen — works offline, no app store needed.
          </p>
        )}

        {!isIOSDevice && (
          <button
            onClick={handleInstall}
            style={{
              background: '#6366f1',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '8px 20px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Install App
          </button>
        )}
      </div>

      {/* Dismiss */}
      <button
        onClick={handleDismiss}
        style={{
          background: 'none',
          border: 'none',
          fontSize: 20,
          color: '#999',
          cursor: 'pointer',
          padding: '0 4px',
          flexShrink: 0,
          lineHeight: 1,
        }}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
