import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useToast } from '../components/Toast'
import { joinByInviteCode } from '../services/api'

export default function JoinGroupPage() {
  const { inviteCode } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [status, setStatus] = useState('joining') // 'joining' | 'success' | 'pending' | 'error'
  const [groupId, setGroupId] = useState(null)

  useEffect(() => {
    if (!inviteCode) { navigate('/groups'); return }
    joinByInviteCode(inviteCode)
      .then(res => {
        setGroupId(res.group_id)
        if (res.status === 'active') {
          setStatus('success')
          toast('Joined the group!', 'success')
          setTimeout(() => navigate(`/groups/${res.group_id}`), 1500)
        } else {
          setStatus('pending')
        }
      })
      .catch(e => {
        setStatus('error')
        toast(e.message || 'Invalid invite link', 'error')
      })
  }, [inviteCode])

  return (
    <main className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center max-w-sm space-y-4">
        {status === 'joining' && (
          <>
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-primary text-2xl animate-spin">autorenew</span>
            </div>
            <p className="font-serif text-xl text-on-surface">Joining the circle...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-14 h-14 rounded-full bg-secondary/10 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-secondary text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
            </div>
            <p className="font-serif text-xl text-on-surface">You're in!</p>
            <p className="text-sm text-on-surface-variant">Redirecting to the group...</p>
          </>
        )}

        {status === 'pending' && (
          <>
            <div className="w-14 h-14 rounded-full bg-tertiary/10 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-tertiary text-2xl">pending</span>
            </div>
            <p className="font-serif text-xl text-on-surface">Request Sent</p>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              This is a private group. Your request has been sent to the curator for approval.
            </p>
            <button
              onClick={() => navigate('/groups')}
              className="btn-primary px-6 py-2.5 text-sm rounded-xl"
            >
              Go to Groups
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-14 h-14 rounded-full bg-error/10 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-error text-2xl">link_off</span>
            </div>
            <p className="font-serif text-xl text-on-surface">Invalid Invite Link</p>
            <p className="text-sm text-on-surface-variant">
              This invite link may have expired or is no longer valid.
            </p>
            <button
              onClick={() => navigate('/groups')}
              className="btn-primary px-6 py-2.5 text-sm rounded-xl"
            >
              Browse Groups
            </button>
          </>
        )}
      </div>
    </main>
  )
}
