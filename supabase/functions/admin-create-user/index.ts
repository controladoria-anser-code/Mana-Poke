import { createClient } from 'npm:@supabase/supabase-js@2.106.0'
import { corsHeaders } from 'npm:@supabase/supabase-js@2.106.0/cors'

type Role = 'admin' | 'gestor' | 'operador' | 'viewer'

type CreateUserBody = {
  email?: unknown
  fullName?: unknown
  password?: unknown
  role?: unknown
}

const validRoles = new Set<Role>(['admin', 'gestor', 'operador', 'viewer'])

function readDefaultKey(jsonVariable: string, legacyVariable: string) {
  const keysJson = Deno.env.get(jsonVariable)
  if (keysJson) {
    const keys = JSON.parse(keysJson) as Record<string, string>
    const key = keys.default ?? Object.values(keys)[0]
    if (key) return key
  }

  return Deno.env.get(legacyVariable)
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return Response.json(body, {
    headers: corsHeaders,
    status,
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return jsonResponse({ ok: true })
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido.' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const publishableKey = readDefaultKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY')
  const secretKey = readDefaultKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY')
  const authorization = request.headers.get('Authorization')

  if (!supabaseUrl || !publishableKey || !secretKey) {
    return jsonResponse({ error: 'A função não possui as credenciais necessárias.' }, 500)
  }

  if (!authorization?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Sessão inválida.' }, 401)
  }

  const callerClient = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authorization } },
  })
  const adminClient = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const {
    data: { user: caller },
    error: callerError,
  } = await callerClient.auth.getUser()

  if (callerError || !caller) {
    return jsonResponse({ error: 'Sessão inválida.' }, 401)
  }

  const { data: callerProfile, error: profileLookupError } = await adminClient
    .from('profiles')
    .select('role, enabled')
    .eq('id', caller.id)
    .single()

  if (profileLookupError || callerProfile?.role !== 'admin' || !callerProfile.enabled) {
    return jsonResponse({ error: 'Somente administradores podem criar usuários.' }, 403)
  }

  let body: CreateUserBody
  try {
    body = (await request.json()) as CreateUserBody
  } catch {
    return jsonResponse({ error: 'Corpo da requisição inválido.' }, 400)
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const role = typeof body.role === 'string' && validRoles.has(body.role as Role) ? (body.role as Role) : null

  if (!email || !email.includes('@')) {
    return jsonResponse({ error: 'E-mail inválido.' }, 400)
  }

  if (password.length < 8) {
    return jsonResponse({ error: 'A senha deve ter pelo menos 8 caracteres.' }, 400)
  }

  if (!role) {
    return jsonResponse({ error: 'Nível de acesso inválido.' }, 400)
  }

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
    user_metadata: { full_name: fullName || null },
  })

  if (createError || !created.user) {
    return jsonResponse({ error: createError?.message ?? 'Não foi possível criar o usuário.' }, 400)
  }

  const { error: profileUpdateError } = await adminClient
    .from('profiles')
    .update({ enabled: true, full_name: fullName || null, role })
    .eq('id', created.user.id)
    .select('id')
    .single()

  if (profileUpdateError) {
    await adminClient.auth.admin.deleteUser(created.user.id)
    return jsonResponse({ error: 'O perfil não pôde ser configurado; o usuário não foi mantido.' }, 500)
  }

  return jsonResponse({
    user: {
      email: created.user.email,
      id: created.user.id,
      role,
    },
  })
})
