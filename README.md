# Mana Poke System

Sistema online para controle de rendimento de proteínas, com login, níveis de acesso, histórico de lotes e persistência no Supabase.

## Tecnologias

- React + TypeScript + Vite
- Supabase Auth, Postgres e Row Level Security
- Vercel para publicação

## Níveis de acesso

- `admin`: gerencia usuários, proteínas, metas, custos e lotes.
- `gestor`: gerencia proteínas, metas, custos e lotes.
- `operador`: registra novos lotes e consulta dados.
- `viewer`: apenas consulta dados.

## Configuração local

1. Crie um projeto no Supabase.
2. No Supabase, abra `SQL Editor` e execute o arquivo `supabase/schema.sql`.
3. Copie `.env.example` para `.env.local`.
4. Preencha usando o padrão Vite:

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon-publica
```

O projeto também aceita o padrão `NEXT_PUBLIC_SUPABASE_URL` e
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, útil quando a Vercel/Supabase sugerir esses nomes.

5. Rode:

```bash
npm install
npm run dev
```

O primeiro usuário cadastrado vira `admin` automaticamente. Os próximos entram como `operador`, e o admin pode alterar os níveis na aba `Acessos`.

## Deploy na Vercel

1. Suba este projeto para um repositório Git.
2. Importe o repositório na Vercel.
3. Configure as variáveis de ambiente na Vercel. Pode usar o padrão Vite:

```env
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Ou o padrão:

```env
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

4. Build command: `npm run build`
5. Output directory: `dist`

No Supabase Auth, configure também:

- Site URL: URL final da Vercel.
- Redirect URLs: URL final da Vercel e `http://localhost:5173`.

## Banco de dados

O arquivo `supabase/schema.sql` cria:

- `profiles`: usuários e papéis de acesso.
- `proteins`: cadastro de proteínas, custo e meta.
- `batches`: lotes de produção.
- `app_settings`: configurações como dias sem produção para alerta.

As políticas RLS bloqueiam operações indevidas mesmo que alguém tente chamar a API diretamente.
