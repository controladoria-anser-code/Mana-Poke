# Mana Poke System

Sistema multi-tenant (SaaS) de controle de rendimento de proteínas, com autenticação, níveis de acesso, histórico auditável de lotes, assinatura via Stripe e persistência no Supabase. Cada cliente pagante tem sua própria conta (`accounts`) com dados totalmente isolados dos demais.

## Regras de negócio

- `peso bruto`: peso da matéria-prima antes da limpeza ou preparo.
- `peso líquido`: peso aproveitável ao final do mesmo processo.
- `rendimento`: `soma dos pesos líquidos / soma dos pesos brutos × 100`.
- A janela padrão dos indicadores é de 30 dias e pode ser alterada por gestores.
- O custo salvo no lote é um retrato do custo da matéria-prima no momento do lançamento.
- Alterar o custo atual de uma proteína não modifica lotes anteriores.
- Lotes não são apagados. Gestores e administradores podem anulá-los ou corrigir seus dados com justificativa obrigatória.
- Cada correção registra autor, data, justificativa, campos alterados e valores anterior/novo em um log de auditoria.
- Proteínas não são apagadas. Elas podem ser desativadas e reativadas sem perder o histórico.
- Datas operacionais são calculadas no fuso `America/Fortaleza`.
- Cada conta (`accounts`) representa um cliente pagante; todos os dados (`proteins`, `batches`, `profiles` etc.) pertencem a exatamente uma conta e nunca são visíveis entre contas diferentes.
- Cadastro público cria uma conta nova, com a pessoa que se cadastrou como `admin` dessa conta e 7 dias de teste grátis, sem cartão.
- Depois dos 7 dias, sem uma assinatura Stripe ativa, o acesso da conta fica bloqueado até escolher um plano.
- Convidar um colega de equipe (aba Acessos) sempre anexa a pessoa à mesma conta de quem convidou — não cria uma conta nova nem exige assinatura própria.

## Tecnologias

- React, TypeScript e Vite
- Supabase Auth, Postgres, Row Level Security e Edge Functions
- Vitest
- Vercel

## Níveis de acesso

- `admin`: gerencia usuários, responsáveis e todos os dados.
- `gestor`: gerencia proteínas, metas e custos; registra e anula lotes.
- `operador`: registra novos lotes e consulta dados operacionais.
- `viewer`: apenas consulta dados.

Custos e metas ficam ocultos para `operador` e `viewer`, inclusive na API.

## Instalação nova

1. Crie um projeto no Supabase.
2. No SQL Editor, execute `supabase/schema.sql`. Ele já cria o modelo multi-tenant (`accounts`, `subscriptions`) do zero — não precisa rodar as migrações da pasta `supabase/migrations/` em um projeto novo.
3. Em Authentication, **mantenha os cadastros públicos habilitados** (é assim que uma nova conta/cliente é criada). O gatilho `handle_new_user` cria a conta e o primeiro usuário como `admin` automaticamente — não é preciso promover ninguém manualmente.
4. Implante as funções protegidas:

```bash
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase functions deploy admin-create-user
npx supabase functions deploy create-checkout-session
npx supabase functions deploy create-billing-portal-session
npx supabase functions deploy stripe-webhook --no-verify-jwt
```

`stripe-webhook` precisa do `--no-verify-jwt` porque quem chama essa função é o Stripe, não um usuário logado — a segurança dela vem da verificação de assinatura do webhook, não de um JWT do Supabase.

Nenhuma função recebe chave secreta pelo frontend; todas usam as credenciais do ambiente do Supabase (ver seção "Stripe" abaixo para as chaves necessárias).

5. Copie `.env.example` para `.env.local` e preencha:

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-publica
```

Também são aceitos `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

6. Instale e execute:

```bash
npm install
npm run dev
```

## Atualização de uma instalação existente

Antes de publicar o novo frontend, execute no SQL Editor, na ordem:

```text
supabase/migrations/202607300001_harden_history_and_access.sql
supabase/migrations/202607300002_grant_view_helper_functions.sql
supabase/migrations/202608030001_enable_audited_batch_edits.sql
supabase/migrations/202608030002_add_multi_tenant_billing.sql
```

A migração `202608030002`:

- cria `accounts` e `subscriptions`;
- migra todos os dados existentes para uma conta legada (`trial_ends_at` nulo, nunca bloqueada — ninguém que já usa o sistema hoje perde acesso);
- passa a exigir `account_id` em `profiles`, `proteins`, `batches`, `batch_edit_logs`, `production_responsibles` e `app_settings`, e reescreve as políticas de RLS, views e funções (`edit_batch`, `void_batch`, `set_user_role`, `set_user_enabled`) para nunca vazar dados entre contas diferentes;
- reescreve `handle_new_user` para criar uma conta nova (com 7 dias de teste) em todo cadastro público, e anexar convidados (via `admin-create-user`) à conta de quem convidou.

Depois, implante as 4 funções listadas no passo 4 de "Instalação nova" e **habilite os cadastros públicos** no Supabase Auth (a orientação antiga de desabilitar cadastro público não se aplica mais — cadastro público agora é como uma nova conta/cliente entra no sistema).

## Stripe

1. No [dashboard do Stripe](https://dashboard.stripe.com), crie 3 produtos com preços recorrentes mensais, um para cada plano: **Chefe no Controle**, **Chefe de Cozinha**, **Chefe Executivo**. Anote o ID de cada `price` (começa com `price_...`).
2. Configure os segredos das Edge Functions (nunca no `.env` do frontend):

```bash
npx supabase secrets set STRIPE_SECRET_KEY=sk_test_...
npx supabase secrets set STRIPE_PRICE_CHEFE_CONTROLE=price_...
npx supabase secrets set STRIPE_PRICE_CHEFE_COZINHA=price_...
npx supabase secrets set STRIPE_PRICE_CHEFE_EXECUTIVO=price_...
npx supabase secrets set APP_URL=https://seu-dominio.com
```

3. Depois de implantar `stripe-webhook` (passo 4 de "Instalação nova"), pegue a URL pública da função (`https://SEU_PROJECT_REF.supabase.co/functions/v1/stripe-webhook`) e registre-a no Stripe Dashboard em **Developers > Webhooks**, escutando os eventos:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copie o "Signing secret" gerado (`whsec_...`) e configure:

```bash
npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
```

5. Teste com o cartão de teste do Stripe `4242 4242 4242 4242`, qualquer data futura e CVC.

O checkout é sempre um redirecionamento para a página hospedada do Stripe (`Checkout Session`) — o frontend nunca lida com dados de cartão nem carrega Stripe.js, o que mantém a CSP do `vercel.json` inalterada.

## Verificações

```bash
npm run lint
npm test
npm run build
```

O workflow `.github/workflows/ci.yml` executa as três verificações em pushes para `main` e pull requests.

## Deploy na Vercel

Configure:

- Build command: `npm run build`
- Output directory: `dist`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

No Supabase Auth, configure a URL final da Vercel como Site URL e Redirect URL. O cadastro público deve continuar desabilitado.

## Estrutura do banco

- `accounts`: um cliente pagante (tenant). Guarda nome e `trial_ends_at` (nulo = nunca bloqueado, usado pela conta legada criada na migração).
- `subscriptions`: estado da assinatura Stripe de cada conta (`plan_slug`, `status`, período atual). Só é escrita pela função `stripe-webhook`, usando a service role.
- `profiles`: usuários, papéis e a `account_id` a que pertencem.
- `proteins`: catálogo, custo atual, meta e estado ativo — escopado por conta.
- `batches`: lotes, custo congelado e dados de anulação — escopado por conta.
- `batch_edit_logs`: trilha imutável das correções, com autor, justificativa e valores anterior/novo.
- `production_responsibles`: responsáveis disponíveis no formulário.
- `app_settings`: limite sem produção e janela dos indicadores, por conta.

As regras críticas vivem no banco: RLS controla linhas (incluindo o isolamento entre contas e o bloqueio por assinatura vencida via `account_has_access`), privilégios controlam colunas, triggers calculam e protegem os valores do lote e funções protegidas realizam edições auditáveis, anulações e alterações de papel — todas verificando que o alvo pertence à mesma conta de quem chama.
