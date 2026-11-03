'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  deleteProductAction,
  duplicateProductAction,
  getProductDeleteImpactAction,
  patchProductAction,
  type ProductDeleteImpact,
} from '@/app/admin/actions';
import { brandLabel, type Brand } from '@/lib/brands';
import { findCategory, findSubCategory, type Category } from '@/lib/categories';
import { judgeMargin, marginToneClass } from '@/lib/margin';
import { formatPrice } from '@/lib/product-utils';
import type { Product } from '@/lib/types';

type ProductTableProps = {
  products: Product[];
  /** 분류·브랜드는 DB 에서 오므로 서버 페이지가 읽어 넘겨 줍니다. */
  categories: Category[];
  brands: Brand[];
  /** 조건이 걸려 있는지 — 빈 목록일 때 안내 문구가 달라집니다. */
  hasFilter?: boolean;
  /** 조건을 모두 지운 주소 */
  clearHref?: string;
  /** 조건을 지웠을 때 나올 상품 수 */
  totalAll?: number;
  /**
   * 상품별 원가 (product_costs 테이블에서 가져옴).
   * ★ 손님 유출 금지라 service_role 로만 읽습니다. 이 컴포넌트는 관리자 전용
   *   화면에서만 쓰이므로 숫자가 노출돼도 괜찮습니다. (손님 쪽 코드는 import 안 함)
   */
  costByProductId?: Record<string, number>;
};

function categoryLabel(categories: Category[], product: Product): string {
  const category = findCategory(categories, product.categorySlug);
  const sub = product.subCategorySlug
    ? findSubCategory(categories, product.categorySlug, product.subCategorySlug)
    : undefined;
  return [category?.nameKo ?? product.categorySlug, sub?.nameKo].filter(Boolean).join(' · ');
}

export default function ProductTable({
  products,
  categories,
  brands,
  hasFilter = false,
  clearHref = '/admin/products',
  totalAll = 0,
  costByProductId = {},
}: ProductTableProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(
    null
  );
  /** 후기가 붙은 상품을 지울 때 띄우는 대화창 */
  const [deleteDialog, setDeleteDialog] = useState<{
    product: Product;
    impact: ProductDeleteImpact;
    choice: 'move' | 'delete';
    moveToId: string;
  } | null>(null);

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

  const runDelete = (
    product: Product,
    options?: { reviews?: 'move' | 'delete'; moveToId?: string }
  ) => {
    setBusyId(product.id);
    startTransition(async () => {
      const result = await deleteProductAction(product.id, options);
      setBusyId(null);
      if (result.ok) {
        const { movedReviews, deletedReviews } = result.data;
        setDeleteDialog(null);
        setMessage({
          tone: 'ok',
          text:
            '삭제했습니다.' +
            (movedReviews ? ` 후기 ${movedReviews}건은 옮겼습니다.` : '') +
            (deletedReviews ? ` 후기 ${deletedReviews}건도 같이 지웠습니다.` : ''),
        });
        router.refresh();
      } else {
        setMessage({ tone: 'error', text: result.error });
      }
    });
  };

  /**
   * ★ 지우기 전에 붙은 후기·주문을 먼저 셉니다 (2026-11-03).
   *   · 주문이 있으면 지우지 않고 숨김을 권합니다.
   *   · 후기가 있으면 「다른 상품으로 옮기기 / 같이 지우기 / 취소」 대화창을 띄웁니다.
   *   · 아무것도 없으면 예전처럼 확인 창 하나.
   */
  const handleDelete = (product: Product) => {
    setBusyId(product.id);
    startTransition(async () => {
      const check = await getProductDeleteImpactAction(product.id);
      setBusyId(null);
      if (!check.ok) {
        setMessage({ tone: 'error', text: check.error });
        return;
      }
      const impact = check.data;
      if (impact.orderLines > 0) {
        const hide = window.confirm(
          `"${product.name}" 에는 주문 ${impact.orderLines}줄이 붙어 있어 지울 수 없습니다.\n` +
            '대신 숨김(노출 끄기)으로 둘까요?'
        );
        if (hide) patch(product.id, { isVisible: false }, '노출을');
        return;
      }
      if (impact.reviews.total > 0) {
        const suggested = impact.targets.find((target) => target.suggested);
        setDeleteDialog({
          product,
          impact,
          choice: 'move',
          moveToId: suggested?.id ?? '',
        });
        return;
      }
      const confirmed = window.confirm(
        `"${product.name}" 을(를) 삭제합니다.\n되돌릴 수 없습니다. 계속할까요?`
      );
      if (confirmed) runDelete(product);
    });
  };

  if (products.length === 0) {
    return (
      <div className="admin-card p-10 text-center">
        {/*
          ★ 조건 때문에 비어 있는 것과 상품 자체가 없는 것은 전혀 다른 상황입니다.
            조건 때문이라면 지우는 버튼을 바로 옆에 놓아, 검색창까지
            올라가서 하나씩 되돌리지 않아도 되게 합니다.
        */}
        <p className="text-[17px] text-slate-700">
          {hasFilter ? '조건에 맞는 상품이 없습니다.' : '아직 등록된 상품이 없습니다.'}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {hasFilter ? (
            <Link href={clearHref} className="admin-btn" prefetch={false}>
              조건 지우기{totalAll > 0 ? ` (전체 ${totalAll}개 보기)` : ''}
            </Link>
          ) : null}
          <Link href="/admin/products/new" className="admin-btn-primary" prefetch={false}>
            + 새 상품 등록
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      {message ? (
        <p
          role="status"
          className={`mb-3 rounded-md px-3 py-2 text-[15px] ${
            message.tone === 'ok'
              ? 'bg-green-50 text-green-800'
              : 'bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </p>
      ) : null}

      <div className="admin-card overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-left text-[16px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[15px] text-slate-600">
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
              {/*
                ★ 원가·마진 — 뉴욕트렌딕 단가표에서 들여온 값입니다. 손님 유출 금지라
                   products 테이블이 아니라 product_costs 전용 테이블에서 읽습니다.
                   「카드 수수료 제외 전」 마진입니다.
              */}
              <th scope="col" className="px-3 py-2.5 font-medium" title="단가표 원가 (부가세 포함)">
                원가
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium" title="판매가 − 원가. 카드 수수료 제외 전">
                마진
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
                    prefetch={false}
                    >
                      {product.name}
                    </Link>
                    <p className="text-[14px] text-slate-500">/{product.slug}</p>
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

                  {/* 원가 — 뉴욕 단가표에서 자동으로 들어온 숫자. 여기선 읽기 전용. */}
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                    {costByProductId[product.id] != null ? (
                      `${costByProductId[product.id].toLocaleString()}원`
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>

                  {/* 마진 — judgeMargin 이 역마진·너무 높음·너무 낮음을 공통 기준으로 판정 */}
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {(() => {
                      const judge = judgeMargin(product.price, costByProductId[product.id]);
                      if (judge.kind === 'none')
                        return <span className="text-slate-400">—</span>;
                      return (
                        <span className={marginToneClass(judge)} title={judge.kind !== 'ok' ? judge.reason : undefined}>
                          {judge.margin.toLocaleString()}원
                          <span className="ml-1 text-[12px] text-slate-500">({judge.rate}%)</span>
                          {judge.kind !== 'ok' ? (
                            <span className="ml-1 text-[11px] text-red-700">⚠</span>
                          ) : null}
                        </span>
                      );
                    })()}
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
                      <label className="flex items-center gap-1.5 text-[15px] text-slate-700">
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
                      <label className="flex items-center gap-1.5 text-[15px] text-slate-700">
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
                      prefetch={false}
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

      {deleteDialog ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="w-full max-w-lg rounded-md bg-white p-5 shadow-xl">
            <h2 id="delete-dialog-title" className="text-[18px] font-semibold text-slate-900">
              후기가 붙은 상품입니다
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-slate-700">
              「{deleteDialog.product.name}」 에 후기{' '}
              <strong>{deleteDialog.impact.reviews.total}건</strong>이 붙어 있습니다
              {deleteDialog.impact.reviews.imported > 0
                ? ` (외부에서 가져온 것 ${deleteDialog.impact.reviews.imported}건` +
                  (deleteDialog.impact.reviews.own > 0
                    ? `, 우리 손님 ${deleteDialog.impact.reviews.own}건)`
                    : ')')
                : ''}
              . 상품만 지우면 후기는 손님 화면 어디에도 안 보이고, 같은 외부 후기를 다시
              가져올 수도 없게 됩니다.
            </p>

            <fieldset className="mt-4 flex flex-col gap-3 text-[15px]">
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="review-choice"
                  checked={deleteDialog.choice === 'move'}
                  onChange={() => setDeleteDialog({ ...deleteDialog, choice: 'move' })}
                  className="mt-1"
                />
                <span className="flex-1">
                  후기를 다른 상품으로 옮기기
                  <select
                    value={deleteDialog.moveToId}
                    onChange={(event) =>
                      setDeleteDialog({
                        ...deleteDialog,
                        choice: 'move',
                        moveToId: event.target.value,
                      })
                    }
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-[15px]"
                  >
                    <option value="">— 옮길 상품 고르기 —</option>
                    {deleteDialog.impact.targets.map((target) => (
                      <option key={target.id} value={target.id}>
                        {target.suggested ? '★ ' : ''}
                        {target.name} ({target.slug})
                      </option>
                    ))}
                  </select>
                  {deleteDialog.impact.targets.some((target) => target.suggested) ? (
                    <span className="mt-1 block text-[13px] text-slate-500">
                      ★ 는 같은 원본 상품번호 또는 같은 이름인 상품입니다.
                    </span>
                  ) : null}
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="review-choice"
                  checked={deleteDialog.choice === 'delete'}
                  onChange={() => setDeleteDialog({ ...deleteDialog, choice: 'delete' })}
                  className="mt-1"
                />
                <span>후기도 같이 지우기 (되돌릴 수 없습니다)</span>
              </label>
            </fieldset>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteDialog(null)}
                disabled={pending}
                className="admin-btn"
              >
                취소
              </button>
              <button
                type="button"
                disabled={pending || (deleteDialog.choice === 'move' && !deleteDialog.moveToId)}
                onClick={() =>
                  runDelete(deleteDialog.product, {
                    reviews: deleteDialog.choice,
                    moveToId:
                      deleteDialog.choice === 'move' ? deleteDialog.moveToId : undefined,
                  })
                }
                className="admin-btn-primary"
              >
                {pending
                  ? '처리 중…'
                  : deleteDialog.choice === 'move'
                    ? '후기 옮기고 상품 삭제'
                    : '후기와 함께 상품 삭제'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <p className="mt-3 text-[15px] text-slate-500">
        가격·진열순서는 칸을 고친 뒤 다른 곳을 누르면 바로 저장됩니다. 노출·품절 체크는
        누르는 즉시 저장되고 쇼핑몰에 반영됩니다.
      </p>
    </div>
  );
}
