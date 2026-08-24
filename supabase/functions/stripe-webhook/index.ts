import { createClient } from 'npm:@supabase/supabase-js@2.106.0'
import Stripe from 'npm:stripe@17.5.0'

type PlanSlug = 'chefe-controle' | 'chefe-cozinha' | 'chefe-executivo'

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

function planSlugForPriceId(priceId: string | undefined): PlanSlug | null {
  if (!priceId) return null
  for (const [slug, envVar] of Object.entries(planPriceEnvVar) as [PlanSlug, string][]) {
    if (Deno.env.get(envVar) === priceId) return slug
  }
  return null
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return new Response('Método não permitido.', { status: 405 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const secretKey = readDefaultKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY')
  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  const signature = request.headers.get('Stripe-Signature')

  if (!supabaseUrl || !secretKey || !stripeSecretKey || !webhookSecret) {
    return new Response('A função não possui as credenciais necessárias.', { status: 500 })
  }

  if (!signature) {
    return new Response('Assinatura ausente.', { status: 400 })
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: '2024-06-20',
    httpClient: Stripe.createFetchHttpClient(),
  })

  const rawBody = await request.text()

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret)
  } catch (error) {
    return new Response(`Assinatura inválida: ${(error as Error).message}`, { status: 400 })
  }

  const adminClient = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  async function upsertFromSubscription(subscription: Stripe.Subscription, accountIdHint?: string) {
    const accountId = accountIdHint ?? subscription.metadata?.account_id
    if (!accountId) return

    const price = subscription.items.data[0]?.price
    const planSlug = planSlugForPriceId(typeof price?.id === 'string' ? price.id : undefined)
    if (!planSlug) return

    const customerId =
      typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id

    await adminClient.from('subscriptions').upsert(
      {
        account_id: accountId,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        plan_slug: planSlug,
        status: subscription.status,
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        cancel_at_period_end: subscription.cancel_at_period_end,
      },
      { onConflict: 'account_id' },
    )
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      if (session.mode === 'subscription' && typeof session.subscription === 'string') {
        const subscription = await stripe.subscriptions.retrieve(session.subscription)
        await upsertFromSubscription(subscription, session.client_reference_id ?? undefined)
      }
      break
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      await upsertFromSubscription(subscription)
      break
    }
    default:
      break
  }

  return Response.json({ received: true })
})
