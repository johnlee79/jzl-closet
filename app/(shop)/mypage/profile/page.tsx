import ProfileForm from '@/components/ProfileForm';
import { requireMember } from '@/lib/auth';
import MemberOnlyNotice from '@/components/MemberOnlyNotice';
import { providerLabel } from '@/lib/profiles';

export const metadata = { title: '회원정보 수정' };

export default async function MypageProfilePage() {
  /*
   * ★ 비로그인이면 로그인 화면으로 보냅니다. (로그인 뒤 여기로 돌아옵니다)
   *   로그인은 했지만 쇼핑몰 회원이 아니면 안내 화면을 그립니다.
   *   예전에는 둘 다 null 이라 본문이 통째로 빈 화면이 나왔습니다.
   */
  const member = await requireMember('/mypage/profile');
  if (!member) return <MemberOnlyNotice />;

  return (
    <ProfileForm
      email={member.user.email}
      provider={member.profile.provider}
      providerName={providerLabel(member.profile.provider)}
      initial={{
        name: member.profile.name,
        phone: member.profile.phone,
        postcode: member.profile.postcode,
        address1: member.profile.address1,
        address2: member.profile.address2,
        agreeMarketing: member.profile.agreeMarketing,
        birthday: member.profile.birthday,
      }}
    />
  );
}
