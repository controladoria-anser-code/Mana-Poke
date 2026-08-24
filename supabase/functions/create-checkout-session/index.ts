import { createClient } from 'npm:@supabase/supabase-js@2.106.0'
import { corsHeaders } from 'npm:@supabase/supabase-js@2.106.0/cors'
import Stripe from 'npm:stripe@17.5.0'

type PlanSlug = 'chefe-controle' | 'chefe-cozinha' | 'chefe-executivo'

type CheckoutBody = {
  planSlug?: unknown
}

const planPriceEnvVar: Record<PlanSlug, string> = {
  'chefe-controle': 'STRIPE_PRICE_CHEFE_CONTROLE',
  'chefe-cozinha': 'STRIPE_PRICE_CHEFE_COZINHA',
  'chefe-executivo': 'STRIPE_PRICE_CHEFE_EXECUTIVO',
}

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
  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
  const appUrl = Deno.env.get('APP_URL')
  const authorization = request.headers.get('Authorization')

  if (!supabaseUrl || !publishableKey || !secretKey || !stripeSecretKey || !appUrl) {
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
    .select('role, enabled, account_id')
    .eq('id', caller.id)
    .single()

  if (profileLookupError || callerProfile?.role !== 'admin' || !callerProfile.enabled) {
    return jsonResponse({ error: 'Somente administradores podem gerenciar a assinatura.' }, 403)
  }

  let body: CheckoutBody
  try {
    body = (await request.json()) as CheckoutBody
  } catch {
    return jsonResponse({ error: 'Corpo da requisição inválido.' }, 400)
  }

  const planSlug =
    typeof body.planSlug === 'string' && body.planSlug in planPriceEnvVar ? (body.planSlug as PlanSlug) : null

  if (!planSlug) {
    return jsonResponse({ error: 'Plano inválido.' }, 400)
  }

  const priceId = Deno.env.get(planPriceEnvVar[planSlug])
  if (!priceId) {
    return jsonResponse({ error: 'Plano ainda não configurado.' }, 500)
  }

  const { data: account, error: accountLookupError } = await adminClient
    .from('accounts')
    .select('id, name')
    .eq('id', callerProfile.account_id)
    .single()

  if (accountLookupError || !account) {
    return jsonResponse({ error: 'Conta não encontrada.' }, 404)
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: '2024-06-20',
    httpClient: Stripe.createFetchHttpClient(),
  })

  const { data: existingSubscription } = await adminClient
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('account_id', account.id)
    .maybeSingle()

  let customerId = existingSubscription?.stripe_customer_id ?? null

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: caller.email,
      name: account.name,
      metadata: { account_id: account.id },
    })
    customerId = customer.id
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    client_reference_id: account.id,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/?checkout=success`,
    cancel_url: `${appUrl}/?checkout=cancel`,
    metadata: { account_id: account.id, plan_slug: planSlug },
    subscription_data: {
      metadata: { account_id: account.id, plan_slug: planSlug },
    },
  })

  if (!session.url) {
    return jsonResponse({ error: 'Não foi possível iniciar o checkout.' }, 500)
  }

  return jsonResponse({ url: session.url })
})
