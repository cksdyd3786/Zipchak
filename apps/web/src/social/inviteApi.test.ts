import { afterEach, describe, expect, it, vi } from 'vitest'
import { createInvite, loadGuestInvite } from './inviteApi'

const apiUrl = 'http://localhost:4000'
const signal = new AbortController().signal
afterEach(() => vi.unstubAllGlobals())

describe('invite API', () => {
  it('requests an owner invite and returns the issued link and QR', async () => {
    const issued = { inviteToken: 'inv_guest', url: 'http://localhost:5174/v/inv_guest', qrPngUrl: 'https://example.test/qr.png', expiresAt: '2026-11-30T00:00:00Z' }
    const request = vi.fn().mockResolvedValue(Response.json(issued, { status: 201 }))
    vi.stubGlobal('fetch', request)

    await expect(createInvite(apiUrl, 'room_1', 'owner-test', 'postit')).resolves.toEqual(issued)
    expect(request).toHaveBeenCalledWith(`${apiUrl}/rooms/room_1/invites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner-test' },
      body: '{"permission":"postit"}',
    })
  })

  it.each(['view', 'postit'] as const)('loads the room and layout using the %s invite token', async (permission) => {
    const room = { roomId: 'room_1' }
    const layout = { layoutId: 'lay_1' }
    const request = vi.fn()
      .mockResolvedValueOnce(Response.json({ ...room, ...layout, guestId: 'guest_1', permission }))
      .mockResolvedValueOnce(Response.json(room))
      .mockResolvedValueOnce(Response.json(layout))
    vi.stubGlobal('fetch', request)

    await expect(loadGuestInvite(apiUrl, 'inv_guest', signal)).resolves.toEqual({ status: 'ready', room, layout, permission })
    const options = { signal, headers: { 'X-Invite-Token': 'inv_guest' } }
    expect(request).toHaveBeenNthCalledWith(1, `${apiUrl}/invites/inv_guest`, { signal })
    expect(request).toHaveBeenNthCalledWith(2, `${apiUrl}/rooms/room_1`, options)
    expect(request).toHaveBeenNthCalledWith(3, `${apiUrl}/layouts/lay_1`, options)
  })

  it.each([[410, 'expired'], [404, 'not-found']])('handles lookup status %s', async (status, state) => {
    const request = vi.fn().mockResolvedValue(new Response(null, { status }))
    vi.stubGlobal('fetch', request)

    await expect(loadGuestInvite(apiUrl, 'inv_guest', signal)).resolves.toEqual({ status: state })
    expect(request).toHaveBeenCalledTimes(1)
  })
})
