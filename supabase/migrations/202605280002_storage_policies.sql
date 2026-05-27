-- Storage policies for the "documents" bucket.
-- Files are stored under {project_id}/compliance-docs/ and {project_id}/rams/
-- so the first path segment is always the project UUID and the second is the
-- sub-folder. We constrain BOTH to prevent uploads to arbitrary paths.
--
-- Policies:
-- 1. Authenticated users who are members of the project can upload files.
-- 2. Authenticated users who are members of the project can read files.
-- 3. Authenticated users who are members of the project can update files.
-- 4. Authenticated users who are members of the project can delete files.

-- Allow authenticated project members to upload files
CREATE POLICY "Project members can upload documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[2] IN ('compliance-docs', 'rams')
  AND EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = (storage.foldername(name))[1]::uuid
      AND pm.user_id = auth.uid()
  )
);

-- Allow authenticated project members to read/download files
CREATE POLICY "Project members can read documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[2] IN ('compliance-docs', 'rams')
  AND EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = (storage.foldername(name))[1]::uuid
      AND pm.user_id = auth.uid()
  )
);

-- Allow authenticated project members to update files (e.g. replace)
CREATE POLICY "Project members can update documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[2] IN ('compliance-docs', 'rams')
  AND EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = (storage.foldername(name))[1]::uuid
      AND pm.user_id = auth.uid()
  )
);

-- Allow authenticated project members to delete files
CREATE POLICY "Project members can delete documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[2] IN ('compliance-docs', 'rams')
  AND EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = (storage.foldername(name))[1]::uuid
      AND pm.user_id = auth.uid()
  )
);
