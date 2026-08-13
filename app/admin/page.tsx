import { redirect } from 'next/navigation';

/** 관리자 첫 화면은 상품 목록입니다. */
export default function AdminIndexPage() {
  redirect('/admin/products');
}
