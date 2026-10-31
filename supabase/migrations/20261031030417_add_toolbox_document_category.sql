alter table public.documents
  drop constraint documents_category_check,
  add constraint documents_category_check check (
    category in (
      'Safety',
      'Procedures',
      'Templates',
      'Legislation',
      'HR',
      'Checklists',
      'Administration',
      'Miscellaneous',
      'Toolbox'
    )
  );
