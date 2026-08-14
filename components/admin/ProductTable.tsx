'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  deleteProductAction,
  duplicateProductAction,
  patchProductAction,
} from '@/app/admin/actions';
import { brandLabel, type Brand } from '@/lib/brands';
import { findCategory, findSubCategory, type Category } from '@/lib/categories';
import { formatPrice } from '@/lib/product-utils';
import type { Product } from '@/lib/types';

type ProductTableProps = {
  products: Product[];
  /** 분류·브랜드는 DB 에서 오므로 서버 페이지가 읽어 넘겨 줍니다. */
  categories: Category[];
  brands: Brand[];
};

function categoryLabel(categories: Category[], product: Product): string {
  const category = findCategory(categories, product.categorySlug);
  const sub = product.subCategorySlug
    ? findSubCategory(categories, product.categorySlug, product.subCategorySlug)
    : undefined;
  return [category?.nameKo ?? product.categorySlug, sub?.nameKo].filter(Boolean).join(' · ');
}

export default function ProductTable({ products, categories, brands }: ProductTableProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(
    null
  );

  /** 목록에서 바로 저장 — 상세 화면에 들어가지 않아도 됩니다. */
  const patch = (
    id: string,
    changes: Parameters<typeof patchProductAction>[1],
    label: string
  ) => {
    setBusyId(id);
    startTransition(async () => {
      const result = await patchProductAction(id, changes);
      setBusyId(null);
      if (result.ok) {
        setMessage({ tone: 'ok', text: `${label} 저장했습니다.` });
        router.refresh();
      } else {
        setMessage({ tone: 'error', text: result.error });
      }
    });
  };

  const handleDuplicate = (product: Product) => {
    setBusyId(product.id);
    startTransition(async () => {
      const result = await duplicateProductAction(product.id);
      setBusyId(null);
      if (result.ok) {
        setMessage({
          tone: 'ok',
          text: '복제했습니다. 사본은 숨김 상태로 만들어집니다.',
        });
        router.push(`/admin/products/${result.data.id}`);
      } else {
        setMessage({ tone: 'error', text: result.error });
      }
    });
  };

  const handleDelete = (product: Product) => {
    // 확인 창 필수
    const confirmed = window.confirm(
      `"${product.name}" 을(를) 삭제합니다.\n되돌릴 수 없습니다. 계속할까요?`
    );
    if (!confirmed) return;

    setBusyId(product.id);
    startTransition(async () => {
      const result = await deleteProductAction(product.id);
      setBusyId(null);
      if (result.ok) {
        setMessage({ tone: 'ok', text: '삭제했습니다.' });
        router.refresh();
      } else {
        setMessage({ tone: 'error', text: result.error });
      }
    });
  };

  if (products.length === 0) {
    return (
      <div className="admin-card p-10 text-center">
        <p className="text-[15px] text-slate-700">조건에 맞는 상품이 없습니다.</p>
        <Link href="/admin/products/new" className="admin-btn-primary mt-4">
          + 새 상품 등록
        </Link>
      </div>
    );
  }

  return (
    <div>
      {message ? (
        <p
          role="status"
          className={`mb-3 rounded-md px-3 py-2 text-[13px] ${
            message.tone === 'ok'
              ? 'bg-green-50 text-green-800'
              : 'bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </p>
      ) : null}

      <div className="admin-card overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-left text-[14px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[13px] text-slate-600">
              <th scope="col" className="px-3 py-2.5 font-medium">
                썸네일
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                상품명
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                브랜드
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                카테고리
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                가격
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                진열순서
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                상태
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                작업
              </th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const busy = pending && busyId === product.id;
              return (
                <tr
                  key={product.id}
                  className={`border-b border-slate-100 align-middle ${
                    busy ? 'opacity-50' : ''
                  }`}
                >
                  <td className="px-3 py-2.5">
                    <div className="h-[52px] w-[40px] overflow-hidden rounded bg-slate-100">
                      {product.thumbnails[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={product.thumbnails[0]}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </div>
                  </td>

                  <td className="px-3 py-2.5">
                    <Link
                      href={`/admin/products/${product.id}`}
                      className="font-medium text-blue-700 hover:underline"
                    >
                      {product.name}
                    </Link>
                    <p className="text-[12px] text-slate-500">/{product.slug}</p>
                  </td>

                  <td className="px-3 py-2.5 text-slate-700">
                    {product.brandSlug ? brandLabel(brands, product.brandSlug) : '—'}
                  </td>

                  <td className="px-3 py-2.5 text-slate-700">{categoryLabel(categories, product)}</td>

                  <td className="px-3 py-2.5">
                    {/* 가격 — 즉시 저장 */}
                    <input
                      type="number"
                      min={0}
                      step={100}
                      defaultValue={product.price}
                      aria-label={`${product.name} 가격`}
                      onBlur={(event) => {
                        const next = Number(event.target.value);
                        if (!Number.isFinite(next) || next < 0) {
                          event.target.value = String(product.price);
                          return;
                        }
                        if (next !== product.price) patch(product.id, { price: next }, '가격을');
                      }}
                      className="admin-input w-[110px] px-2 py-1.5 tabular-nums"
                    />
                  </td>

                  <td className="px-3 py-2.5">
                    {/* 진열순서 — 작을수록 앞 */}
                    <input
                      type="number"
                      step={1}
                      defaultValue={product.displayOrder}
                      aria-label={`${product.name} 진열순서`}
                      onBlur={(event) => {
                        const next = Number(event.target.value);
                        if (!Number.isFinite(next)) {
                          event.target.value = String(product.displayOrder);
                          return;
                        }
                        if (next !== product.displayOrder) {
                          patch(product.id, { displayOrder: next }, '진열순서를');
                        }
                      }}
                      className="admin-input w-[80px] px-2 py-1.5 tabular-nums"
                    />
                  </td>

                  <td className="px-3 py-2.5">
                    <div className="flex flex-col gap-1.5">
                      <label className="flex items-center gap-1.5 text-[13px] text-slate-700">
                        <input
                          type="checkbox"
                          checked={product.isVisible}
                          onChange={(event) =>
                            patch(product.id, { isVisible: event.target.checked }, '노출을')
                          }
                          className="h-4 w-4"
                        />
                        노출
                      </label>
                      <label className="flex items-center gap-1.5 text-[13px] text-slate-700">
                        <input
                          type="checkbox"
                          checked={product.isSoldOut}
                          onChange={(event) =>
                            patch(product.id, { isSoldOut: event.target.checked }, '품절을')
                          }
                          className="h-4 w-4"
                        />
                        품절
                      </label>
                    </div>
                  </td>

                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      <Link
                        href={`/admin/products/${product.id}`}
                        className="admin-btn px-2.5 py-1.5"
                      >
                        수정
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDuplicate(product)}
                        disabled={busy}
                        className="admin-btn px-2.5 py-1.5"
                      >
                        복제
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(product)}
                        disabled={busy}
                        className="admin-btn-danger px-2.5 py-1.5"
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[13px] text-slate-500">
        가격·진열순서는 칸을 고친 뒤 다른 곳을 누르면 바로 저장됩니다. 노출·품절 체크는
        누르는 즉시 저장되고 쇼핑몰에 반영됩니다.
      </p>
    </div>
  );
}
