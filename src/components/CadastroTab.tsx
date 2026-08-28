import { type FormEvent, useState } from 'react'
import {
  AlertTriangle,
  Boxes,
  DollarSign,
  Edit3,
  Inbox,
  Package,
  Percent,
  Plus,
  Search,
  Trash2,
  Weight,
  Wheat,
  X,
} from 'lucide-react'
import { categoryMeta, categoryOrder, resolveCategoryMeta } from '../lib/categories'
import { fmtBRL, fmtPct, fmtQty } from '../lib/metrics'
import type { Protein, StockCategory, StockUnit } from '../types'
import { Select } from './Select'

const categoryOptions: { value: StockCategory; label: string }[] = categoryOrder.map((category) => ({
  value: category,
  label: categoryMeta[category].label,
}))

const unitOptions: { value: StockUnit; label: string }[] = [
  { value: 'kg', label: 'kg' },
  { value: 'g', label: 'g' },
  { value: 'l', label: 'L' },
  { value: 'ml', label: 'mL' },
  { value: 'un', label: 'un' },
]

const emptyForm = {
  category: 'hortifruti' as StockCategory,
  cost: '',
  minStock: '',
  name: '',
  targetYield: '',
  unit: 'kg' as StockUnit,
}

function formFromProtein(protein: Protein) {
  return {
    category: protein.category,
    cost: protein.cost !== null ? String(protein.cost) : '',
    minStock: protein.min_stock_kg !== null ? String(protein.min_stock_kg) : '',
    name: protein.name,
    targetYield: protein.target_yield !== null ? String(protein.target_yield) : '',
    unit: protein.unit,
  }
}

function CategoryFilterChips({
  categoryFilter,
  presentCategories,
  setCategoryFilter,
}: {
  categoryFilter: StockCategory | 'all'
  presentCategories: StockCategory[]
  setCategoryFilter: (value: StockCategory | 'all') => void
}) {
  if (presentCategories.length <= 1) return null

  return (
    <div className="chart-period-filter">
      <button className={categoryFilter === 'all' ? 'active' : ''} onClick={() => setCategoryFilter('all')} type="button">
        Todas
      </button>
      {presentCategories.map((category) => (
        <button
          className={categoryFilter === category ? 'active' : ''}
          key={category}
          onClick={() => setCategoryFilter(category)}
          type="button"
        >
          {categoryMeta[category].label}
        </button>
      ))}
    </div>
  )
}

export function CadastroTab({
  canManage,
  onConsumeOpenEdit,
  onCreateItem,
  onDeleteItem,
  onUpdateProtein,
  openEditId,
  proteins,
}: {
  canManage: boolean
  onConsumeOpenEdit: () => void
  onCreateItem: (
    name: string,
    category: StockCategory,
    unit: StockUnit,
    cost: number | null,
    targetYield: number | null,
    minStock: number | null,
  ) => Promise<boolean>
  onDeleteItem: (id: string) => Promise<boolean>
  onUpdateProtein: (
    id: string,
    patch: Partial<Pick<Protein, 'name' | 'category' | 'unit' | 'cost' | 'target_yield' | 'active' | 'min_stock_kg'>>,
  ) => void
  openEditId: string | null
  proteins: Protein[]
}) {
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<StockCategory | 'all'>('all')
  const [search, setSearch] = useState('')
  const [lastHandledEditId, setLastHandledEditId] = useState<string | null>(null)

  if (openEditId && openEditId !== lastHandledEditId) {
    setLastHandledEditId(openEditId)
    const protein = proteins.find((item) => item.id === openEditId)
    if (protein) {
      setEditingId(protein.id)
      setForm(formFromProtein(protein))
      setShowForm(true)
    }
    onConsumeOpenEdit()
  }

  const presentCategories = categoryOrder.filter((category) => proteins.some((protein) => protein.category === category))
  const categoryFiltered = categoryFilter === 'all' ? proteins : proteins.filter((protein) => protein.category === categoryFilter)
  const searchedProteins = search.trim()
    ? categoryFiltered.filter((protein) => protein.name.toLowerCase().includes(search.trim().toLowerCase()))
    : categoryFiltered

  function openCreateForm() {
    setEditingId(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  function openEditForm(protein: Protein) {
    setEditingId(protein.id)
    setForm(formFromProtein(protein))
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  async function submitForm(event: FormEvent) {
    event.preventDefault()
    if (!form.name.trim()) return

    setSaving(true)
    const cost = form.cost ? Number(form.cost) : null
    const targetYield = form.targetYield ? Number(form.targetYield) : null
    const minStock = form.minStock ? Number(form.minStock) : null

    if (editingId) {
      onUpdateProtein(editingId, {
        category: form.category,
        cost,
        min_stock_kg: minStock,
        name: form.name.trim(),
        target_yield: targetYield,
        unit: form.unit,
      })
      closeForm()
    } else {
      const ok = await onCreateItem(form.name, form.category, form.unit, cost, targetYield, minStock)
      if (ok) closeForm()
    }
    setSaving(false)
  }

  async function handleDelete(protein: Protein) {
    if (!window.confirm(`Excluir "${protein.name}"? Isso só funciona se ele nunca teve lote, movimentação ou ficha técnica.`)) return
    await onDeleteItem(protein.id)
  }

  return (
    <>
      <div className="section-header-row">
        <div className="section-title">
          <Boxes size={13} />
          Produtos cadastrados
        </div>
        {canManage && (
          <button className="secondary-btn" onClick={() => (showForm ? closeForm() : openCreateForm())} type="button">
            {showForm ? <X size={15} /> : <Plus size={15} />}
            {showForm ? 'Fechar' : 'Novo produto'}
          </button>
        )}
      </div>

      {canManage && showForm && (
        <form className="stock-movement-form ingredient-form stacked-section" onSubmit={submitForm}>
          <label>
            <span className="field-label-text">
              <Boxes size={13} />
              Nome do ingrediente
            </span>
            <input
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Ex.: Alface americana"
              required
              value={form.name}
            />
          </label>
          <label>
            <span className="field-label-text">
              <Wheat size={13} />
              Categoria
            </span>
            <Select
              onChange={(value) => setForm({ ...form, category: value as StockCategory })}
              options={categoryOptions}
              value={form.category}
            />
          </label>
          <label>
            <span className="field-label-text">
              <Weight size={13} />
              Unidade
            </span>
            <Select
              onChange={(value) => setForm({ ...form, unit: value as StockUnit })}
              options={unitOptions}
              value={form.unit}
            />
          </label>
          <label>
            <span className="field-label-text">
              <DollarSign size={13} />
              Custo
            </span>
            <input
              min={0.01}
              onChange={(event) => setForm({ ...form, cost: event.target.value })}
              placeholder="Opcional"
              step="0.01"
              type="number"
              value={form.cost}
            />
          </label>
          <label>
            <span className="field-label-text">
              <Percent size={13} />
              Meta de rendimento
            </span>
            <input
              max={100}
              min={1}
              onChange={(event) => setForm({ ...form, targetYield: event.target.value })}
              placeholder="Opcional"
              type="number"
              value={form.targetYield}
            />
          </label>
          <label>
            <span className="field-label-text">
              <AlertTriangle size={13} />
              Estoque mínimo
            </span>
            <input
              min={0}
              onChange={(event) => setForm({ ...form, minStock: event.target.value })}
              placeholder="Opcional"
              step="0.001"
              type="number"
              value={form.minStock}
            />
          </label>
          <button className="small-action" disabled={saving} type="submit">
            {editingId ? <Edit3 size={15} /> : <Plus size={15} />}
            {saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Cadastrar'}
          </button>
        </form>
      )}

      <div className="section-header-row">
        <CategoryFilterChips categoryFilter={categoryFilter} presentCategories={presentCategories} setCategoryFilter={setCategoryFilter} />
        <label className="stock-search-field">
          <Search size={14} />
          <input onChange={(event) => setSearch(event.target.value)} placeholder="Buscar produto..." value={search} />
          {search && (
            <button onClick={() => setSearch('')} type="button">
              <X size={13} />
            </button>
          )}
        </label>
      </div>

      {searchedProteins.length === 0 ? (
        <div className="empty-state stacked-section">
          <span className="empty-state-icon">
            <Inbox size={16} />
            Nenhum produto cadastrado ainda.
          </span>
        </div>
      ) : (
        <section className="table-shell stacked-section">
          <table>
            <thead>
              <tr>
                <th>Produto</th>
                <th>Categoria</th>
                <th>Unidade</th>
                <th>Custo</th>
                <th>Meta</th>
                <th>Estoque mínimo</th>
                <th>Situação</th>
                {canManage && <th>Ações</th>}
              </tr>
            </thead>
            <tbody>
              {searchedProteins.map((protein) => {
                const CategoryIcon = resolveCategoryMeta(protein.category).icon
                return (
                  <tr className={protein.active ? '' : 'inactive-row'} key={protein.id}>
                    <td>
                      <span className="rend-cell">
                        <CategoryIcon size={14} />
                        {protein.name}
                      </span>
                    </td>
                    <td>{categoryMeta[protein.category].label}</td>
                    <td>{protein.unit}</td>
                    <td>{protein.cost ? fmtBRL(protein.cost) : '-'}</td>
                    <td>{fmtPct(protein.target_yield)}</td>
                    <td>{protein.min_stock_kg ? fmtQty(protein.min_stock_kg, protein.unit) : '-'}</td>
                    <td>
                      <span className={protein.active ? 'active-badge' : 'inactive-badge'}>
                        {protein.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    {canManage && (
                      <td>
                        <div className="row-actions">
                          <button className="icon-btn" onClick={() => openEditForm(protein)} title="Editar" type="button">
                            <Edit3 size={14} />
                          </button>
                          <button
                            className="icon-btn"
                            onClick={() => onUpdateProtein(protein.id, { active: !protein.active })}
                            title={protein.active ? 'Desativar' : 'Reativar'}
                            type="button"
                          >
                            <Package size={14} />
                          </button>
                          <button className="icon-btn danger" onClick={() => handleDelete(protein)} title="Excluir" type="button">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      )}
    </>
  )
}
