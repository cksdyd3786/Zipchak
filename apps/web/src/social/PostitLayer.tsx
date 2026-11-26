import { Html } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { CanvasTexture, DoubleSide, Quaternion, SRGBColorSpace, Vector3, type MeshBasicMaterial } from 'three'
import { degToRad, mmToM, mToMm } from '../lib/units'
import { Furniture } from '../scene/Furniture'
import { RoomScene } from '../scene/RoomScene'
import type { FurnitureLayout, RoomData } from '../types/schema'
import { toPostitAnchor } from './postitAnchor'
import './postitLayer.css'

type PostitAnchor = ReturnType<typeof toPostitAnchor>

const noteLabels = { guestbook: '방명록', proposal: '배치 제안' } as const
type NoteType = keyof typeof noteLabels

type FloorPosition = { x: number; z: number }
type PlacementProposal = {
  furnitureInstanceId: string
  suggestedPosition: FloorPosition
  suggestedRotationDeg: 0 | 90 | 180 | 270
}

type RoomNote = {
  id: number
  type: NoteType
  anchor: PostitAnchor
  text: string
  proposal?: PlacementProposal
}

type StoredRoomNote = Omit<RoomNote, 'type'> & { type?: NoteType }

const noteLimit = 140
const paperColor = '#ffe380'


function isVector(value: unknown): value is { x: number; y: number; z: number } {
  if (!value || typeof value !== 'object') return false
  const vector = value as Record<string, unknown>
  return ['x', 'y', 'z'].every((axis) => typeof vector[axis] === 'number' && Number.isFinite(vector[axis]))
}

function isRoomNote(value: unknown): value is StoredRoomNote {
  if (!value || typeof value !== 'object') return false
  const note = value as Partial<RoomNote>
  const anchor = note.anchor
  if (!Number.isSafeInteger(note.id) || typeof note.text !== 'string' || !note.text.trim()) return false
  if (!anchor || !isVector(anchor.point) || !isVector(anchor.normal)) return false
  if (note.type !== undefined && note.type !== 'guestbook' && note.type !== 'proposal') return false
  if (note.type === 'proposal' && anchor.targetType !== 'furniture') return false
  const proposal = note.proposal
  if (proposal !== undefined && (
    !proposal || note.type !== 'proposal'
    || proposal.furnitureInstanceId !== anchor.furnitureInstanceId
    || !Number.isSafeInteger(proposal.suggestedPosition?.x)
    || !Number.isSafeInteger(proposal.suggestedPosition?.z)
    || ![0, 90, 180, 270].includes(proposal.suggestedRotationDeg)
  )) return false

  return (anchor.targetType === 'wall' && typeof anchor.targetId === 'string' && anchor.furnitureInstanceId === null)
    || (anchor.targetType === 'furniture' && typeof anchor.furnitureInstanceId === 'string' && anchor.targetId === null)
}

function readNotes(storageKey: string): RoomNote[] {
  try {
    const stored = window.localStorage.getItem(storageKey)
    if (!stored) return []
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isRoomNote).map((note) => ({ ...note, type: note.type ?? 'guestbook' }))
  } catch {
    return []
  }
}

type SurfaceProps = {
  type: 'wall' | 'furniture'
  id: string
  position?: [number, number, number]
  rotationY?: number
  children: ReactNode
  onAnchor?: (anchor: PostitAnchor) => void
}

export function PostitLayer({ type, id, position, rotationY, children, onAnchor }: SurfaceProps) {
  function reportClick(event: ThreeEvent<MouseEvent>) {
    if (!event.face || event.delta > 4) return
    event.stopPropagation()

    const target = type === 'wall'
      ? { type, id }
      : { type, id, frame: event.eventObject }

    const anchor = toPostitAnchor(event.object, event.point, event.face.normal, target)
    if (onAnchor) onAnchor(anchor)
    else console.log('postit anchor', anchor)
  }

  return (
    <group position={position} rotation-y={rotationY} onClick={reportClick}>
      {children}
    </group>
  )
}

type PreviewControls = {
  previewing?: boolean
  onTogglePreview?: () => void
}

function PostitPaperMaterial({ text }: { text?: string }) {
  const materialRef = useRef<MeshBasicMaterial>(null)

  useEffect(() => {
    const material = materialRef.current
    if (!material || !text) return

    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 256
    const context = canvas.getContext('2d')
    if (!context) return

    context.fillStyle = paperColor
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = '#392e15'
    context.font = '600 31px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif'
    context.textBaseline = 'top'

    const maxWidth = 208
    const maxLines = 4
    const lines: string[] = []
    let line = ''
    let truncated = false
    for (const character of text) {
      if (character === '\n' || context.measureText(line + character).width > maxWidth) {
        lines.push(line.trimEnd())
        if (lines.length === maxLines) {
          truncated = true
          break
        }
        line = character === '\n' ? '' : character.trimStart()
      } else {
        line += character
      }
    }
    if (!truncated) lines.push(line)

    if (truncated) {
      const last = Array.from(lines[maxLines - 1])
      while (last.length && context.measureText(last.join('') + '…').width > maxWidth) last.pop()
      lines[maxLines - 1] = last.join('').trimEnd() + '…'
    }
    lines.forEach((textLine, index) => context.fillText(textLine, 24, 24 + index * 46))

    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    material.color.set('#ffffff')
    material.map = texture
    material.needsUpdate = true

    return () => {
      material.map = null
      material.color.set(paperColor)
      material.needsUpdate = true
      texture.dispose()
    }
  }, [text])

  return <meshBasicMaterial ref={materialRef} color={paperColor} side={DoubleSide} />
}

function PostitMarker({ anchor, text, type, previewing, onTogglePreview }: PreviewControls & {
  anchor: PostitAnchor
  text?: string
  type?: NoteType
}) {
  const [hovered, setHovered] = useState(false)
  const [pinned, setPinned] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const contentId = useId()
  const saved = text !== undefined && type !== undefined
  const expanded = hovered || pinned
  const normal = new Vector3(anchor.normal.x, anchor.normal.y, anchor.normal.z).normalize()
  const { x, y, z } = anchor.point
  const position = new Vector3(mmToM(x), mmToM(y), mmToM(z)).addScaledVector(normal, 0.006)
  const rotation = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), normal)

  useEffect(() => () => clearTimeout(leaveTimer.current), [])

  function showHover() {
    clearTimeout(leaveTimer.current)
    setHovered(true)
  }

  function hideHover() {
    clearTimeout(leaveTimer.current)
    leaveTimer.current = setTimeout(() => setHovered(false), 160)
  }

  function close() {
    clearTimeout(leaveTimer.current)
    setHovered(false)
    setPinned(false)
    if (previewing) onTogglePreview?.()
    trigger.current?.focus()
  }

  return (
    <>
      <mesh
        position={position}
        quaternion={rotation}
        raycast={saved ? undefined : () => null}
        onPointerOver={saved ? (event) => {
          event.stopPropagation()
          if (event.pointerType === 'mouse') showHover()
        } : undefined}
        onPointerMove={saved ? (event) => {
          if (event.pointerType !== 'touch') {
            event.stopPropagation()
            showHover()
          }
        } : undefined}
        onPointerOut={saved ? hideHover : undefined}
        onClick={saved ? (event) => {
          event.stopPropagation()
          if (event.delta <= 4) setPinned(true)
        } : undefined}
      >
        <planeGeometry args={[0.22, 0.22]} />
        <PostitPaperMaterial text={text} />
      </mesh>
      {saved && (
        <Html
          position={position.clone().addScaledVector(normal, 0.006)}
          center
          zIndexRange={[16777300, 16777290]}
          style={{ pointerEvents: expanded ? 'auto' : 'none' }}
        >
          <div
            className="postit-popover"
            onPointerEnter={(event) => { if (event.pointerType === 'mouse') showHover() }}
            onPointerLeave={hideHover}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => { if (event.key === 'Escape' && expanded) close() }}
          >
            <button
              ref={trigger}
              type="button"
              aria-label={`${noteLabels[type]} 포스트잇 열기`}
              aria-expanded={expanded}
              aria-controls={expanded ? contentId : undefined}
              onClick={() => setPinned(true)}
              className="postit-popover__keyboard-trigger"
            />
              {expanded && (
                <div className="postit-popover__offset">
                  <div id={contentId} className="postit-popover__note">
                    <div className="postit-popover__header">
                      <strong>{noteLabels[type]}</strong>
                      <button
                        type="button"
                        aria-label="포스트잇 닫기"
                        onClick={close}
                        className="postit-popover__close"
                      >
                        ×
                      </button>
                    </div>
                    <div className="postit-popover__text">{text}</div>
                    {onTogglePreview && (
                      <button
                        type="button"
                        aria-pressed={previewing}
                        onClick={() => {
                          setPinned(true)
                          onTogglePreview()
                        }}
                        className="postit-popover__preview"
                      >
                        {previewing ? '미리보기 끄기' : '배치 미리보기'}
                      </button>
                    )}
                  </div>
                </div>
              )}
          </div>
        </Html>
      )}
    </>
  )
}

function canPlaceFurniture(
  room: RoomData,
  item: { dimensions: { width: number; depth: number } },
  target: FloorPosition,
  rotation: number,
) {
  const turned = rotation % 180 !== 0
  const halfWidth = (turned ? item.dimensions.depth : item.dimensions.width) / 2
  const halfDepth = (turned ? item.dimensions.width : item.dimensions.depth) / 2

  function crossesFootprint(start: FloorPosition, end: FloorPosition) {
    let entry = 0
    let exit = 1
    for (const [from, to, center, halfSize] of [
      [start.x, end.x, target.x, halfWidth],
      [start.z, end.z, target.z, halfDepth],
    ]) {
      const min = center - halfSize + 0.001
      const max = center + halfSize - 0.001
      const distance = to - from
      if (distance === 0) {
        if (from <= min || from >= max) return false
        continue
      }
      const first = (min - from) / distance
      const last = (max - from) / distance
      entry = Math.max(entry, Math.min(first, last))
      exit = Math.min(exit, Math.max(first, last))
      if (entry >= exit) return false
    }
    return true
  }

  const polygon = room.floorPolygon
  let inside = false
  for (let i = 0; i < polygon.length; i++) {
    const start = polygon[i]
    const end = polygon[(i + 1) % polygon.length]
    if (crossesFootprint(start, end)) return false
    if ((start.z > target.z) !== (end.z > target.z)) {
      const edgeX = start.x + (target.z - start.z) * (end.x - start.x) / (end.z - start.z)
      if (target.x < edgeX) inside = !inside
    }
  }
  return inside && !room.walls.some((wall) => crossesFootprint(wall.start, wall.end))
}

type PostitRoomProps = { room: RoomData; layout?: FurnitureLayout | null }

export function PostitRoom({ room, layout }: PostitRoomProps) {
  const storageKey = `zipchak:room-postits:v1:${JSON.stringify([room.roomId, layout?.layoutId ?? null])}`
  return <RoomPostits key={storageKey} room={room} layout={layout} storageKey={storageKey} />
}

function RoomPostits({ room, layout, storageKey }: PostitRoomProps & { storageKey: string }) {
  const [anchor, setAnchor] = useState<PostitAnchor>()
  const [text, setText] = useState('')
  const [noteType, setNoteType] = useState<NoteType>('guestbook')
  const [destination, setDestination] = useState<FloorPosition>()
  const [hoverDestination, setHoverDestination] = useState<FloorPosition>()
  const [notes, setNotes] = useState(() => readNotes(storageKey))
  const [previewNoteId, setPreviewNoteId] = useState<number>()
  const [storageError, setStorageError] = useState(false)
  const trimmedText = text.trim()
  const characterCount = Array.from(trimmedText).length
  const isProposal = noteType === 'proposal'
  const needsDestination = isProposal && !destination
  const furniture = layout?.placements ?? room.existingFurniture
  const pickedFurniture = furniture.find((item) => item.instanceId === anchor?.furnitureInstanceId)
  const positionBlocked = !!(isProposal && pickedFurniture && destination &&
    !canPlaceFurniture(room, pickedFurniture, destination, pickedFurniture.rotationDeg))
  const canSave = characterCount > 0 && characterCount <= noteLimit && !needsDestination && !positionBlocked
  const proposedPosition = destination ?? hoverDestination
  const draftProposal: PlacementProposal | undefined = isProposal && pickedFurniture && proposedPosition
    ? {
      furnitureInstanceId: pickedFurniture.instanceId,
      suggestedPosition: proposedPosition,
      suggestedRotationDeg: pickedFurniture.rotationDeg,
    }
    : undefined
  const preview = notes.find((note) => note.id === previewNoteId)?.proposal ?? draftProposal
  const previewFurniture = furniture.find((item) => item.instanceId === preview?.furnitureInstanceId)
  const previewBlocked = !!(preview && previewFurniture &&
    !canPlaceFurniture(room, previewFurniture, preview.suggestedPosition, preview.suggestedRotationDeg))

  function selectAnchor(nextAnchor: PostitAnchor) {
    setAnchor(nextAnchor)
    if (nextAnchor.targetType === 'wall') setNoteType('guestbook')
    if (anchor?.furnitureInstanceId !== nextAnchor.furnitureInstanceId) setDestination(undefined)
  }

  function followFloor(event: ThreeEvent<PointerEvent>) {
    if (destination || !isProposal || !pickedFurniture || event.pointerType === 'touch' || event.buttons !== 0) return
    const target = { x: mToMm(event.point.x), z: mToMm(event.point.z) }
    setPreviewNoteId(undefined)
    setHoverDestination((current) =>
      current?.x === target.x && current.z === target.z ? current : target,
    )
  }

  function pickDestination(event: ThreeEvent<MouseEvent>) {
    if (noteType !== 'proposal' || anchor?.targetType !== 'furniture' || event.delta > 4) return
    event.stopPropagation()
    setPreviewNoteId(undefined)
    const target = { x: mToMm(event.point.x), z: mToMm(event.point.z) }
    if (!pickedFurniture) return
    if (!canPlaceFurniture(room, pickedFurniture, target, pickedFurniture.rotationDeg)) {
      setDestination(undefined)
      setHoverDestination(target)
      return
    }
    setHoverDestination(undefined)
    setDestination(target)
  }

  function closeEditor() {
    setAnchor(undefined)
    setText('')
    setNoteType('guestbook')
    setDestination(undefined)
  }

  function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!anchor || !canSave || (isProposal && !draftProposal)) return
    const id = notes.reduce((latest, note) => Math.max(latest, note.id), 0) + 1
    const updatedNotes = [...notes, { id, type: noteType, anchor, text: trimmedText, proposal: draftProposal }]
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(updatedNotes))
      setStorageError(false)
    } catch {
      setStorageError(true)
    }
    setNotes(updatedNotes)
    closeEditor()
  }

  return (
    <main className="postit-page">
      <div className="postit-workspace">
        <section className="postit-editor" aria-label="포스트잇 작성">
          <header className="postit-page__header">
            <h1>포스트잇 남기기</h1>
            <p>{room.name}</p>
            <p>벽이나 가구에 방명록을 남겨보세요. 가구를 누르면 배치도 제안할 수 있어요.</p>
          </header>
          {storageError && <p className="postit-page__warning" role="status">브라우저에 저장하지 못했어요. 새로고침하면 이 메모가 사라질 수 있어요.</p>}
          {anchor && <h2>새 포스트잇</h2>}
          {anchor ? (
            <form onSubmit={saveNote}>
              <label htmlFor="postit-type">메모 유형</label>
              <select id="postit-type" value={noteType} onChange={(event) => {
                setNoteType(event.currentTarget.value === 'proposal' ? 'proposal' : 'guestbook')
                setDestination(undefined)
              }}>
                <option value="guestbook">{noteLabels.guestbook}</option>
                <option value="proposal" disabled={anchor.targetType !== 'furniture'}>{noteLabels.proposal}</option>
              </select>
              {anchor.targetType === 'wall' && <small>배치 제안을 남기려면 가구를 클릭하세요.</small>}
              {noteType === 'proposal' && (
                <small role="status">
                  {positionBlocked || (!destination && hoverDestination && previewBlocked) ? '가구가 벽에 걸쳐요. 방 안쪽을 눌러주세요.' : destination
                    ? '반투명 가구로 배치를 확인하세요. 다른 바닥 위치를 누르면 미리보기가 바뀌어요.'
                    : '바닥 위에서 마우스를 움직이고, 원하는 위치를 클릭해 확정하세요.'}
                </small>
              )}
              <label htmlFor="postit-text">포스트잇 내용</label>
              <textarea id="postit-text" rows={2} placeholder="메모를 입력하세요" value={text} onChange={(event) => setText(event.currentTarget.value)} />
              <div className="postit-editor__actions">
                {isProposal && destination && (
                  <button className="postit-editor__cancel" type="button" onClick={() => setDestination(undefined)}>
                    위치 다시 고르기
                  </button>
                )}
                <button className="postit-editor__primary" type="submit" disabled={!canSave}>
                  {positionBlocked ? '다른 위치 선택' : needsDestination ? '먼저 바닥 위치 선택' : characterCount === 0 ? '먼저 메모 입력' : '붙이기'}
                </button>
                <button className="postit-editor__cancel" type="button" onClick={closeEditor}>취소</button>
                <span className="postit-editor__count">{characterCount}/{noteLimit}자</span>
              </div>
            </form>
          ) : null}
          <div className="postit-view__help">드래그로 회전 · 휠로 확대/축소</div>
        </section>
        <section className="postit-view" aria-label="3D 방">
          <div className="postit-view__canvas">
            <RoomScene
              room={room}
              layout={layout}
              wrapWall={(wall, surface) => (
                <PostitLayer type="wall" id={wall.id} onAnchor={selectAnchor}>
                  {surface}
                </PostitLayer>
              )}
              wrapFloor={(surface) => (
                <group onClick={pickDestination} onPointerMove={followFloor} onPointerOut={() => setHoverDestination(undefined)}>
                  {surface}
                </group>
              )}
              furniture={
                <>
                  {furniture.map((item) => (
                    <PostitLayer
                      key={item.instanceId}
                      type="furniture"
                      id={item.instanceId}
                      position={[mmToM(item.position.x), 0, mmToM(item.position.z)]}
                      rotationY={degToRad(item.rotationDeg)}
                      onAnchor={selectAnchor}
                    >
                      <Furniture items={[{ ...item, position: { x: 0, z: 0 }, rotationDeg: 0 }]} />
                      {notes.filter((note) => note.anchor.furnitureInstanceId === item.instanceId).map((note) => (
                        <PostitMarker
                          key={note.id}
                          anchor={note.anchor}
                          text={note.text}
                          type={note.type}
                          previewing={previewNoteId === note.id}
                          onTogglePreview={note.proposal ? () => {
                            setPreviewNoteId((current) => current === note.id ? undefined : note.id)
                          } : undefined}
                        />
                      ))}
                      {anchor?.furnitureInstanceId === item.instanceId && <PostitMarker anchor={anchor} />}
                    </PostitLayer>
                  ))}
                  {notes.filter((note) => room.walls.some((wall) => wall.id === note.anchor.targetId)).map((note) => (
                    <PostitMarker key={note.id} anchor={note.anchor} text={note.text} type={note.type} />
                  ))}
                  {anchor?.targetType === 'wall' && <PostitMarker anchor={anchor} />}
                  {positionBlocked || (!destination && hoverDestination && previewBlocked) ? '가구가 벽에 걸쳐요. 방 안쪽을 눌러주세요.' : destination && (
                    <mesh
                      position={[mmToM(destination.x), 0.01, mmToM(destination.z)]}
                      rotation-x={-Math.PI / 2}
                      raycast={() => null}
                    >
                      <ringGeometry args={[0.085, 0.115, 32]} />
                      <meshBasicMaterial color="#2f6fed" side={DoubleSide} />
                    </mesh>
                  )}
                  {preview && previewFurniture && (
                    <mesh
                      position={[mmToM(preview.suggestedPosition.x), mmToM(previewFurniture.dimensions.height) / 2, mmToM(preview.suggestedPosition.z)]}
                      rotation-y={degToRad(preview.suggestedRotationDeg)}
                      raycast={() => null}
                    >
                      <boxGeometry args={[
                        mmToM(previewFurniture.dimensions.width),
                        mmToM(previewFurniture.dimensions.height),
                        mmToM(previewFurniture.dimensions.depth),
                      ]} />
                      <meshBasicMaterial color={previewBlocked ? "#ef4444" : "#2563eb"} transparent opacity={0.4} depthWrite={false} />
                    </mesh>
                  )}
                </>
              }
            />
          </div>
        </section>
      </div>
    </main>
  )
}
