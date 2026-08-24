-- Adiciona as categorias "proteína" (item avulso cadastrado manualmente, sem
-- o rastreio de rendimento/custo das proteínas da aba Rendimento) e
-- "carboidrato" ao cadastro de itens de estoque.

reset role;

begin;

alter table public.stock_items
  drop constraint if exists stock_items_category_check;

alter table public.stock_items
  add constraint stock_items_category_check check (
    category in ('proteinas', 'carboidrato', 'hortifruti', 'secos_graos', 'laticinios', 'bebidas_insumos', 'outros')
  );

commit;
