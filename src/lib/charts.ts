export type TrendPoint = { key: string; label: string; value: number | null }

export type Point = { x: number; y: number }

export function trimLeadingAndTrailingGaps(points: TrendPoint[]) {
  const firstIndex = points.findIndex((point) => point.value !== null)
  if (firstIndex === -1) return []
  let lastIndex = points.length - 1
  while (lastIndex > firstIndex && points[lastIndex].value === null) lastIndex -= 1
  return points.slice(firstIndex, lastIndex + 1)
}

export function pickAxisTicks(points: TrendPoint[], maxTicks: number) {
  if (points.length === 0) return []
  if (points.length <= maxTicks) return points.map((_, index) => index)
  const ticks: number[] = []
  for (let i = 0; i < maxTicks; i++) {
    ticks.push(Math.round((i / (maxTicks - 1)) * (points.length - 1)))
  }
  return [...new Set(ticks)]
}

export function smoothPath(points: Point[]) {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)} `
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2
    // O tension do Catmull-Rom pode ultrapassar (overshoot) o y dos dois
    // pontos reais do segmento, criando um vale/pico visual que nenhum dado
    // sustenta — grave o bastante para cruzar uma linha de meta e pintar de
    // "abaixo da meta" um trecho onde nenhum ponto real está abaixo. Prender
    // o y dos control points à faixa [p1.y, p2.y] elimina esse artefato sem
    // achatar a curva no eixo x.
    const segMinY = Math.min(p1.y, p2.y)
    const segMaxY = Math.max(p1.y, p2.y)
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = Math.min(Math.max(p1.y + (p2.y - p0.y) / 6, segMinY), segMaxY)
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = Math.min(Math.max(p2.y - (p3.y - p1.y) / 6, segMinY), segMaxY)
    d += `C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)} ${cp2x.toFixed(2)} ${cp2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} `
  }
  return d
}
