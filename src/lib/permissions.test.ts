import { describe, expect, it } from 'vitest'
import {
  canCreateBatch,
  canManageProteins,
  canManageUsers,
  canVoidBatch,
  canViewCosts,
  canViewTargets,
} from './permissions'

describe('matriz de permissões', () => {
  it('mantém leitores somente em consulta', () => {
    expect(canCreateBatch('viewer')).toBe(false)
    expect(canVoidBatch('viewer')).toBe(false)
    expect(canManageProteins('viewer')).toBe(false)
    expect(canManageUsers('viewer')).toBe(false)
    expect(canViewCosts('viewer')).toBe(false)
    expect(canViewTargets('viewer')).toBe(false)
  })

  it('permite ao operador apenas registrar produção', () => {
    expect(canCreateBatch('operador')).toBe(true)
    expect(canVoidBatch('operador')).toBe(false)
    expect(canManageProteins('operador')).toBe(false)
  })

  it('reserva usuários ao administrador', () => {
    expect(canManageUsers('gestor')).toBe(false)
    expect(canManageUsers('admin')).toBe(true)
  })
})
