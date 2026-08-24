import { type FormEvent, useState } from 'react'
import {
  Archive,
  CreditCard,
  Lock,
  Mail,
  Plus,
  Shield,
  Trash2,
  Undo2,
  User,
  UserPlus,
  Users,
} from 'lucide-react'
import { BUSINESS_TIME_ZONE } from '../lib/metrics'
import { PLAN_DETAILS, SUBSCRIPTION_STATUS_LABEL, SUBSCRIPTION_STATUS_TONE } from '../lib/billing'
import { roleLabel } from '../lib/permissions'
import type { NewUserForm, Profile, ResponsibleOption, Role, Subscription } from '../types'
import { Metric } from './ProductionViews'
import { Select } from './Select'

const roles: Role[] = ['admin', 'gestor', 'operador', 'viewer']
const roleOptions = roles.map((role) => ({ value: role, label: roleLabel(role) }))

const emptyNewUserForm: NewUserForm = {
  email: '',
  fullName: '',
  password: '',
  role: 'operador',
}

export function AccessTab({
  currentUserId,
  onCreateResponsible,
  onCreateUser,
  onDeleteResponsible,
  onManageBilling,
  onToggleUser,
  onUpdateRole,
  profiles,
  responsibleOptions,
  subscription,
}: {
  currentUserId: string
  onCreateResponsible: (name: string) => Promise<boolean>
  onCreateUser: (newUser: NewUserForm) => Promise<boolean>
  onDeleteResponsible: (responsible: ResponsibleOption) => void
  onManageBilling: () => void
  onToggleUser: (profile: Profile) => void
  onUpdateRole: (userId: string, role: Role) => void
  profiles: Profile[]
  responsibleOptions: ResponsibleOption[]
  subscription: Subscription | null
}) {
  const [newUser, setNewUser] = useState<NewUserForm>(emptyNewUserForm)
  const [newResponsible, setNewResponsible] = useState('')
  const [creating, setCreating] = useState(false)
  const [creatingResponsible, setCreatingResponsible] = useState(false)

  async function submitNewUser(event: FormEvent) {
    event.preventDefault()
    setCreating(true)
    const created = await onCreateUser(newUser)
    if (created) setNewUser(emptyNewUserForm)
    setCreating(false)
  }

  async function submitResponsible(event: FormEvent) {
    event.preventDefault()
    setCreatingResponsible(true)
    const created = await onCreateResponsible(newResponsible)
    if (created) setNewResponsible('')
    setCreatingResponsible(false)
  }

  const activeUsers = profiles.filter((profile) => profile.enabled)
  const blockedUsers = profiles.filter((profile) => !profile.enabled)

  return (
    <section className="access-panel">
      <div className="finance-metrics-row">
        <Metric icon={Users} iconMotion="stack" label="Usuários ativos" sub="com acesso liberado" tone="ok" value={String(activeUsers.length)} />
        <Metric
          icon={Archive}
          iconMotion={blockedUsers.length > 0 ? 'fall' : 'rise'}
          label="Usuários bloqueados"
          sub={blockedUsers.length > 0 ? 'Sem acesso' : 'Nenhum'}
          tone={blockedUsers.length > 0 ? 'danger' : 'ok'}
          value={String(blockedUsers.length)}
        />
        <Metric icon={User} iconMotion="stack" label="Responsáveis" sub="cadastrados na produção" tone="accent" value={String(responsibleOptions.length)} />
        <Metric
          icon={CreditCard}
          iconMotion="balance"
          label="Plano atual"
          sub={subscription ? SUBSCRIPTION_STATUS_LABEL[subscription.status] : 'Sem assinatura'}
          tone={subscription ? SUBSCRIPTION_STATUS_TONE[subscription.status] : 'virgin'}
          value={subscription ? PLAN_DETAILS[subscription.plan_slug].name : '-'}
        />
      </div>

      <div className="section-title">
        <CreditCard size={13} />
        Assinatura
      </div>
      <div className="billing-summary">
        {subscription ? (
          <>
            <span>
              <strong>{PLAN_DETAILS[subscription.plan_slug].name}</strong>
            </span>
            <span className={`status-pill ${SUBSCRIPTION_STATUS_TONE[subscription.status]}`}>
              {SUBSCRIPTION_STATUS_LABEL[subscription.status]}
            </span>
            {subscription.current_period_end && (
              <span className="billing-renewal">
                {subscription.cancel_at_period_end ? 'Cancela em' : 'Renova em'}{' '}
                {new Date(subscription.current_period_end).toLocaleDateString('pt-BR', {
                  timeZone: BUSINESS_TIME_ZONE,
                })}
              </span>
            )}
          </>
        ) : (
          <span>Nenhum plano do Controle do Chefe contratado — acesso liberado diretamente (conta legada ou em teste).</span>
        )}
        {subscription && (
          <button className="small-action" type="button" onClick={onManageBilling}>
            <CreditCard size={15} />
            Gerenciar assinatura
          </button>
        )}
      </div>

      <form className="add-user-form" onSubmit={submitNewUser}>
        <div className="section-title compact">
          <UserPlus size={13} />
          Novo usuário
        </div>
        <div className="user-form-grid">
          <label>
            <span className="field-label-text">
              <User size={13} />
              Nome
            </span>
            <input
              autoComplete="name"
              value={newUser.fullName}
              onChange={(event) => setNewUser({ ...newUser, fullName: event.target.value })}
            />
          </label>
          <label>
            <span className="field-label-text">
              <Mail size={13} />
              E-mail
            </span>
            <input
              autoComplete="email"
              required
              type="email"
              value={newUser.email}
              onChange={(event) => setNewUser({ ...newUser, email: event.target.value })}
            />
          </label>
          <label>
            <span className="field-label-text">
              <Lock size={13} />
              Senha
            </span>
            <input
              autoComplete="new-password"
              minLength={8}
              required
              type="password"
              value={newUser.password}
              onChange={(event) => setNewUser({ ...newUser, password: event.target.value })}
            />
          </label>
          <label>
            <span className="field-label-text">
              <Shield size={13} />
              Nível
            </span>
            <Select
              onChange={(value) => setNewUser({ ...newUser, role: value })}
              options={roleOptions}
              value={newUser.role}
            />
          </label>
        </div>
        <button className="small-action" type="submit" disabled={creating}>
          <UserPlus size={15} />
          {creating ? 'Cadastrando...' : 'Cadastrar usuário'}
        </button>
      </form>

      <section className="responsibles-panel">
        <div className="section-title compact">
          <Users size={13} />
          Responsáveis da produção
        </div>
        <form className="responsible-form" onSubmit={submitResponsible}>
          <label>
            <span className="field-label-text">
              <User size={13} />
              Nome do responsável
            </span>
            <input value={newResponsible} onChange={(event) => setNewResponsible(event.target.value)} />
          </label>
          <button className="small-action" type="submit" disabled={creatingResponsible}>
            <Plus size={15} />
            {creatingResponsible ? 'Cadastrando...' : 'Cadastrar'}
          </button>
        </form>
        <div className="responsibles-list">
          {responsibleOptions.map((responsible) => (
            <div className="responsible-row" key={responsible.id}>
              <span>{responsible.name}</span>
              <button
                className="icon-btn danger"
                type="button"
                onClick={() => onDeleteResponsible(responsible)}
                title="Descadastrar responsável"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          {responsibleOptions.length === 0 && <p className="empty-responsibles">Nenhum responsável cadastrado.</p>}
        </div>
      </section>

      <div className="section-title">
        <Users size={13} />
        Usuários
      </div>
      <section className="table-shell">
        <table>
          <thead>
            <tr>
              <th>Usuário</th>
              <th>E-mail</th>
              <th>Nível</th>
              <th>Situação</th>
              <th>Entrada</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((profile) => (
              <tr key={profile.id}>
                <td>{profile.full_name || '-'}</td>
                <td>{profile.email}</td>
                <td>
                  <Select
                    disabled={profile.id === currentUserId}
                    onChange={(value) => onUpdateRole(profile.id, value)}
                    options={roleOptions}
                    value={profile.role}
                  />
                </td>
                <td>
                  <div className="row-actions">
                    <span className={profile.enabled ? 'active-badge' : 'voided-badge'}>
                      {profile.enabled ? 'Ativo' : 'Bloqueado'}
                    </span>
                    {profile.id !== currentUserId && (
                      <button
                        className={`icon-btn ${profile.enabled ? 'danger' : ''}`}
                        onClick={() => onToggleUser(profile)}
                        title={profile.enabled ? 'Bloquear usuário' : 'Habilitar usuário'}
                        type="button"
                      >
                        {profile.enabled ? <Archive size={14} /> : <Undo2 size={14} />}
                      </button>
                    )}
                  </div>
                </td>
                <td>
                  {new Date(profile.created_at).toLocaleDateString('pt-BR', { timeZone: BUSINESS_TIME_ZONE })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </section>
  )
}
