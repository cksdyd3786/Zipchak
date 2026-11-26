import type { FurnitureLayout, RoomData } from '../types/schema'

export type InvitePermission = 'view' | 'postit'
export type GuestInvite =
  | { status: 'ready'; room: RoomData; layout?: FurnitureLayout; permission: InvitePermission }
  | { status: 'expired' | 'not-found' }

type InviteDetails = {
  roomId: string
  layoutId: string
  permission: InvitePermission
  guestId: string
}

type CreatedInvite = {
  inviteToken: string
  url: string
  qrPngUrl: string
  expiresAt: string
}

export async function createInvite(
  apiUrl: string,
  roomId: string,
  accessToken: string,
  permission: InvitePermission,
): Promise<CreatedInvite> {
  const response = await fetch(`${apiUrl}/rooms/${encodeURIComponent(roomId)}/invites`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ permission }),
  })
  if (!response.ok) throw new Error(`Invite creation failed: ${response.status}`)
  return response.json()
}

export async function loadGuestInvite(
  apiUrl: string,
  inviteToken: string,
  signal: AbortSignal,
): Promise<GuestInvite> {
  const response = await fetch(`${apiUrl}/invites/${encodeURIComponent(inviteToken)}`, { signal })
  if (response.status === 410) return { status: 'expired' }
  if (response.status === 404) return { status: 'not-found' }
  if (!response.ok) throw new Error(`Invite lookup failed: ${response.status}`)

  const invite: InviteDetails = await response.json()
  const options = { signal, headers: { 'X-Invite-Token': inviteToken } }
  const [roomResponse, layoutResponse] = await Promise.all([
    fetch(`${apiUrl}/rooms/${encodeURIComponent(invite.roomId)}`, options),
    fetch(`${apiUrl}/layouts/${encodeURIComponent(invite.layoutId)}`, options),
  ])

  if (roomResponse.status === 410 || layoutResponse.status === 410) return { status: 'expired' }
  if (roomResponse.status === 404 || layoutResponse.status === 404) return { status: 'not-found' }
  if (!roomResponse.ok || !layoutResponse.ok) throw new Error('Guest room could not be loaded')

  const [room, layout] = await Promise.all([roomResponse.json(), layoutResponse.json()])
  return { status: 'ready', room, layout, permission: invite.permission }
}
