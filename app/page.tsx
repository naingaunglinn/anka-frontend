import { redirect } from 'next/navigation';

export default function Home() {
  // Normally you'd check auth here, but for this demo we just redirect to login/dashboard
  redirect('/login');
}
