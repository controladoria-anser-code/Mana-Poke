# Mana Poke System

Sistema interno para controle de rendimento de proteínas, com autenticação, níveis de acesso, histórico auditável de lotes e persistência no Supabase.

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
2. No SQL Editor, execute `supabase/schema.sql`.
3. Em Authentication, desabilite novos cadastros públicos. Os usuários devem ser criados pela tela administrativa do sistema.
4. Crie o primeiro usuário manualmente em Authentication > Users.
5. Promova esse usuário no SQL Editor:

```sql
update public.profiles
set role = 'admin',
    enabled = true
where email = 'administrador@exemplo.com';
```

Esse passo explícito evita que o primeiro visitante de uma implantação vazia se torne administrador.

6. Implante a função protegida de criação de usuários:

```bash
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase functions deploy admin-create-user
```

A função usa as credenciais secretas disponíveis no ambiente do Supabase. Nunca coloque uma chave secreta ou `service_role` no frontend.

7. Copie `.env.example` para `.env.local` e preencha:

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-publica
```

Também são aceitos `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

8. Instale e execute:

```bash
npm install
npm run dev
```

## Atualização de uma instalação existente

Antes de publicar o novo frontend, execute no SQL Editor:

```text
supabase/migrations/202607300001_harden_history_and_access.sql
supabase/migrations/202607300002_grant_view_helper_functions.sql
supabase/migrations/202608030001_enable_audited_batch_edits.sql
```

A migração:

- preserva todos os lotes existentes;
- congela em cada lote o custo disponível no momento da migração;
- substitui exclusões por anulações auditáveis;
- permite correções de lotes por gestor/admin e preserva o antes/depois em log;
- adiciona índices e paginação;
- remove a promoção automática do primeiro cadastro;
- aplica privilégios de coluna e funções administrativas protegidas.

Depois, implante `admin-create-user` e desabilite cadastros públicos no Supabase Auth.

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

- `profiles`: usuários e papéis.
- `proteins`: catálogo, custo atual, meta e estado ativo.
- `batches`: lotes, custo congelado e dados de anulação.
- `batch_edit_logs`: trilha imutável das correções, com autor, justificativa e valores anterior/novo.
- `production_responsibles`: responsáveis disponíveis no formulário.
- `app_settings`: limite sem produção e janela dos indicadores.

As regras críticas vivem no banco: RLS controla linhas, privilégios controlam colunas, triggers calculam e protegem os valores do lote e funções protegidas realizam edições auditáveis, anulações e alterações de papel.
