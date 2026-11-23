// mm(스키마) ↔ m(Three.js) 변환은 이 파일에서만 한다.

/** mm → m (Three.js 렌더용) */
export const mmToM = (mm: number): number => mm / 1000

/** m → mm 정수 (Three.js 좌표를 스키마로 되돌릴 때) */
export const mToMm = (m: number): number => Math.round(m * 1000)

/** rotationDeg(Y축 반시계, 도) → Three.js rotation.y(라디안). Three.js도 Y축 반시계가 +방향이다. */
export const degToRad = (deg: number): number => (deg * Math.PI) / 180
