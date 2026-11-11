-- BE-10: a student may delete only their own previous avatar under
-- <class_id>/profiles/<auth.uid()>/..., and only while they belong to that
-- class. Teacher delete/update policies remain unchanged.
drop policy if exists "yare_class_materials_avatar_delete_own" on storage.objects;
create policy "yare_class_materials_avatar_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'yare-class-materials'
  and split_part(name, '/', 1) = (public.yare_current_user_class_id())::text
  and split_part(name, '/', 2) = 'profiles'
  and split_part(name, '/', 3) = auth.uid()::text
);
