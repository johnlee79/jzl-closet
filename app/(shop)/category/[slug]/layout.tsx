import type { ReactNode } from 'react';
import ProductFilterProvider from '@/components/ProductFilterProvider';

/**
 * 대분류 아래 두 화면이 함께 쓰는 껍데기입니다.
 *   /category/clothing        (대분류)
 *   /category/clothing/tops   (소분류)
 *
 * ★★ 이 레이아웃이 있는 이유는 딱 하나 — 소분류를 눌러도 필터가 살아 있게 하기
 *   Next 는 페이지가 바뀌어도 공통 레이아웃은 그대로 둡니다. 그래서 필터를
 *   여기에 담아 두면 소분류를 옮겨도 브랜드·성별·정렬이 새로 뜨지 않습니다.
 *   전에는 필터가 목록 안에 있어서, 소분류를 누를 때마다 ALL 로 돌아갔다가
 *   주소를 읽고 되돌아오느라 밑줄이 깜빡였습니다.
 *
 * ★ 일부러 아무것도 불러오지 않습니다. 레이아웃에서 데이터를 읽으면 그만큼
 *   두 화면 모두에서 다시 읽습니다. 필요한 것은 각 페이지가 이미 읽고 있습니다.
 */
export default function CategoryLayout({ children }: { children: ReactNode }) {
  return <ProductFilterProvider>{children}</ProductFilterProvider>;
}
