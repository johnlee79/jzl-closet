/**
 * 화면 표시용 짧은 헬퍼. 서버·클라이언트 어디서나 씁니다.
 */

/** 숫자만 남기고 010-1234-5678 형태로 만듭니다. */
export function formatPhone(value: string): string {
  const digits = value.replace(/[^0-9]/g, '').slice(0, 11);
  if (digits.length < 4) return digits;

  if (digits.length < 8) {
    // 02-1234 처럼 지역번호가 두 자리인 경우를 함께 처리합니다.
    return digits.startsWith('02')
      ? `${digits.slice(0, 2)}-${digits.slice(2)}`
      : `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }
  if (digits.startsWith('02')) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

/** 2026. 8. 14. 오후 3:20 */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('ko-KR');
}

/** 2026. 8. 14. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('ko-KR');
}

/** 이메일 가운데를 가립니다. hello@example.com → he***@example.com */
export function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  if (!domain) return email;
  const head = name.slice(0, 2);
  return `${head}${'*'.repeat(Math.max(1, name.length - 2))}@${domain}`;
}
