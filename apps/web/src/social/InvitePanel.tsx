import { useId, useState, type FormEvent } from 'react'
import { createInvite, type InvitePermission } from './inviteApi'
import './invitePanel.css'

interface InvitePanelProps {
  apiUrl: string
  roomId: string
  accessToken: string
}

const permissions: { value: InvitePermission; label: string; description: string }[] = [
  { value: 'view', label: '보기 전용', description: '3D 방을 둘러볼 수 있어요.' },
  { value: 'postit', label: '포스트잇 작성', description: '방을 보고 포스트잇도 남길 수 있어요.' },
]

export function InvitePanel({ apiUrl, roomId, accessToken }: InvitePanelProps) {
  const id = useId()
  const [permission, setPermission] = useState<InvitePermission>('view')
  const [invite, setInvite] = useState<Awaited<ReturnType<typeof createInvite>>>()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setError(false)
    setInvite(undefined)
    setPending(true)
    try {
      setInvite(await createInvite(apiUrl, roomId, accessToken, permission))
    } catch {
      setError(true)
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="invite-panel" aria-labelledby={id}>
      <h1 id={id}>친구 초대</h1>
      <p className="invite-panel__intro">친구가 내 방에 들어올 수 있는 링크를 만들어요.</p>

      <form onSubmit={submit}>
        <fieldset className="invite-panel__permissions" disabled={pending}>
          <legend>게스트 권한</legend>
          {permissions.map(({ value, label, description }) => (
            <label className="invite-choice" key={value}>
              <input
                type="radio"
                name={`${id}-permission`}
                value={value}
                checked={permission === value}
                onChange={() => setPermission(value)}
              />
              <span>
                <strong>{label}</strong>
                <span className="invite-choice__description">{description}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <button className="invite-panel__submit" type="submit" disabled={pending}>
          {pending ? '발급 중…' : '초대 링크 만들기'}
        </button>
      </form>

      {error && <p className="invite-panel__error" role="alert">초대 링크를 만들지 못했어요. 다시 시도해 주세요.</p>}
      <div aria-live="polite">
        {invite && (
          <section className="invite-result" aria-label="생성된 초대">
            <div>
              <h2>초대 링크</h2>
              <a href={invite.url}>{invite.url}</a>
            </div>
            <img src={invite.qrPngUrl} width="112" height="112" alt="친구 초대 QR 코드" referrerPolicy="no-referrer" />
          </section>
        )}
      </div>
    </section>
  )
}
