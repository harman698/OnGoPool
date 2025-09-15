import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://jepvxmejoggfjksqtrgh.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImplcHZ4bWVqb2dnZmprc3F0cmdoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5Mzc1ODIsImV4cCI6MjA3MjUxMzU4Mn0.xxdc03qdzdxocvUSlJbStyBkB_HFviCqyevI1cO-_1s'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)