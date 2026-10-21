-- Registro de actividad: la web solo apunta visitas de página (ruta visitada).
-- Hasta ahora cualquier usuario con sesión podía meter filas de cualquier tipo y tamaño;
-- ahora solo se admiten visitas con datos pequeños, para que nadie pueda llenar la base de datos.
alter policy "Users can insert own logs" on public.system_logs
  with check (
    (select auth.uid()) = user_id
    and action_type = 'page_visit'
    and coalesce(pg_column_size(metadata), 0) <= 512
  );
