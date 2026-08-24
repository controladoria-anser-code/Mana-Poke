import { createClient } from 'npm:@supabase/supabase-js@2.106.0'
import { corsHeaders } from 'npm:@supabase/supabase-js@2.106.0/cors'
import Stripe from 'npm:stripe@17.5.0'

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

  const { data: subscription, error: subscriptionLookupError } = await adminClient
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('account_id', callerProfile.account_id)
    .maybeSingle()

  if (subscriptionLookupError || !subscription) {
    return jsonResponse({ error: 'Nenhuma assinatura encontrada para esta conta.' }, 404)
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: '2024-06-20',
    httpClient: Stripe.createFetchHttpClient(),
  })

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: subscription.stripe_customer_id,
    return_url: `${appUrl}/`,
  })

  return jsonResponse({ url: portalSession.url })
})
