import type { Role } from '../types'

const roleRank: Record<Role, number> = {
  viewer: 0,
  operador: 1,
  gestor: 2,
  admin: 3,
}

export function canCreateBatch(role: Role) {
  return roleRank[role] >= roleRank.operador
}

export function canDeleteBatch(role: Role) {
  return roleRank[role] >= roleRank.gestor
}

export function canManageProteins(role: Role) {
  return roleRank[role] >= roleRank.gestor
}

export function canViewCosts(role: Role) {
  return roleRank[role] >= roleRank.gestor
}

export function canManageUsers(role: Role) {
  return role === 'admin'
}

export function roleLabel(role: Role) {
  const labels: Record<Role, string> = {
    admin: 'Admin',
    gestor: 'Gestor',
    operador: 'Operador',
    viewer: 'Leitor',
  }

  return labels[role]
}
