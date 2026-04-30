import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
  const { data: rolesData, error: rolesError } = await supabase.from('roles').select('*').limit(1);
  console.log('Roles:', rolesData, rolesError);
  
  const { data: empData, error: empError } = await supabase.from('employees').select('*').limit(1);
  console.log('Employees:', empData, empError);
}
check();
