import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://oiguejljjpbahqmqqqmf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9pZ3VlamxqanBiYWhxbXFxcW1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNTk3NzYsImV4cCI6MjA5MDYzNTc3Nn0.cx0qIXw9fAsg-WZ_3EOlHiYZxWsooZFqqIU0JvO0LpE';

export const supabase = createClient(supabaseUrl, supabaseKey);
