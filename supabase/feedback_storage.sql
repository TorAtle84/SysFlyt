-- Create feedback storage bucket (private)
-- Run in Supabase SQL Editor
insert into storage.buckets (id, name, public)
values ('feedback', 'feedback', false)
on conflict (id) do nothing;
