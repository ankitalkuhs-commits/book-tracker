import { createContext, useContext, useState, useCallback } from 'react'

const ToastContext = createContext(null)

const ICONS = {
  success: { icon: 'check_circle', cls: 'text-secondary' },
  error:   { icon: 'error',        cls: 'text-error' },
  info:    { icon: 'info',         cls: 'text-primary' },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const toast = useCallback((message, type = 'info', duration = 3500) => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration)
  }, [])

  const dismiss = (id) => setToasts(prev => prev.filter(t => t.id !== id))

  return (
    <ToastContext.Provider value={toast}>
      {children}

      {/* Toast container */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 items-center pointer-events-none">
        {toasts.map(t => {
          const { icon, cls } = ICONS[t.type] || ICONS.info
          return (
            <div
              key={t.id}
              className="pointer-events-auto flex items-center gap-3 bg-inverse-surface text-inverse-on-surface px-4 py-3 rounded-2xl shadow-float text-sm font-sans max-w-sm animate-[fadeInUp_0.2s_ease]"
              onClick={() => dismiss(t.id)}
            >
              <span className={`material-symbols-outlined text-base shrink-0 ${cls}`}
                style={{ fontVariationSettings: "'FILL' 1" }}>
                {icon}
              </span>
              <span>{t.message}</span>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
