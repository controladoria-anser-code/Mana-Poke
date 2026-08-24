import { Beef, Boxes, Carrot, Croissant, CupSoda, Milk, Wheat, type LucideIcon } from 'lucide-react'
import type { StockCategory } from '../types'

export const categoryMeta: Record<StockCategory, { icon: LucideIcon; label: string }> = {
  proteinas: { icon: Beef, label: 'Proteínas' },
  carboidrato: { icon: Croissant, label: 'Carboidrato' },
  hortifruti: { icon: Carrot, label: 'Hortifruti' },
  secos_graos: { icon: Wheat, label: 'Secos e grãos' },
  laticinios: { icon: Milk, label: 'Laticínios' },
  bebidas_insumos: { icon: CupSoda, label: 'Bebidas e insumos' },
  outros: { icon: Boxes, label: 'Outros' },
}

export function resolveCategoryMeta(category: StockCategory) {
  return categoryMeta[category] ?? categoryMeta.outros
}

export const categoryOrder: StockCategory[] = [
  'proteinas',
  'carboidrato',
  'hortifruti',
  'secos_graos',
  'laticinios',
  'bebidas_insumos',
  'outros',
]
