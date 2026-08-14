import { redirect } from 'next/navigation';

/** 설정 첫 화면은 브랜딩입니다. (다른 설정이 늘어나면 목록으로 바꿉니다) */
export default function AdminSettingsPage() {
  redirect('/admin/settings/branding');
}
