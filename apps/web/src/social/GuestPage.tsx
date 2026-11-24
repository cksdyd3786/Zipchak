import { useEffect, useState, type FormEvent } from 'react'
import roomSample from '@schema/fixtures/room.sample.json'
import { RoomScene } from '../scene/RoomScene'
import type { RoomData } from '../types/schema'
import { loadGuestInvite, type GuestInvite } from './inviteApi'
import './guestPage.css'

export function GuestPage({ invite, signupUrl }: { invite: GuestInvite; signupUrl?: string }) {
  const [draft, setDraft] = useState('')
  const [nickname, setNickname] = useState('')

  function enterRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = draft.trim()
    if (name) setNickname(name)
  }

  if (invite.status !== 'ready') {
    const expired = invite.status === 'expired'
    return (
      <main className="guest-page guest-page--centered">
        <section className="guest-card" aria-labelledby="guest-title">
          <h1 id="guest-title">{expired ? '초대가 만료됐어요' : '초대 링크를 찾을 수 없어요'}</h1>
          <p>방 주인에게 새 링크를 받아 다시 들어와 주세요.</p>
          {expired && signupUrl && <a className="guest-button" href={signupUrl}>가입하기</a>}
        </section>
      </main>
    )
  }

  if (!nickname) {
    return (
      <main className="guest-page guest-page--centered">
        <section className="guest-card" aria-labelledby="guest-title">
          <h1 id="guest-title">방에 초대됐어요</h1>
          <p className="guest-card__room">{invite.room.name}</p>
          <p>닉네임만 입력하면 들어갈 수 있어요.</p>
          <form className="guest-form" onSubmit={enterRoom}>
            <label htmlFor="guest-nickname">닉네임</label>
            <input
              id="guest-nickname"
              name="nickname"
              autoComplete="nickname"
              placeholder="예: 세연"
              value={draft}
              onChange={(event) => setDraft(event.currentTarget.value)}
              required
            />
            <button className="guest-button" type="submit" disabled={!draft.trim()}>방 들어가기</button>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="guest-page guest-room">
      <header className="guest-room__header">
        <h1>{invite.room.name}</h1>
        <div className="guest-room__visitor">
          <span className="guest-room__nickname">{nickname}님</span>
          <span className="guest-room__permission">
            {invite.permission === 'view' ? '보기 전용' : '포스트잇을 남길 수 있어요'}
          </span>
        </div>
      </header>
      <div className="guest-room__scene">
        <RoomScene room={invite.room} layout={invite.layout} />
      </div>
    </main>
  )
}

export function GuestInviteRoute({ apiUrl, token, signupUrl }: {
  apiUrl: string
  token: string
  signupUrl?: string
}) {
  const [invite, setInvite] = useState<GuestInvite>()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    loadGuestInvite(apiUrl, token, controller.signal).then(
      (value) => { if (!controller.signal.aborted) setInvite(value) },
      () => { if (!controller.signal.aborted) setFailed(true) },
    )
    return () => controller.abort()
  }, [apiUrl, token])

  if (failed || !invite) {
    return (
      <main className="guest-page guest-page--centered">
        <div className="guest-card">
          <p role={failed ? 'alert' : 'status'}>
            {failed ? '방을 불러오지 못했어요. 페이지를 새로고침해 주세요.' : '초대 링크를 확인하고 있어요…'}
          </p>
        </div>
      </main>
    )
  }
  return <GuestPage invite={invite} signupUrl={signupUrl} />
}

// 테스트용 경로만 예시 데이터를 사용한다.
export default function GuestPreview() {
  const path = window.location.pathname.replace(/\/$/, '')
  const room = roomSample as RoomData

  switch (path) {
    case '/v/demo':
      return <GuestPage invite={{ status: 'ready', room, permission: 'view' }} />
    case '/v/demo-postit':
      return <GuestPage invite={{ status: 'ready', room, permission: 'postit' }} />
    case '/v/expired':
      return <GuestPage invite={{ status: 'expired' }} />
    default: {
      const match = /^\/v\/([^/]+)$/.exec(path)
      if (!match) return <GuestPage invite={{ status: 'not-found' }} />
      let token: string
      try {
        token = decodeURIComponent(match[1])
      } catch {
        return <GuestPage invite={{ status: 'not-found' }} />
      }
      const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'
      return <GuestInviteRoute key={token} apiUrl={apiUrl} token={token} />
    }
  }
}
