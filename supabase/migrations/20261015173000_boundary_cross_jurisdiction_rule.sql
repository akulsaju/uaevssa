alter table public.boundary_flows
  add column source_jurisdiction text not null default 'UN'
    check (source_jurisdiction ~ '^[A-Z]{2}$'),
  add column destination_jurisdiction text not null default 'UN'
    check (destination_jurisdiction ~ '^[A-Z]{2}$'),
  add column manual_status text not null default 'compliant'
    check (manual_status in ('compliant', 'at-risk'));

create function public.boundary_evaluate_flow()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.classification in ('PII', 'Financial', 'Sensitive') then
    if new.source_jurisdiction = 'UN' or new.destination_jurisdiction = 'UN' then
      new.status := 'at-risk';
    elsif new.source_jurisdiction <> new.destination_jurisdiction then
      new.status := 'violation';
    else
      new.status := new.manual_status;
    end if;
  else
    new.status := new.manual_status;
  end if;

  return new;
end;
$$;

revoke all on function public.boundary_evaluate_flow() from public, anon, authenticated;

create trigger boundary_flows_evaluate_residency
before insert or update
on public.boundary_flows
for each row execute function public.boundary_evaluate_flow();
