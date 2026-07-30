import { type FormEvent, useState } from 'react'
import { Archive, Edit3, Eye, Plus, Save, Shield, Trash2, Undo2, UserPlus } from 'lucide-react'
import { BUSINESS_TIME_ZONE } from '../lib/metrics'
import { roleLabel } from '../lib/permissions'
import type { NewUserForm, Profile, ResponsibleOption, Role } from '../types'

const roles: Role[] = ['admin', 'gestor', 'operador', 'viewer']

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
  onToggleUser,
  onUpdateRole,
  profiles,
  responsibleOptions,
}: {
  currentUserId: string
  onCreateResponsible: (name: string) => Promise<boolean>
  onCreateUser: (newUser: NewUserForm) => Promise<boolean>
  onDeleteResponsible: (responsible: ResponsibleOption) => void
  onToggleUser: (profile: Profile) => void
  onUpdateRole: (userId: string, role: Role) => void
  profiles: Profile[]
  responsibleOptions: ResponsibleOption[]
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

  return (
    <section className="access-panel">
      <div className="section-title">Níveis de acesso</div>
      <div className="role-help">
        <span>
          <Shield size={16} /> Admin gerencia usuários e dados.
        </span>
        <span>
          <Edit3 size={16} /> Gestor edita proteínas e anula lotes com justificativa.
        </span>
        <span>
          <Save size={16} /> Operador registra lotes.
        </span>
        <span>
          <Eye size={16} /> Leitor apenas consulta.
        </span>
      </div>

      <form className="add-user-form" onSubmit={submitNewUser}>
        <div className="section-title compact">Novo usuário</div>
        <div className="user-form-grid">
          <label>
            Nome
            <input
              autoComplete="name"
              value={newUser.fullName}
              onChange={(event) => setNewUser({ ...newUser, fullName: event.target.value })}
            />
          </label>
          <label>
            E-mail
            <input
              autoComplete="email"
              required
              type="email"
              value={newUser.email}
              onChange={(event) => setNewUser({ ...newUser, email: event.target.value })}
            />
          </label>
          <label>
            Senha
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
            Nível
            <select value={newUser.role} onChange={(event) => setNewUser({ ...newUser, role: event.target.value as Role })}>
              {roles.map((role) => (
                <option key={role} value={role}>
                  {roleLabel(role)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button className="small-action" type="submit" disabled={creating}>
          <UserPlus size={15} />
          {creating ? 'Cadastrando...' : 'Cadastrar usuário'}
        </button>
      </form>

      <section className="responsibles-panel">
        <div className="section-title compact">Responsáveis da produção</div>
        <form className="responsible-form" onSubmit={submitResponsible}>
          <input
            placeholder="Nome do responsável"
            value={newResponsible}
            onChange={(event) => setNewResponsible(event.target.value)}
          />
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
                  <select
                    disabled={profile.id === currentUserId}
                    onChange={(event) => onUpdateRole(profile.id, event.target.value as Role)}
                    value={profile.role}
                  >
                    {roles.map((role) => (
                      <option key={role} value={role}>
                        {roleLabel(role)}
                      </option>
                    ))}
                  </select>
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
