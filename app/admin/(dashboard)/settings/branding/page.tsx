import { redirect } from 'next/navigation';

/**
 * 브랜딩은 설정 화면의 탭으로 옮겼습니다.
 * 예전 주소로 들어오면 그 탭으로 보냅니다. (북마크가 깨지지 않게)
 */
export default function BrandingSettingsRedirect() {
  redirect('/admin/settings?tab=branding');
}
