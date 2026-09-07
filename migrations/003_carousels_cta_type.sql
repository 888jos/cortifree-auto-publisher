alter table carousels
  add column if not exists cta_type text not null default 'save';
