import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/sky?checkin=1');
}
