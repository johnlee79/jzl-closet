import ProfileForm from '@/components/ProfileForm';
import { getActiveMember } from '@/lib/auth';

export const metadata = { title: '회원정보 수정' };

export default async function MypageProfilePage() {
  const member = await getActiveMember();
  if (!member) return null;

  return (
    <ProfileForm
      email={member.user.email}
      initial={{
        name: member.profile.name,
        phone: member.profile.phone,
        postcode: member.profile.postcode,
        address1: member.profile.address1,
        address2: member.profile.address2,
        agreeMarketing: member.profile.agreeMarketing,
      }}
    />
  );
}
