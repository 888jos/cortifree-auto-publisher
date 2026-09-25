do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'assets_workspace_drive_file_key'
      and conrelid = 'public.assets'::regclass
  ) then
    alter table public.assets
      add constraint assets_workspace_drive_file_key
      unique (workspace_id, drive_file_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'visual_references_drive_unique'
      and conrelid = 'public.visual_references'::regclass
  ) then
    alter table public.visual_references
      add constraint visual_references_drive_unique
      unique (workspace_id, drive_file_id);
  end if;
end $$;
