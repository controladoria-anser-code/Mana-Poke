import { type FormEvent, type MouseEvent as ReactMouseEvent, useEffect, useState } from 'react'
import {
  ChefHat,
  FileText,
  Inbox,
  Layers,
  MessageSquare,
  Pencil,
  Percent,
  Plus,
  Sparkles,
  Trash2,
  Weight,
  X,
} from 'lucide-react'
import { resolveCategoryMeta } from '../lib/categories'
import { fmtBRL, fmtQty, recipeItemCost, recipeTotalCost } from '../lib/metrics'
import type { Batch, Protein, Recipe, RecipeForm, RecipeItem } from '../types'
import { Select } from './Select'

function handleCardSpotlight(event: ReactMouseEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect()
  event.currentTarget.style.setProperty('--x', `${event.clientX - rect.left}px`)
  event.currentTarget.style.setProperty('--y', `${event.clientY - rect.top}px`)
}

const emptyIngredient = { proteinId: '', quantity: '' }

function buildRecipeItem(item: { proteinId: string; quantity: string }, activeProteins: Protein[]): RecipeItem {
  const protein = activeProteins.find((candidate) => candidate.id === item.proteinId)
  return {
    id: item.proteinId,
    recipe_id: '',
    protein_id: item.proteinId,
    protein_name: protein?.name ?? '',
    protein_unit: protein?.unit ?? 'kg',
    quantity: Number(item.quantity) || 0,
    protein_cost: protein?.cost ?? null,
    protein_target_yield: protein?.target_yield ?? null,
  }
}

function computeRecipePreview(form: RecipeForm, activeProteins: Protein[], metricBatches: Batch[]) {
  const validItems = form.items
    .filter((item) => item.proteinId && Number(item.quantity) > 0)
    .map((item) => buildRecipeItem(item, activeProteins))
  const items = validItems.map((item) => ({ ...item, cost: recipeItemCost(item, metricBatches) }))
  const totalCost = recipeTotalCost(validItems, metricBatches)
  const markup = Number(form.targetMarkup) || 0
  const suggestedPrice = totalCost !== null ? totalCost * markup : null
  return { items, totalCost, suggestedPrice, markup }
}

function RecipeFormFields({
  activeProteins,
  form,
  metricBatches,
  setForm,
}: {
  activeProteins: Protein[]
  form: RecipeForm
  metricBatches: Batch[]
  setForm: (form: RecipeForm) => void
}) {
  const proteinIngredientOptions = [
    { value: '', label: 'Selecione o ingrediente' },
    ...activeProteins.map((protein) => ({
      value: protein.id,
      label: protein.category === 'proteinas' ? protein.name : `${protein.name} · ${resolveCategoryMeta(protein.category).label}`,
    })),
  ]

  function updateItem(index: number, patch: Partial<{ proteinId: string; quantity: string }>) {
    setForm({
      ...form,
      items: form.items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    })
  }

  function addItem() {
    setForm({ ...form, items: [...form.items, { ...emptyIngredient }] })
  }

  function removeItem(index: number) {
    setForm({ ...form, items: form.items.filter((_, itemIndex) => itemIndex !== index) })
  }

  function itemCostFor(item: { proteinId: string; quantity: string }) {
    if (!item.proteinId || !(Number(item.quantity) > 0)) return null
    return recipeItemCost(buildRecipeItem(item, activeProteins), metricBatches)
  }

  const { totalCost: previewTotal, suggestedPrice, markup } = computeRecipePreview(form, activeProteins, metricBatches)

  return (
    <div className="recipe-form-fields">
      <div className="form-grid two">
        <label>
          <span className="field-label-text">
            <FileText size={13} />
            Nome do prato
          </span>
          <input onChange={(event) => setForm({ ...form, name: event.target.value })} required value={form.name} />
        </label>
        <label>
          <span className="field-label-text">
            <Percent size={13} />
            Markup alvo (x)
          </span>
          <input
            min={1}
            onChange={(event) => setForm({ ...form, targetMarkup: event.target.value })}
            required
            step="0.1"
            type="number"
            value={form.targetMarkup}
          />
        </label>
      </div>

      <div className="recipe-form-section">
        <div className="field-label">
          <Layers size={13} />
          Ingredientes
        </div>
        <div className="recipe-item-rows">
          {form.items.map((item, index) => {
            const cost = itemCostFor(item)
            const selectedProtein = activeProteins.find((protein) => protein.id === item.proteinId)
            return (
              <div className="recipe-item-row" key={index}>
                <Select
                  onChange={(value) => updateItem(index, { proteinId: value })}
                  options={proteinIngredientOptions}
                  value={item.proteinId}
                />
                <div className="recipe-item-qty">
                  <Weight size={13} />
                  <input
                    min={0.001}
                    onChange={(event) => updateItem(index, { quantity: event.target.value })}
                    placeholder={`Qtd. (${selectedProtein?.unit ?? 'kg'})`}
                    required
                    step="0.001"
                    type="number"
                    value={item.quantity}
                  />
                </div>
                <span className="recipe-item-cost">{cost !== null ? fmtBRL(cost) : '-'}</span>
                <button
                  className="icon-btn danger"
                  disabled={form.items.length === 1}
                  onClick={() => removeItem(index)}
                  title="Remover ingrediente"
                  type="button"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            )
          })}
        </div>
        <button className="secondary-btn" onClick={addItem} type="button">
          <Plus size={16} />
          Adicionar ingrediente
        </button>
      </div>

      <div className="live-calc two">
        <div className="mini-metric">
          <span>Custo do prato</span>
          <strong>{previewTotal !== null ? fmtBRL(previewTotal) : '-'}</strong>
        </div>
        <div className="mini-metric">
          <span>Preço sugerido ({markup || 0}x)</span>
          <strong className="ok">{suggestedPrice !== null ? fmtBRL(suggestedPrice) : '-'}</strong>
        </div>
      </div>

      <label>
        <span className="field-label-text">
          <MessageSquare size={13} />
          Observações
        </span>
        <textarea onChange={(event) => setForm({ ...form, notes: event.target.value })} rows={2} value={form.notes} />
      </label>
    </div>
  )
}

function RecipePreviewCard({
  activeProteins,
  form,
  metricBatches,
}: {
  activeProteins: Protein[]
  form: RecipeForm
  metricBatches: Batch[]
}) {
  const { items, totalCost, suggestedPrice, markup } = computeRecipePreview(form, activeProteins, metricBatches)

  return (
    <aside className="recipe-preview">
      <article className="protein-card recipe-preview-card">
        <div className="card-accent" />
        <div className="card-body">
          <div className="card-header">
            <div>
              <h2>{form.name.trim() || 'Nome do prato'}</h2>
              <span>
                {items.length} ingrediente{items.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>

          <div className="metrics-grid two">
            <div className="mini-metric">
              <span>Custo do prato</span>
              <strong>{totalCost !== null ? fmtBRL(totalCost) : '-'}</strong>
            </div>
            <div className="mini-metric">
              <span>Preço sugerido ({markup || 0}x)</span>
              <strong className="ok">{suggestedPrice !== null ? fmtBRL(suggestedPrice) : '-'}</strong>
            </div>
          </div>

          {items.length > 0 ? (
            <ul className="recipe-item-list detailed">
              {items.map((item) => (
                <li key={item.protein_id}>
                  <span>
                    {item.protein_name} · {fmtQty(item.quantity, item.protein_unit)}
                  </span>
                  <span>{item.cost !== null ? fmtBRL(item.cost) : '-'}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-state">
              <span className="empty-state-icon">
                <Inbox size={16} />
                Adicione ingredientes para ver o custo.
              </span>
            </p>
          )}

          {form.notes.trim() && <p className="recipe-notes">{form.notes}</p>}
        </div>
      </article>
      <span className="recipe-preview-tag">
        <Sparkles size={12} />
        Prévia em tempo real
      </span>
    </aside>
  )
}

function InlineRecipeForm({
  activeProteins,
  metricBatches,
  onSubmit,
}: {
  activeProteins: Protein[]
  metricBatches: Batch[]
  onSubmit: (form: RecipeForm) => void
}) {
  const [form, setForm] = useState<RecipeForm>({ name: '', targetMarkup: '3', notes: '', items: [{ ...emptyIngredient }] })

  function submit(event: FormEvent) {
    event.preventDefault()
    const validItems = form.items.filter((item) => item.proteinId && Number(item.quantity) > 0)
    if (!form.name.trim() || validItems.length === 0) return
    onSubmit({ ...form, items: validItems })
  }

  return (
    <div className="recipe-builder">
      <div className="recipe-builder-header">
        <div className="recipe-builder-header-icon">
          <ChefHat size={24} />
        </div>
        <div>
          <h2>Cadastre sua primeira ficha técnica</h2>
          <span>Defina os ingredientes e o sistema calcula o custo real e o preço sugerido a partir do rendimento de cada um.</span>
        </div>
      </div>

      <form className="recipe-builder-grid" onSubmit={submit}>
        <div className="recipe-builder-form">
          <RecipeFormFields activeProteins={activeProteins} form={form} metricBatches={metricBatches} setForm={setForm} />
          <div className="recipe-builder-actions">
            <button className="primary-btn large" type="submit">
              <Plus size={18} />
              Criar ficha técnica
            </button>
          </div>
        </div>

        <RecipePreviewCard activeProteins={activeProteins} form={form} metricBatches={metricBatches} />
      </form>
    </div>
  )
}

export function RecipesTab({
  activeProteins,
  canManage,
  metricBatches,
  onCreateRecipe,
  onDeleteRecipe,
  onOpenRecipeModal,
  recipeItems,
  recipes,
}: {
  activeProteins: Protein[]
  canManage: boolean
  metricBatches: Batch[]
  onCreateRecipe: (form: RecipeForm) => void
  onDeleteRecipe: (recipe: Recipe) => void
  onOpenRecipeModal: (recipe: Recipe | null) => void
  recipeItems: RecipeItem[]
  recipes: Recipe[]
}) {
  const itemsByRecipe = new Map<string, RecipeItem[]>()
  for (const item of recipeItems) {
    const list = itemsByRecipe.get(item.recipe_id) ?? []
    list.push(item)
    itemsByRecipe.set(item.recipe_id, list)
  }

  return (
    <>
      <div className="section-title">
        <FileText size={13} />
        Fichas técnicas
      </div>

      {recipes.length > 0 && canManage && (
        <div className="tab-actions-row">
          <button className="new-batch-btn" type="button" onClick={() => onOpenRecipeModal(null)}>
            <Plus size={16} />
            Nova ficha técnica
          </button>
        </div>
      )}

      {recipes.length === 0 ? (
        canManage ? (
          <InlineRecipeForm activeProteins={activeProteins} metricBatches={metricBatches} onSubmit={onCreateRecipe} />
        ) : (
          <p className="empty-state">
            <span className="empty-state-icon">
              <Inbox size={16} />
              Nenhuma ficha técnica cadastrada ainda.
            </span>
          </p>
        )
      ) : (
        <section className="proteins-grid">
          {recipes.map((recipe) => {
            const items = itemsByRecipe.get(recipe.id) ?? []
            const totalCost = recipeTotalCost(items, metricBatches)
            const suggestedPrice = totalCost !== null ? totalCost * recipe.target_markup : null

            return (
              <article className="protein-card" key={recipe.id} onMouseMove={handleCardSpotlight}>
                <div className="card-accent" />
                <div className="card-body">
                  <div className="card-header">
                    <div>
                      <h2>{recipe.name}</h2>
                      <span>
                        {items.length} ingrediente{items.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    {!recipe.active && <span className="status-pill virgin">Inativa</span>}
                  </div>

                  <div className="metrics-grid two">
                    <div className="mini-metric">
                      <span>Custo do prato</span>
                      <strong>{totalCost !== null ? fmtBRL(totalCost) : '-'}</strong>
                    </div>
                    <div className="mini-metric">
                      <span>Preço sugerido ({recipe.target_markup}x)</span>
                      <strong className="ok">{suggestedPrice !== null ? fmtBRL(suggestedPrice) : '-'}</strong>
                    </div>
                  </div>

                  {items.length > 0 && (
                    <ul className="recipe-item-list">
                      {items.map((item) => (
                        <li key={item.id}>
                          <span>{item.protein_name}</span>
                          <span>{fmtQty(item.quantity, item.protein_unit)}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {recipe.notes && <p className="recipe-notes">{recipe.notes}</p>}

                  {canManage && (
                    <footer className="card-footer">
                      <span />
                      <div className="row-actions">
                        <button
                          className="icon-btn"
                          onClick={() => onOpenRecipeModal(recipe)}
                          title="Editar ficha técnica"
                          type="button"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          className="icon-btn danger"
                          onClick={() => onDeleteRecipe(recipe)}
                          title="Excluir ficha técnica"
                          type="button"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </footer>
                  )}
                </div>
              </article>
            )
          })}
        </section>
      )}
    </>
  )
}

export function RecipeModal({
  activeProteins,
  editingRecipe,
  editingItems,
  metricBatches,
  onClose,
  onSubmit,
}: {
  activeProteins: Protein[]
  editingRecipe: Recipe | null
  editingItems: RecipeItem[]
  metricBatches: Batch[]
  onClose: () => void
  onSubmit: (form: RecipeForm) => void
}) {
  const [form, setForm] = useState<RecipeForm>(() => ({
    name: editingRecipe?.name ?? '',
    targetMarkup: editingRecipe ? String(editingRecipe.target_markup) : '3',
    notes: editingRecipe?.notes ?? '',
    items: editingItems.length
      ? editingItems.map((item) => ({ proteinId: item.protein_id, quantity: String(item.quantity) }))
      : [{ ...emptyIngredient }],
  }))

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose])

  function submit(event: FormEvent) {
    event.preventDefault()
    const validItems = form.items.filter((item) => item.proteinId && Number(item.quantity) > 0)
    if (!form.name.trim() || validItems.length === 0) return
    onSubmit({ ...form, items: validItems })
  }

  return (
    <div
      aria-labelledby="recipe-modal-title"
      aria-modal="true"
      className="overlay"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
      role="dialog"
    >
      <form className="modal" onSubmit={submit}>
        <header className="modal-header">
          <div>
            <h2 id="recipe-modal-title">{editingRecipe ? 'Editar ficha técnica' : 'Nova ficha técnica'}</h2>
            <span>Custo e preço calculados a partir do rendimento real</span>
          </div>
          <button className="icon-btn ghost" type="button" onClick={onClose} title="Fechar">
            <X size={18} />
          </button>
        </header>

        <div className="modal-body">
          <RecipeFormFields activeProteins={activeProteins} form={form} metricBatches={metricBatches} setForm={setForm} />
        </div>

        <footer className="modal-footer">
          <button className="secondary-btn" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-btn" type="submit">
            {editingRecipe ? 'Salvar alteração' : 'Criar ficha técnica'}
          </button>
        </footer>
      </form>
    </div>
  )
}
