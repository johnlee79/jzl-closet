import Link from 'next/link';
import { requireMember } from '@/lib/auth';
import MemberOnlyNotice from '@/components/MemberOnlyNotice';
import { getInquiriesOfUser } from '@/lib/inquiries';
import { formatDate } from '@/lib/format';
import { inquiryCategoryLabel, inquiryStatusLabel } from '@/lib/inquiry-status';

export const metadata = { title: '문의 내역' };

export default async function MypageInquiriesPage() {
  /*
   * ★ 비로그인이면 로그인 화면으로 보냅니다. (로그인 뒤 여기로 돌아옵니다)
   *   로그인은 했지만 쇼핑몰 회원이 아니면 안내 화면을 그립니다.
   *   예전에는 둘 다 null 이라 본문이 통째로 빈 화면이 나왔습니다.
   */
  const member = await requireMember('/mypage/inquiries');
  if (!member) return <MemberOnlyNotice />;

  const inquiries = await getInquiriesOfUser(member.user.id);

  return (
    <section aria-labelledby="inquiries-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="inquiries-heading" className="font-serif text-[22px] text-ink">
          문의 내역
        </h2>
        <Link href="/inquiry/new" className="btn-secondary">
          1:1 문의하기
        </Link>
      </div>

      {inquiries.length === 0 ? (
        <div className="mt-8 border-t border-stone py-14">
          <p className="text-[17px] leading-relaxed text-ink">문의하신 내역이 없습니다.</p>
          <p className="mt-2 text-[16px] leading-relaxed text-muted">
            궁금한 점이 있으시면 언제든 남겨 주세요. 영업일 기준 1~2일 안에 답변드립니다.
          </p>
        </div>
      ) : (
        <ul className="mt-8 border-t border-stone">
          {inquiries.map((inquiry) => (
            <li key={inquiry.id} className="border-b border-stone py-5">
              <Link href={`/mypage/inquiries/${inquiry.id}`} className="block">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[14px] tracking-[0.14em] text-muted">
                    {inquiryCategoryLabel(inquiry.category)} · {inquiry.inquiryNo}
                  </span>
                  <span className="text-[14px] text-muted">
                    {formatDate(inquiry.createdAt)}
                  </span>
                </div>
                <p className="mt-2 font-serif text-[18px] leading-snug text-ink">
                  {inquiry.title}
                </p>
                <p className="mt-1 text-[15px] text-muted">
                  {inquiryStatusLabel(inquiry.status)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
